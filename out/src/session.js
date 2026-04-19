"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalkthroughSession = void 0;
const vscode = __importStar(require("vscode"));
const narrate_1 = require("./narrate");
const audioPlayer_1 = require("./audioPlayer");
// ── Subtitle animation constants ──────────────────────────────────────────────
const SUBTITLE_WORD_MS_FALLBACK = 420;
// ── Player startup delay ──────────────────────────────────────────────────────
// Time between spawning the audio process and the first audio sample playing.
// Run `node scripts/measure-audio-delay.js` to get your machine's actual values,
// then update the numbers below.
//
// Windows: PowerShell + SoundPlayer cold-start is ~300-500 ms.
// Q&A path gets extra headroom because the system is busier post-LLM call.
const PLAYER_STARTUP_MS = process.platform === "win32" ? 757 :
    process.platform === "darwin" ? 50 : 0;
const PLAYER_STARTUP_MS_QA = process.platform === "win32" ? 907 :
    process.platform === "darwin" ? 80 : 0;
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
        this.inBlockMode = false; // set to true when D is pressed during file overview
        // ── Control signals ────────────────────────────────────────────────────────
        this.skipResolve = null;
        this.pendingSkip = null;
        this.resumeResolve = null;
        this.currentPlayer = null;
        // ── Deep Dive ──────────────────────────────────────────────────────────────
        this.deepDiveActive = false;
        this.pendingDeepDive = false;
        // ── Q&A answer playback ───────────────────────────────────────────────────
        // Separate pause state so Space controls Q&A audio while narration waits.
        this.qaAnswerActive = false;
        this.qaAnswerPaused = false;
        this.qaAnswerResolveFn = null;
        this.qaAudioResumeMs = 0;
        this.qaSubtitleIdx = 0;
        // ── Prefetch / narration cache ────────────────────────────────────────────
        this.prefetchCache = new Map();
        this.narrationCache = new Map();
        // ── Subtitle animation handle ─────────────────────────────────────────────
        this.subtitleStopFn = null;
        this.subtitleResumeIndex = 0;
        // ── Audio resume ──────────────────────────────────────────────────────────
        // Accumulated playback time across pause/resume cycles for the current clip.
        // Used to trim the WAV buffer so audio resumes where it was paused, not SOB.
        this.audioResumeMs = 0;
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
        this.log(`\n── Starting walkthrough — whole-file narration (press D for block-by-block) ──`);
        this.kickPrefetch(0);
        // Phase 1: narrate the whole file as a single overview block
        await this.presentBlock(0);
        // Phase 2: if D was pressed during the overview, go block-by-block through functions
        if (!this.stopped && !this.fileSkipRequested && this.inBlockMode && this.blocks.length > 1) {
            this.log(`── Block-by-block mode (${this.blocks.length - 1} function block(s)) ──`);
            this.index = 1;
            this.kickPrefetch(1);
            while (!this.stopped && !this.fileSkipRequested && this.index < this.blocks.length) {
                const dir = await this.presentBlock(this.index);
                if (this.stopped)
                    break;
                this.index = dir === "prev"
                    ? Math.max(1, this.index - 1)
                    : this.index + 1;
            }
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
        // While Q&A answer is speaking, Space controls the Q&A audio — not narration.
        if (this.qaAnswerActive) {
            this.qaAnswerPaused = !this.qaAnswerPaused;
            if (this.qaAnswerPaused) {
                this.log("  ⏸  Q&A paused");
                this.qaAudioResumeMs += this.currentPlayer?.elapsedMs ?? 0;
                this.currentPlayer?.stop();
                this.qaSubtitleIdx = this.cancelSubtitleAnimation();
                this.setPaused?.(true);
            }
            else {
                this.log("  ▶  Q&A resumed");
                this.setPaused?.(false);
                const r = this.qaAnswerResolveFn;
                this.qaAnswerResolveFn = null;
                r?.();
            }
            return;
        }
        this.paused = !this.paused;
        if (this.paused) {
            this.log("  ⏸  Paused");
            this.audioResumeMs += this.currentPlayer?.elapsedMs ?? 0;
            this.currentPlayer?.stop();
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
        const showProgress = (msg) => {
            this.showSubtitleWords?.(msg.trim().split(/\s+/), -1, 0);
        };
        try {
            const { answer, topLabel, topFile } = await (0, narrate_1.queryCodebase)(question, showProgress);
            this.log(`[Q&A] Answer: ${answer}`);
            this.log(`[Q&A] Top match: ${topLabel}${topFile ? ` (${topFile})` : ""}`);
            // Highlight the most relevant block in the editor
            const matchBlock = this.blocks.find(b => b.label === topLabel);
            if (matchBlock) {
                const range = new vscode.Range(new vscode.Position(matchBlock.startLine, 0), new vscode.Position(matchBlock.endLine, Number.MAX_SAFE_INTEGER));
                this.editor.setDecorations(this.qaDecorationType, [range]);
                this.editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
            // Speak the answer — generate audio first, then play with full
            // pause/resume support independent of the narration pause state.
            this.setStatus("$(megaphone) Q&A — speaking answer...");
            try {
                const audio = await (0, narrate_1.generateAudio)(answer);
                if (!this.stopped) {
                    const qaWords = answer.trim().split(/\s+/).filter(Boolean);
                    const qaIntervalMs = this.estimateWordIntervalMs(audio, qaWords.length);
                    // Enter Q&A playback mode — Space now controls Q&A, not narration.
                    this.qaAnswerActive = true;
                    this.qaAnswerPaused = false;
                    this.qaAudioResumeMs = 0;
                    this.qaSubtitleIdx = 0;
                    this.setPaused?.(false); // show ⏸ (playing) during Q&A answer
                    try {
                        for (;;) {
                            if (this.qaAnswerPaused) {
                                await new Promise(r => { this.qaAnswerResolveFn = r; });
                            }
                            if (this.stopped)
                                break;
                            const player = new audioPlayer_1.AudioPlayer();
                            this.currentPlayer = player;
                            const clip = this.qaAudioResumeMs > 0
                                ? trimWav(audio, this.qaAudioResumeMs) : audio;
                            const promise = player.play(clip);
                            await new Promise(r => setTimeout(r, PLAYER_STARTUP_MS_QA));
                            if (!this.stopped && !this.qaAnswerPaused) {
                                this.startSubtitleAnimation(answer, this.qaSubtitleIdx, qaIntervalMs);
                            }
                            await promise;
                            this.currentPlayer = null;
                            if (this.qaAnswerPaused)
                                continue; // paused mid-play → loop back
                            break; // finished naturally
                        }
                    }
                    finally {
                        this.qaAnswerActive = false;
                        this.cancelSubtitleAnimation();
                        this.hideSubtitle?.();
                    }
                }
            }
            catch (ttsErr) {
                const msg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
                this.log(`[Q&A] TTS error: ${msg}`);
                this.showSubtitle?.(answer);
                await new Promise(r => setTimeout(r, 4000));
                this.hideSubtitle?.();
            }
            // Auto-resume narration when Q&A finishes (if it was playing before Q was pressed).
            if (!this.stopped) {
                if (!wasPaused) {
                    this.log("  ▶  Narration auto-resumed after Q&A");
                    this.paused = false;
                    this.setPaused?.(false);
                    this.editor.setDecorations(this.qaDecorationType, []);
                    const r = this.resumeResolve;
                    this.resumeResolve = null;
                    r?.();
                }
                else {
                    this.setStatus("$(comment-discussion) Q&A done — Space to resume");
                }
            }
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
            if (block.level === 0) {
                this.inBlockMode = true;
                this.clearSubtitle();
                return "next";
            }
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
            if (block.level === 0) {
                this.inBlockMode = true;
                this.clearSubtitle();
                return "next";
            }
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
        // Reset both resume positions for each new audio clip.
        this.subtitleResumeIndex = 0;
        this.audioResumeMs = 0;
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
            const player = new audioPlayer_1.AudioPlayer();
            this.currentPlayer = player;
            const skipPromise = new Promise(r => { this.skipResolve = r; });
            const clip = this.audioResumeMs > 0 ? trimWav(audio, this.audioResumeMs) : audio;
            const audioPromise = player.play(clip).then(() => "next");
            // Wait for the player process to actually start outputting audio before
            // beginning the subtitle animation — closes the PowerShell startup gap.
            await new Promise(r => setTimeout(r, PLAYER_STARTUP_MS));
            if (!this.stopped && !this.paused) {
                this.startSubtitleAnimation(subtitleText, this.subtitleResumeIndex, wordIntervalMs);
            }
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
// ── WAV trimmer ───────────────────────────────────────────────────────────────
// Creates a new WAV buffer starting `skipMs` into the original clip.
// Assumes standard 44-byte PCM WAV header (what Sarvam TTS produces).
// Falls back to the original buffer on any parse error.
function trimWav(wav, skipMs) {
    if (skipMs <= 0 || wav.length < 44)
        return wav;
    try {
        const byteRate = wav.readUInt32LE(28); // bytes/sec
        const blockAlign = wav.readUInt16LE(32); // bytes/sample-frame
        if (byteRate === 0)
            return wav;
        const rawSkip = Math.floor((skipMs / 1000) * byteRate);
        const skipBytes = blockAlign > 0
            ? Math.floor(rawSkip / blockAlign) * blockAlign
            : rawSkip;
        const dataSize = wav.readUInt32LE(40);
        const clamped = Math.min(skipBytes, dataSize);
        if (clamped === 0)
            return wav;
        const newDataSize = dataSize - clamped;
        const newTotal = 44 + newDataSize;
        const out = Buffer.alloc(newTotal);
        wav.copy(out, 0, 0, 44); // copy header
        wav.copy(out, 44, 44 + clamped); // copy remaining PCM
        out.writeUInt32LE(newDataSize + 36, 4); // update RIFF chunk size
        out.writeUInt32LE(newDataSize, 40); // update data chunk size
        return out;
    }
    catch {
        return wav;
    }
}
//# sourceMappingURL=session.js.map