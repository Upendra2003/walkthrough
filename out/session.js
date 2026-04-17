"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalkthroughSession = void 0;
const vscode = require("vscode");
const narrate_1 = require("./narrate");
const audioPlayer_1 = require("./audioPlayer");
// ── Subtitle animation constants ──────────────────────────────────────────────
/**
 * Fallback word interval when we cannot derive duration from the audio buffer
 * (Q&A path, deep-dive chunks, error cases).
 */
const SUBTITLE_WORD_MS_FALLBACK = 420;
// ---------------------------------------------------------------------------
// WalkthroughSession
// ---------------------------------------------------------------------------
class WalkthroughSession {
    constructor(editor, blocks, fileContext, callbacks) {
        this.editor = editor;
        this.blocks = blocks;
        this.fileContext = fileContext;
        this.index = 0;
        this.stopped = false;
        this.paused = false;
        this.fileSkipRequested = false;
        // ── Control signals ────────────────────────────────────────────────────────
        this.skipResolve = null;
        this.pendingSkip = null;
        this.resumeResolve = null;
        this.currentPlayer = null;
        // ── Deep Dive ──────────────────────────────────────────────────────────────
        this.deepDiveActive = false;
        this.pendingDeepDive = false;
        // ── Prefetch / narration cache ────────────────────────────────────────────
        this.prefetchCache = new Map();
        this.narrationCache = new Map();
        // ── Subtitle animation handle ─────────────────────────────────────────────
        // Returning () => number so cancelSubtitleAnimation() can report the last
        // displayed word index to the pause handler.
        this.subtitleStopFn = null;
        // Word index saved at the moment of pause — handed back to the next
        // startSubtitleAnimation() call so the subtitle resumes mid-sentence.
        this.subtitleResumeIndex = 0;
        this.log = callbacks.log;
        this.setStatus = callbacks.setStatus;
        this.clearStatus = callbacks.clearStatus;
        this.setPaused = callbacks.setPaused;
        this.showSubtitle = callbacks.showSubtitle;
        this.showSubtitleWords = callbacks.showSubtitleWords;
        this.hideSubtitle = callbacks.hideSubtitle;
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: "rgba(255, 220, 0, 0.28)",
            isWholeLine: true,
        });
        this.lineDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: "rgba(255, 140, 0, 0.30)",
            isWholeLine: true,
            borderWidth: "0 0 0 3px",
            borderStyle: "solid",
            borderColor: "rgba(255, 140, 0, 0.85)",
        });
        this.qaDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: "rgba(0, 120, 255, 0.18)",
            isWholeLine: true,
            borderWidth: "0 0 0 3px",
            borderStyle: "solid",
            borderColor: "rgba(0, 120, 255, 0.75)",
        });
    }
    // ── Public API ────────────────────────────────────────────────────────────
    async run() {
        this.log(`\n── Starting walkthrough (${this.blocks.length} blocks) ──`);
        this.kickPrefetch(0);
        while (!this.stopped && this.index < this.blocks.length) {
            const dir = await this.presentBlock(this.index);
            if (this.stopped)
                break;
            this.index = dir === "prev"
                ? Math.max(0, this.index - 1)
                : this.index + 1;
        }
        this.cleanup();
        this.log("── Walkthrough ended ──");
        if (this.fileSkipRequested)
            return "file-skipped";
        if (this.stopped)
            return "stopped";
        return "done";
    }
    togglePause() {
        if (this.stopped)
            return;
        this.paused = !this.paused;
        if (this.paused) {
            this.log("  ⏸  Paused");
            this.currentPlayer?.stop();
            // Save the word index BEFORE the animation closure is cleared,
            // so playWithControls can resume from this exact word on the next loop.
            this.subtitleResumeIndex = this.cancelSubtitleAnimation();
            this.setPaused?.(true);
        }
        else {
            this.log("  ▶  Resumed");
            this.editor.setDecorations(this.qaDecorationType, []);
            this.setPaused?.(false);
            const r = this.resumeResolve;
            this.resumeResolve = null;
            r?.();
        }
    }
    next() { this.log("  ⏭  Skip next"); this.sendSignal("next"); }
    prev() { this.log("  ⏮  Skip prev"); this.sendSignal("prev"); }
    skipLine() {
        if (this.stopped)
            return;
        this.log(this.deepDiveActive ? "  ⏩  Skip line" : "  ⏭  Skip block");
        this.sendSignal("next");
    }
    skipFile() {
        if (this.stopped)
            return;
        this.log("  ⏭  Skip file");
        this.fileSkipRequested = true;
        this.stop();
    }
    deepDive() {
        if (this.stopped || this.deepDiveActive)
            return;
        this.log("  🔍  Deep dive");
        this.pendingDeepDive = true;
        if (this.skipResolve) {
            const r = this.skipResolve;
            this.skipResolve = null;
            this.currentPlayer?.stop();
            r("next");
        }
        else if (this.paused) {
            this.paused = false;
            this.editor.setDecorations(this.qaDecorationType, []);
            const r = this.resumeResolve;
            this.resumeResolve = null;
            r?.();
        }
    }
    async askQuestion() {
        if (this.stopped)
            return;
        const wasPaused = this.paused;
        if (!wasPaused)
            this.togglePause();
        const question = await vscode.window.showInputBox({
            prompt: "Ask about this codebase...",
            placeHolder: "e.g. What does the auth middleware do?",
            ignoreFocusOut: true,
        });
        if (!question) {
            if (!wasPaused)
                this.togglePause();
            return;
        }
        this.log(`\n── Q&A: "${question}" ──`);
        this.setStatus("$(search) Searching codebase...");
        this.showSubtitle?.("🔍  Searching your codebase...", true);
        try {
            const { answer, topLabel, topFile } = await (0, narrate_1.queryCodebase)(question);
            this.log(`[Q&A] Answer: ${answer}`);
            this.log(`[Q&A] Top match: ${topLabel}${topFile ? ` (${topFile})` : ""}`);
            // Highlight the most relevant block in the editor
            const matchBlock = this.blocks.find(b => b.label === topLabel);
            if (matchBlock) {
                const range = new vscode.Range(new vscode.Position(matchBlock.startLine, 0), new vscode.Position(matchBlock.endLine, Number.MAX_SAFE_INTEGER));
                this.editor.setDecorations(this.qaDecorationType, [range]);
                this.editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
            // Speak the answer with subtitle animation
            this.setStatus("$(megaphone) Q&A — speaking answer...");
            this.startSubtitleAnimation(answer);
            try {
                const audio = await (0, narrate_1.generateAudio)(answer);
                if (!this.stopped) {
                    const player = new audioPlayer_1.AudioPlayer();
                    this.currentPlayer = player;
                    await player.play(audio);
                    this.currentPlayer = null;
                }
            }
            catch (ttsErr) {
                const msg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
                this.log(`[Q&A] TTS error: ${msg}`);
                // No audio — subtitle stays visible for a moment so user can read it
                await new Promise(r => setTimeout(r, 4000));
            }
            finally {
                this.cancelSubtitleAnimation();
                this.hideSubtitle?.();
            }
            this.setStatus("$(comment-discussion) Q&A done — Space to resume");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.log(`[Q&A] ERROR: ${msg}`);
            this.showSubtitle?.(`⚠️  ${msg.slice(0, 120)}`);
            this.setStatus("$(warning) Q&A failed — Space to resume");
        }
    }
    stop() {
        if (this.stopped)
            return;
        this.stopped = true;
        this.log("  ⏹  Stopped");
        this.editor.setDecorations(this.qaDecorationType, []);
        this.editor.setDecorations(this.lineDecorationType, []);
        this.sendSignal("next");
        const r = this.resumeResolve;
        this.resumeResolve = null;
        r?.();
    }
    // ── Prefetch ──────────────────────────────────────────────────────────────
    kickPrefetch(i) {
        if (i < 0 || i >= this.blocks.length || this.prefetchCache.has(i))
            return;
        this.prefetchCache.set(i, this.fetchAudio(i));
    }
    async fetchAudio(i) {
        const { label, code } = this.blocks[i];
        const tag = `[${i + 1}/${this.blocks.length}] ${label}`;
        try {
            this.log(`${tag} → fetching narration...`);
            const ctx = (i === 0 && this.fileContext) ? this.fileContext : undefined;
            const text = await (0, narrate_1.fetchNarration)(label, code, ctx);
            this.narrationCache.set(i, text);
            this.log(`${tag} → narration ready`);
            this.log(`${tag} → generating audio...`);
            const buf = await (0, narrate_1.generateAudio)(text);
            this.log(`${tag} → audio ready (${(buf.length / 1024).toFixed(1)} KB)`);
            return buf;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.log(`${tag} → ERROR: ${msg}`);
            return null;
        }
    }
    // ── Block presentation ────────────────────────────────────────────────────
    async presentBlock(i) {
        const block = this.blocks[i];
        const tag = `[${i + 1}/${this.blocks.length}] ${block.label}`;
        this.kickPrefetch(i + 1);
        this.setStatus(`$(sync~spin) ${tag}`);
        this.showSubtitle?.("⏳  Preparing narration...", true);
        const audio = await this.prefetchCache.get(i);
        if (this.stopped)
            return "next";
        const narration = this.narrationCache.get(i) ?? "";
        if (this.pendingDeepDive) {
            this.pendingDeepDive = false;
            this.applyBlockDecoration(block);
            await this.runDeepDive(block, tag);
            this.editor.setDecorations(this.decorationType, []);
            this.clearSubtitle();
            return "next";
        }
        if (this.pendingSkip !== null) {
            const dir = this.pendingSkip;
            this.pendingSkip = null;
            this.clearSubtitle();
            return dir;
        }
        this.applyBlockDecoration(block);
        let dir;
        if (audio !== null) {
            this.setStatus(`$(megaphone) ${tag}`);
            this.log(`${tag} → playing...`);
            dir = await this.playWithControls(audio, narration);
            this.log(`${tag} → done`);
        }
        else {
            this.setStatus(`$(warning) ${tag} — TTS failed`);
            this.log(`${tag} → fallback 2s`);
            if (narration)
                this.showSubtitle?.(narration);
            dir = await this.fallbackWait(2000);
        }
        this.editor.setDecorations(this.decorationType, []);
        this.clearSubtitle();
        if (this.pendingDeepDive && !this.stopped) {
            this.pendingDeepDive = false;
            this.applyBlockDecoration(block);
            await this.runDeepDive(block, tag);
            this.editor.setDecorations(this.decorationType, []);
            this.clearSubtitle();
            return "next";
        }
        return dir;
    }
    // ── Deep Dive ─────────────────────────────────────────────────────────────
    async runDeepDive(block, blockTag) {
        this.deepDiveActive = true;
        const ddTag = `[deep dive] ${block.label}`;
        this.setStatus(`$(sync~spin) ${ddTag} — preparing...`);
        this.showSubtitle?.("⏳  Preparing deep dive...", true);
        this.log(`${ddTag} → fetching line narrations...`);
        let narrations;
        try {
            narrations = await (0, narrate_1.fetchDeepDiveNarrations)(block);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.log(`${ddTag} → ERROR: ${msg}`);
            if (e instanceof Error && e.stack)
                this.log(e.stack);
            vscode.window.showWarningMessage(`Walkthrough Deep Dive failed: ${msg.slice(0, 120)}`);
            this.deepDiveActive = false;
            this.clearSubtitle();
            return;
        }
        if (narrations.length === 0) {
            this.log(`${ddTag} → no narrations returned`);
            vscode.window.showWarningMessage("Walkthrough Deep Dive: no narrations returned.");
            this.deepDiveActive = false;
            this.clearSubtitle();
            return;
        }
        this.log(`${ddTag} → ${narrations.length} chunk(s)`);
        const totalLines = block.endLine - block.startLine + 1;
        const N = narrations.length;
        for (let j = 0; j < N && !this.stopped; j++) {
            const lineStart = block.startLine + Math.floor(j * totalLines / N);
            const lineEnd = block.startLine + Math.floor((j + 1) * totalLines / N) - 1;
            const lineRange = new vscode.Range(new vscode.Position(lineStart, 0), new vscode.Position(Math.min(lineEnd, block.endLine), Number.MAX_SAFE_INTEGER));
            this.editor.setDecorations(this.lineDecorationType, [lineRange]);
            this.editor.revealRange(lineRange, vscode.TextEditorRevealType.InCenter);
            const chunkTag = `${ddTag} [${j + 1}/${N}]`;
            this.setStatus(`$(megaphone) ${chunkTag}`);
            this.log(`${chunkTag}: "${narrations[j]}"`);
            try {
                const audio = await (0, narrate_1.generateAudio)(narrations[j]);
                if (this.stopped)
                    break;
                await this.playWithControls(audio, narrations[j]);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.log(`${chunkTag} → TTS error: ${msg}`);
                this.showSubtitle?.(narrations[j]);
                await this.fallbackWait(600);
            }
            this.editor.setDecorations(this.lineDecorationType, []);
        }
        this.deepDiveActive = false;
        this.clearSubtitle();
        this.log(`${ddTag} → complete`);
        void blockTag;
    }
    // ── Subtitle animation ────────────────────────────────────────────────────
    /**
     * Derive per-word interval from a WAV audio buffer.
     *
     * Reads `byteRate` (offset 28) and `dataChunkSize` (offset 40) from the
     * standard PCM-WAV header to get the exact audio duration, then divides by
     * word count.  Falls back to `SUBTITLE_WORD_MS_FALLBACK` on any error.
     *
     * Clamped to [80, 900] ms to avoid runaway values from malformed headers.
     */
    estimateWordIntervalMs(audio, wordCount) {
        if (wordCount === 0)
            return SUBTITLE_WORD_MS_FALLBACK;
        try {
            if (audio.length < 44)
                throw new Error("too short");
            const byteRate = audio.readUInt32LE(28); // bytes per second
            const dataSize = audio.readUInt32LE(40); // PCM data bytes
            if (byteRate === 0)
                throw new Error("byteRate=0");
            const durationMs = (dataSize / byteRate) * 1000;
            return Math.min(900, Math.max(80, durationMs / wordCount));
        }
        catch {
            return SUBTITLE_WORD_MS_FALLBACK;
        }
    }
    /**
     * Kick off a word-by-word subtitle animation.
     *
     * @param text           Full narration text for this block.
     * @param fromIndex      Word to start from (0 on first play, saved index on resume).
     * @param wordIntervalMs Per-word step in ms — derived from audio duration so the
     *                       subtitle advances in perfect lock-step with the TTS voice.
     *
     * The closure captures `activeIndex` so that cancelSubtitleAnimation() can
     * return it, letting the pause handler snapshot exactly which word was last
     * shown before the audio was killed.
     */
    startSubtitleAnimation(text, fromIndex = 0, wordIntervalMs = SUBTITLE_WORD_MS_FALLBACK) {
        this.cancelSubtitleAnimation();
        const words = text.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0)
            return;
        let stopped = false;
        let activeIndex = Math.min(fromIndex, words.length - 1);
        const advance = () => {
            if (stopped || this.stopped)
                return;
            if (this.showSubtitleWords) {
                this.showSubtitleWords(words, activeIndex, wordIntervalMs);
            }
            else {
                this.showSubtitle?.(words.slice(0, activeIndex + 1).join(" "));
            }
            if (activeIndex < words.length - 1) {
                activeIndex++;
                setTimeout(advance, wordIntervalMs);
            }
        };
        advance();
        this.subtitleStopFn = () => { stopped = true; return activeIndex; };
    }
    /** Cancel the running animation and return the last displayed word index. */
    cancelSubtitleAnimation() {
        const idx = this.subtitleStopFn ? this.subtitleStopFn() : 0;
        this.subtitleStopFn = null;
        return idx;
    }
    clearSubtitle() {
        this.cancelSubtitleAnimation();
        this.hideSubtitle?.();
    }
    // ── Playback ──────────────────────────────────────────────────────────────
    /**
     * Play `audio` with full pause / skip / deep-dive control.
     *
     * Pause/resume word fix:
     *   togglePause() kills the audio process → play() resolves "next" → paused=true.
     *   Before that, togglePause() calls cancelSubtitleAnimation() which snapshots
     *   the last displayed word index into this.subtitleResumeIndex.
     *   On the next loop iteration (after waitForResume), startSubtitleAnimation()
     *   is called with that saved index so the subtitle continues mid-sentence.
     *   The index is reset to 0 at the top of this method so each new block/chunk
     *   starts fresh.
     */
    async playWithControls(audio, subtitleText) {
        // Reset resume position for each new audio clip (new block or deep-dive chunk).
        this.subtitleResumeIndex = 0;
        // Derive per-word interval from the actual WAV duration so the subtitle
        // advances in perfect lock-step with the TTS voice — no guessing.
        const words = subtitleText.trim().split(/\s+/).filter(Boolean);
        const wordIntervalMs = this.estimateWordIntervalMs(audio, words.length);
        for (;;) {
            await this.waitForResume();
            if (this.stopped)
                return "next";
            if (this.pendingDeepDive)
                return "next";
            if (this.pendingSkip !== null) {
                const dir = this.pendingSkip;
                this.pendingSkip = null;
                return dir;
            }
            // Start (or resume) subtitle from the saved word position.
            // First play: subtitleResumeIndex = 0.
            // After pause/resume: subtitleResumeIndex = word where audio was paused.
            this.startSubtitleAnimation(subtitleText, this.subtitleResumeIndex, wordIntervalMs);
            const player = new audioPlayer_1.AudioPlayer();
            this.currentPlayer = player;
            const skipPromise = new Promise(r => { this.skipResolve = r; });
            const audioPromise = player.play(audio).then(() => "next");
            const result = await Promise.race([audioPromise, skipPromise]);
            // togglePause() already called cancelSubtitleAnimation() and saved the index.
            // Call again to clear the ref (safe no-op if already cancelled).
            this.cancelSubtitleAnimation();
            player.stop();
            this.currentPlayer = null;
            this.skipResolve = null;
            // Audio ended because pause killed the process → wait and replay from saved word.
            if (result === "next" && this.paused) {
                continue;
            }
            return result;
        }
    }
    async fallbackWait(ms) {
        await this.waitForResume();
        if (this.stopped)
            return "next";
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.skipResolve = null;
                resolve("next");
            }, ms);
            this.skipResolve = (dir) => {
                clearTimeout(timer);
                this.skipResolve = null;
                resolve(dir);
            };
        });
    }
    sendSignal(dir) {
        if (this.skipResolve) {
            const r = this.skipResolve;
            this.skipResolve = null;
            this.currentPlayer?.stop();
            r(dir);
        }
        else {
            this.pendingSkip = dir;
            if (this.paused) {
                this.paused = false;
                const r = this.resumeResolve;
                this.resumeResolve = null;
                r?.();
            }
        }
    }
    waitForResume() {
        if (!this.paused)
            return Promise.resolve();
        return new Promise(r => { this.resumeResolve = r; });
    }
    applyBlockDecoration(block) {
        const range = new vscode.Range(new vscode.Position(block.startLine, 0), new vscode.Position(block.endLine, Number.MAX_SAFE_INTEGER));
        this.editor.setDecorations(this.decorationType, [range]);
        this.editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
    cleanup() {
        this.cancelSubtitleAnimation();
        this.editor.setDecorations(this.decorationType, []);
        this.editor.setDecorations(this.lineDecorationType, []);
        this.editor.setDecorations(this.qaDecorationType, []);
        this.decorationType.dispose();
        this.lineDecorationType.dispose();
        this.qaDecorationType.dispose();
        this.clearStatus();
        this.hideSubtitle?.();
    }
}
exports.WalkthroughSession = WalkthroughSession;
//# sourceMappingURL=session.js.map