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
const path = __importStar(require("path"));
const narrate_1 = require("./narrate");
const audioPlayer_1 = require("./audioPlayer");
const videoRenderer_1 = require("./videoRenderer");
const generateBlueprint_1 = require("./generateBlueprint");
const generateFlowchart_1 = require("./generateFlowchart");
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
    constructor(editor, blocks, fileContext, callbacks, videoOpts) {
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
        this.deepDiveExitResolve = null;
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
        // ── Video render cache ────────────────────────────────────────────────────
        this.videoCacheMap = new Map();
        this.blueprintCache = new Map();
        // ── Language ───────────────────────────────────────────────────────────────
        this.currentLanguage = 'en';
        // ── Deep Dive flowchart mode ───────────────────────────────────────────────
        this.mode = 'video';
        this.currentDeepDiveIndex = 0;
        this.flowchartCache = new Map();
        this.flowchartPrefetch = new Map();
        // ── Subtitle animation handle ─────────────────────────────────────────────
        this.subtitleStopFn = null;
        this.subtitleResumeIndex = 0;
        // ── Audio resume ──────────────────────────────────────────────────────────
        // Accumulated playback time across pause/resume cycles for the current clip.
        // Used to trim the WAV buffer so audio resumes where it was paused, not SOB.
        this.audioResumeMs = 0;
        this.wsRoot = videoOpts?.wsRoot;
        this.filePath = videoOpts?.filePath;
        this.panel = videoOpts?.panel;
        this.cfg = videoOpts?.cfg;
        this.currentLanguage = videoOpts?.cfg?.language ?? 'en';
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
        // Kick off audio/narration fetch for block 0 early while the extension initialises.
        // Video is rendered inline inside presentBlock (with progress updates).
        this.kickPrefetch(0);
        // Phase 1: narrate the whole file as a single overview block
        await this.presentBlock(0);
        // Phase 2: if D was pressed during the overview, go block-by-block through functions
        if (!this.stopped && !this.fileSkipRequested && this.inBlockMode && this.blocks.length > 1) {
            this.log(`── Block-by-block mode (${this.blocks.length - 1} function block(s)) ──`);
            this.index = 1;
            // Block 1 prefetch was kicked off by presentBlock(0) — no need to kickPrefetch(1) here.
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
    next() {
        if (this.mode === 'deepdive') {
            void this.nextFlowchartBlock();
            return;
        }
        this.log("  ⏭  Skip next");
        this.sendSignal("next");
    }
    prev() {
        if (this.mode === 'deepdive') {
            void this.prevFlowchartBlock();
            return;
        }
        this.log("  ⏮  Skip prev");
        this.sendSignal("prev");
    }
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
        // Always reset webview to video mode so the next file's video plays correctly
        if (this.mode === 'deepdive') {
            this.panel?.postMessage({ type: 'exit-deepdive' });
        }
        this.mode = 'video';
        const r = this.deepDiveExitResolve;
        this.deepDiveExitResolve = null;
        r?.();
        this.stop();
    }
    deepDive() {
        if (this.stopped)
            return;
        if (this.mode === 'deepdive') {
            this.log("  🔍  Exit flowchart deep dive");
            this.exitDeepDive();
            return;
        }
        this.log("  🔍  Enter flowchart deep dive");
        this.mode = 'deepdive';
        this.currentDeepDiveIndex = this.index;
        this.currentPlayer?.stop();
        void this.enterDeepDive();
        if (this.skipResolve) {
            // Audio was playing — signal next; playWithControls will then check mode
            const r = this.skipResolve;
            this.skipResolve = null;
            r("next");
        }
        else if (this.paused) {
            // Was paused — wake up waitForResume; playWithControls checks mode and returns "next"
            this.paused = false;
            const r = this.resumeResolve;
            this.resumeResolve = null;
            r?.();
        }
        // If during loading phase: presentBlock checks mode after loading completes
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
            const { answer, topLabel, topFile } = await (0, narrate_1.queryCodebase)(question, showProgress, this.currentLanguage);
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
                const audio = await (0, narrate_1.generateAudio)(answer, this.currentLanguage);
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
    setLanguage(code) {
        if (this.currentLanguage === code)
            return;
        this.currentLanguage = code;
        vscode.window.showInformationMessage("Language will change from the next block.");
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
        const r2 = this.deepDiveExitResolve;
        this.deepDiveExitResolve = null;
        r2?.();
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    /** Returns the current file's path relative to wsRoot, with forward slashes. */
    relativeFilePath() {
        if (!this.filePath || !this.wsRoot)
            return "";
        return path.relative(this.wsRoot, this.filePath).replace(/\\/g, "/");
    }
    // ── Prefetch ──────────────────────────────────────────────────────────────
    kickPrefetch(i) {
        if (i < 0 || i >= this.blocks.length || this.prefetchCache.has(i))
            return;
        if (this.currentLanguage !== 'en')
            return;
        this.prefetchCache.set(i, this.fetchAudio(i));
    }
    prefetchVideo(blockIndex) {
        if (!this.wsRoot || !this.filePath || !this.cfg) {
            this.log(`[video] block ${blockIndex}: skipped — videoOpts not provided`);
            return;
        }
        if (this.videoCacheMap.has(blockIndex))
            return;
        if (blockIndex >= this.blocks.length)
            return;
        const block = this.blocks[blockIndex];
        const narration = this.narrationCache.get(blockIndex) ?? '';
        if (!narration) {
            this.log(`[video] block ${blockIndex}: skipped — narration not cached yet`);
            return;
        }
        const wsRoot = this.wsRoot;
        const filePath = this.filePath;
        const cfg = this.cfg;
        const panel = this.panel;
        this.log(`[video] block ${blockIndex} (${block.label}): generating blueprint...`);
        const promise = (async () => {
            try {
                const audioBuffer = await (this.prefetchCache.get(blockIndex) ?? Promise.resolve(null));
                const audioDurationMs = getWavDurationMs(audioBuffer);
                this.log(`[video] block ${blockIndex}: audio duration ${audioDurationMs}ms`);
                const blueprint = await (0, generateBlueprint_1.generateBlueprint)(block.code, block.label, narration, '', audioDurationMs);
                this.blueprintCache.set(blockIndex, blueprint);
                this.log(`[video] block ${blockIndex}: blueprint done (${blueprint.scenes.length} scenes) — rendering...`);
                const result = await (0, videoRenderer_1.renderBlockVideo)({
                    wsRoot,
                    fileName: `${filePath.replace(/[^a-zA-Z0-9]/g, '_')}_block${blockIndex}`,
                    blueprint,
                    onProgress: (pct) => {
                        if (pct % 25 === 0) {
                            this.log(`[video] block ${blockIndex}: render ${pct}%`);
                            panel?.postMessage({ type: 'video-render-progress', blockIndex, pct });
                        }
                    },
                });
                this.log(`[video] block ${blockIndex}: render done → ${result.mp4Path}`);
                panel?.postMessage({ type: 'set-video-src', blockIndex, path: result.mp4Path });
                return result.mp4Path;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.log(`[video] block ${blockIndex}: ERROR — ${msg}`);
                return '';
            }
        })();
        this.videoCacheMap.set(blockIndex, promise);
    }
    async fetchAudio(i) {
        const { label, code } = this.blocks[i];
        const tag = `[${i + 1}/${this.blocks.length}] ${label}`;
        try {
            this.log(`${tag} → fetching narration (lang: ${this.currentLanguage})...`);
            const ctx = (i === 0 && this.fileContext) ? this.fileContext : undefined;
            // Fetch cross-file context (fast Qdrant call) before the LLM narration call.
            // Falls back to [] silently if Qdrant is unavailable.
            const crossCtx = this.cfg
                ? await (0, narrate_1.fetchCrossFileContext)(label, code, this.relativeFilePath(), this.cfg).catch(() => [])
                : [];
            if (crossCtx.length > 0) {
                this.log(`${tag} → cross-file context: ${crossCtx.map(c => `${c.filePath} → ${c.blockLabel}`).join(" | ")}`);
            }
            else {
                this.log(`${tag} → no cross-file context (Qdrant empty or unavailable)`);
            }
            const text = await (0, narrate_1.fetchNarration)(label, code, ctx, this.currentLanguage, crossCtx);
            this.narrationCache.set(i, text);
            this.log(`${tag} → narration ready`);
            this.log(`[script] ${tag}:\n${text}`);
            this.log(`${tag} → generating audio (lang: ${this.currentLanguage})...`);
            const buf = await (0, narrate_1.generateAudio)(text, this.currentLanguage);
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
        this.panel?.postMessage({ type: 'video-reset' });
        this.setStatus(`$(sync~spin) ${tag}`);
        this.panel?.postMessage({ type: 'subtitle-loading', text: '🎬 Preparing visuals...' });
        // ── Step 1: Get audio ─────────────────────────────────────────────────────
        // Use cached promise from kickPrefetch/prefetchNextBlock, or fetch inline.
        // For non-English: always generate fresh (no cache read/write).
        let audio;
        const cachedAudio = this.currentLanguage === 'en' ? this.prefetchCache.get(i) : undefined;
        this.log(`[presentBlock ${i}] audio cache hit=${!!cachedAudio}`);
        if (cachedAudio) {
            audio = await cachedAudio;
        }
        else {
            audio = await this.fetchAudio(i);
        }
        this.log(`[presentBlock ${i}] audio ready — ${audio ? audio.length + ' bytes' : 'null'}`);
        if (this.stopped)
            return "next";
        // ── Step 2: Render video ──────────────────────────────────────────────────
        // Use cached render (prefetched while previous block played) or render inline.
        let mp4Path = '';
        const cachedVideo = this.videoCacheMap.get(i);
        this.log(`[presentBlock ${i}] video cache hit=${!!cachedVideo}`);
        if (cachedVideo) {
            mp4Path = await cachedVideo;
            this.log(`[presentBlock ${i}] video from cache → ${mp4Path}`);
        }
        else if (this.wsRoot && this.filePath && this.cfg) {
            const narrationText = this.narrationCache.get(i) ?? '';
            const audioDurationMs = getWavDurationMs(audio);
            this.log(`[presentBlock ${i}] inline render: audioDurationMs=${audioDurationMs}, narration="${narrationText.slice(0, 60)}..."`);
            try {
                this.log(`[presentBlock ${i}] calling generateBlueprint...`);
                const blueprint = await (0, generateBlueprint_1.generateBlueprint)(block.code, block.label, narrationText, '', audioDurationMs);
                this.log(`[presentBlock ${i}] blueprint OK — "${block.label}" | ${audioDurationMs}ms | ` +
                    `${blueprint.scenes.length} scenes: ${blueprint.scenes.map((s) => s.type).join(' → ')}`);
                const safeName = `${this.filePath.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9]/g, '_') ?? 'file'}_block${i}`;
                this.log(`[video] block ${i}: blueprint scenes = ${JSON.stringify(blueprint.scenes.map((s) => ({ type: s.type, keys: Object.keys(s) })))}`);
                const result = await (0, videoRenderer_1.renderBlockVideo)({
                    wsRoot: this.wsRoot,
                    fileName: safeName,
                    blueprint: { ...blueprint, silent: true },
                    onProgress: (pct) => {
                        this.panel?.postMessage({ type: 'subtitle-loading', text: `🎬 Preparing visuals... ${pct}%` });
                    },
                });
                mp4Path = result.mp4Path;
                this.log(`[video] block ${i}: render done → ${mp4Path}`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const stack = err instanceof Error ? (err.stack ?? '') : '';
                this.log(`[video] block ${i}: render ERROR — ${msg}\n${stack}`);
            }
        }
        if (this.stopped)
            return "next";
        const narration = this.narrationCache.get(i) ?? "";
        // ── Step 3: Handle signals queued during the loading phase ────────────────
        if (this.pendingSkip !== null) {
            const dir = this.pendingSkip;
            this.pendingSkip = null;
            this.clearSubtitle();
            return dir;
        }
        // D pressed during loading → wait for deep dive to exit before advancing
        if (this.mode === 'deepdive' && !this.stopped) {
            this.clearSubtitle();
            await this.waitForDeepDiveExit();
            return "next";
        }
        this.applyBlockDecoration(block);
        // ── Step 4: Set video source, then start video + audio together ───────────
        this.panel?.postMessage({ type: 'subtitle-hide' });
        if (mp4Path) {
            this.panel?.postMessage({ type: 'set-video-src', blockIndex: i, path: mp4Path });
        }
        // Wait for the webview to load the new video src before playing.
        await new Promise(resolve => setTimeout(resolve, 300));
        // Send video-play with a startup-delay so video begins at the same moment
        // the audio process produces its first sample (PLAYER_STARTUP_MS after spawn).
        this.panel?.postMessage({ type: 'video-play', delayMs: PLAYER_STARTUP_MS });
        // ── Step 5: Prefetch next block concurrently while current block plays ────
        const nextIdx = i + 1;
        if (!this.stopped && nextIdx < this.blocks.length && !this.videoCacheMap.has(nextIdx)) {
            void this.prefetchNextBlock(nextIdx);
        }
        // ── Step 6: Play audio + subtitles ────────────────────────────────────────
        let dir;
        if (audio !== null) {
            this.setStatus(`$(megaphone) ${tag}`);
            this.log(`${tag} → playing...`);
            dir = await this.playWithControls(audio, narration);
            this.log(`${tag} → done`);
        }
        else {
            this.setStatus(`$(warning) ${tag} — TTS failed`);
            if (narration)
                this.showSubtitle?.(narration);
            dir = await this.fallbackWait(2000);
        }
        this.editor.setDecorations(this.decorationType, []);
        this.clearSubtitle();
        // D pressed during playback → session waits here until user exits deep dive
        if (this.mode === 'deepdive' && !this.stopped) {
            await this.waitForDeepDiveExit();
        }
        return dir;
    }
    // ── Prefetch next block in background ─────────────────────────────────────
    async prefetchNextBlock(blockIndex) {
        if (this.currentLanguage !== 'en')
            return; // no prefetch for non-English
        if (this.videoCacheMap.has(blockIndex))
            return;
        if (!this.wsRoot || !this.filePath || !this.cfg)
            return;
        if (blockIndex >= this.blocks.length)
            return;
        this.log(`[Walkthrough] Prefetch starting: block ${blockIndex}`);
        const block = this.blocks[blockIndex];
        const videoPromise = (async () => {
            try {
                const ctx = (blockIndex === 0 && this.fileContext) ? this.fileContext : undefined;
                const crossCtx = this.cfg
                    ? await (0, narrate_1.fetchCrossFileContext)(block.label, block.code, this.relativeFilePath(), this.cfg).catch(() => [])
                    : [];
                if (crossCtx.length > 0) {
                    this.log(`[prefetch] block ${blockIndex} → cross-file context: ${crossCtx.map(c => `${c.filePath} → ${c.blockLabel}`).join(" | ")}`);
                }
                else {
                    this.log(`[prefetch] block ${blockIndex} → no cross-file context`);
                }
                const narration = await (0, narrate_1.fetchNarration)(block.label, block.code, ctx, 'en', crossCtx);
                this.narrationCache.set(blockIndex, narration);
                this.log(`[script] [${blockIndex + 1}/${this.blocks.length}] ${block.label}:\n${narration}`);
                const audio = await (0, narrate_1.generateAudio)(narration, 'en');
                // Cache audio so presentBlock can use it without re-generating.
                this.prefetchCache.set(blockIndex, Promise.resolve(audio));
                const audioDurationMs = getWavDurationMs(audio);
                const blueprint = await (0, generateBlueprint_1.generateBlueprint)(block.code, block.label, narration, '', audioDurationMs);
                const safeName = `${this.filePath.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9]/g, '_') ?? 'file'}_block${blockIndex}`;
                const result = await (0, videoRenderer_1.renderBlockVideo)({
                    wsRoot: this.wsRoot,
                    fileName: safeName,
                    blueprint: { ...blueprint, silent: true },
                    // no onProgress — this is a silent background render
                });
                this.log(`[Walkthrough] Prefetch done: block ${blockIndex}`);
                return result.mp4Path;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.log(`[Walkthrough] Prefetch failed block ${blockIndex}: ${msg}`);
                return '';
            }
        })();
        this.videoCacheMap.set(blockIndex, videoPromise);
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
            narrations = await (0, narrate_1.fetchDeepDiveNarrations)(block, this.currentLanguage);
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
                const audio = await (0, narrate_1.generateAudio)(narrations[j], this.currentLanguage);
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
            if (this.mode === 'deepdive')
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
        this.videoCacheMap.clear();
        this.blueprintCache.clear();
        this.flowchartCache.clear();
        this.flowchartPrefetch.clear();
        this.mode = 'video';
    }
    // ── Flowchart / Deep Dive methods ─────────────────────────────────────────
    waitForDeepDiveExit() {
        if (this.mode !== 'deepdive')
            return Promise.resolve();
        return new Promise(r => { this.deepDiveExitResolve = r; });
    }
    async enterDeepDive() {
        this.panel?.postMessage({ type: 'enter-deepdive' });
        await this.showFlowchartBlock(this.currentDeepDiveIndex);
    }
    async showFlowchartBlock(index) {
        if (index < 0 || index >= this.blocks.length)
            return;
        const block = this.blocks[index];
        const langId = this.editor.document.languageId;
        const cfg = this.cfg ?? {};
        this.panel?.postMessage({ type: 'flowchart-loading' });
        let result = this.flowchartCache.get(index);
        if (!result) {
            const inflight = this.flowchartPrefetch.get(index);
            if (inflight) {
                try {
                    result = await inflight;
                }
                catch { /* fall through to fresh call */ }
            }
        }
        if (!result) {
            try {
                result = await (0, generateFlowchart_1.generateFlowchart)(block.code, block.label, langId, cfg, this.currentLanguage);
                this.flowchartCache.set(index, result);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.log(`[flowchart] block ${index}: ERROR — ${msg}`);
                result = {
                    mermaid: `flowchart LR\n  errNode["Error generating diagram"]:::error\n  classDef error fill:#ef4444,stroke:#dc2626,color:#fff`,
                    explanations: [],
                };
            }
        }
        // Enrich each flowchart step with cross-file context from Qdrant.
        // All fetches run in parallel; each has a 5s timeout; Qdrant unavailability → [].
        const relFilePath = this.relativeFilePath();
        this.log(`[flowchart] block ${index}: enriching ${result.explanations.length} node(s) with cross-file context...`);
        const enrichedExplanations = await Promise.all(result.explanations.map(async (step) => {
            if (!this.cfg)
                return step;
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 5000));
            const crossCtx = await Promise.race([
                (0, narrate_1.fetchNodeCrossFileContext)(step.nodeId, relFilePath, this.cfg).catch(() => []),
                timeoutPromise,
            ]);
            if (crossCtx.length > 0) {
                this.log(`[flowchart] node "${step.nodeId}": ${crossCtx.length} cross-file ref(s) — ${crossCtx.map(c => `${c.filePath} → ${c.blockLabel}`).join(" | ")}`);
            }
            return { ...step, crossFileContext: crossCtx };
        }));
        const enrichedCount = enrichedExplanations.filter(s => s.crossFileContext.length > 0).length;
        this.log(`[flowchart] block ${index}: ${enrichedCount}/${enrichedExplanations.length} node(s) have cross-file context`);
        this.panel?.postMessage({
            type: 'set-flowchart',
            mermaid: result.mermaid,
            explanations: enrichedExplanations,
            blockLabel: block.label,
            blockIndex: index,
            totalBlocks: this.blocks.length,
        });
        void this.prefetchFlowchartBlock(index + 1);
    }
    prefetchFlowchartBlock(index) {
        if (index >= this.blocks.length)
            return;
        if (this.flowchartCache.has(index))
            return;
        if (this.flowchartPrefetch.has(index))
            return;
        const block = this.blocks[index];
        const langId = this.editor.document.languageId;
        const cfg = this.cfg ?? {};
        const p = (0, generateFlowchart_1.generateFlowchart)(block.code, block.label, langId, cfg, this.currentLanguage)
            .then(r => { this.flowchartCache.set(index, r); return r; })
            .catch(() => ({ mermaid: '', explanations: [] }));
        this.flowchartPrefetch.set(index, p);
    }
    async nextFlowchartBlock() {
        if (this.currentDeepDiveIndex + 1 >= this.blocks.length) {
            this.panel?.postMessage({ type: 'flowchart-end' });
            return;
        }
        this.currentDeepDiveIndex++;
        await this.showFlowchartBlock(this.currentDeepDiveIndex);
    }
    async prevFlowchartBlock() {
        if (this.currentDeepDiveIndex <= 0)
            return;
        this.currentDeepDiveIndex--;
        await this.showFlowchartBlock(this.currentDeepDiveIndex);
    }
    exitDeepDive() {
        this.mode = 'video';
        this.panel?.postMessage({ type: 'exit-deepdive' });
        const r = this.deepDiveExitResolve;
        this.deepDiveExitResolve = null;
        r?.();
    }
    async generateDeepDiveAudio(index) {
        if (index < 0 || index >= this.blocks.length)
            return;
        const block = this.blocks[index];
        try {
            // Always fetch fresh narration for non-English — cached entry may be stale language
            const narration = (this.currentLanguage === 'en' ? this.narrationCache.get(index) : undefined)
                ?? await (0, narrate_1.fetchNarration)(block.label, block.code, undefined, this.currentLanguage);
            this.narrationCache.set(index, narration);
            const audio = await (0, narrate_1.generateAudio)(narration, this.currentLanguage);
            this.panel?.postMessage({ type: 'deepdive-audio-ready' });
            if (!this.stopped) {
                const words = narration.trim().split(/\s+/).filter(Boolean);
                const wordIntervalMs = this.estimateWordIntervalMs(audio, words.length);
                const player = new audioPlayer_1.AudioPlayer();
                this.currentPlayer = player;
                // Start subtitle + progress bar animation in sync with audio
                await new Promise(r => setTimeout(r, PLAYER_STARTUP_MS));
                this.startSubtitleAnimation(narration, 0, wordIntervalMs);
                await player.play(audio);
                this.cancelSubtitleAnimation();
                this.clearSubtitle();
                this.currentPlayer = null;
                this.panel?.postMessage({ type: 'deepdive-audio-ended' });
            }
        }
        catch (e) {
            this.log(`[deepdive-audio] ERROR: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
exports.WalkthroughSession = WalkthroughSession;
// ── WAV duration reader ───────────────────────────────────────────────────────
function getWavDurationMs(audio) {
    if (!audio || audio.length < 44)
        return 8000;
    try {
        const byteRate = audio.readUInt32LE(28);
        let dataSize = 0;
        for (let i = 12; i < audio.length - 8; i++) {
            if (audio.toString('ascii', i, i + 4) === 'data') {
                dataSize = audio.readUInt32LE(i + 4);
                break;
            }
        }
        if (byteRate === 0 || dataSize === 0)
            return 8000;
        return Math.round((dataSize / byteRate) * 1000);
    }
    catch {
        return 8000;
    }
}
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