import * as vscode from "vscode";
import { SemanticBlock } from "./parser";
import { fetchNarration, generateAudio, queryCodebase, fetchDeepDiveNarrations } from "./narrate";
import { AudioPlayer } from "./audioPlayer";

type Direction = "next" | "prev";

export interface SessionCallbacks {
  log:          (msg: string) => void;
  setStatus:    (msg: string) => void;
  clearStatus:  () => void;
  /** Called when pause state toggles — lets the UI flip button icon + graph node badge. */
  setPaused?:   (paused: boolean) => void;
  /** Render a line of subtitle text.  loading=true → dim/italic style. */
  showSubtitle?: (text: string, loading?: boolean) => void;
  /** Clear the subtitle. */
  hideSubtitle?: () => void;
}

// ── Subtitle animation constants ──────────────────────────────────────────────

/** Max characters on one subtitle line before rolling to the next. */
const SUBTITLE_MAX_CHARS = 80;
/** Milliseconds between each word appearing (~133 wpm, matches Sarvam TTS pace). */
const SUBTITLE_WORD_MS   = 450;

// ---------------------------------------------------------------------------
// WalkthroughSession
// ---------------------------------------------------------------------------

export class WalkthroughSession {
  private index = 0;
  private stopped = false;
  private paused  = false;
  private fileSkipRequested = false;

  // ── Control signals ────────────────────────────────────────────────────────
  private skipResolve:   ((dir: Direction) => void) | null = null;
  private pendingSkip:   Direction | null = null;
  private resumeResolve: (() => void) | null = null;
  private currentPlayer: AudioPlayer | null = null;

  // ── Deep Dive ──────────────────────────────────────────────────────────────
  private deepDiveActive  = false;
  private pendingDeepDive = false;

  // ── Prefetch / narration cache ────────────────────────────────────────────
  private readonly prefetchCache  = new Map<number, Promise<Buffer | null>>();
  private readonly narrationCache = new Map<number, string>();

  // ── Subtitle animation handle ─────────────────────────────────────────────
  private subtitleStopFn: (() => void) | null = null;

  // ── Decoration types (editor highlights only — subtitle lives in SubtitlePanel) ──
  private readonly decorationType:     vscode.TextEditorDecorationType;
  private readonly lineDecorationType: vscode.TextEditorDecorationType;
  private readonly qaDecorationType:   vscode.TextEditorDecorationType;

  // ── Callbacks ─────────────────────────────────────────────────────────────
  private readonly log:           (msg: string) => void;
  private readonly setStatus:     (msg: string) => void;
  private readonly clearStatus:   () => void;
  private readonly setPaused?:    (paused: boolean) => void;
  private readonly showSubtitle?: (text: string, loading?: boolean) => void;
  private readonly hideSubtitle?: () => void;

  constructor(
    private readonly editor: vscode.TextEditor,
    private readonly blocks: SemanticBlock[],
    private readonly fileContext: string | null,
    callbacks: SessionCallbacks
  ) {
    this.log          = callbacks.log;
    this.setStatus    = callbacks.setStatus;
    this.clearStatus  = callbacks.clearStatus;
    this.setPaused    = callbacks.setPaused;
    this.showSubtitle = callbacks.showSubtitle;
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

  async run(): Promise<"done" | "file-skipped" | "stopped"> {
    this.log(`\n── Starting walkthrough (${this.blocks.length} blocks) ──`);
    this.kickPrefetch(0);

    while (!this.stopped && this.index < this.blocks.length) {
      const dir = await this.presentBlock(this.index);
      if (this.stopped) break;
      this.index = dir === "prev"
        ? Math.max(0, this.index - 1)
        : this.index + 1;
    }

    this.cleanup();
    this.log("── Walkthrough ended ──");

    if (this.fileSkipRequested) return "file-skipped";
    if (this.stopped)           return "stopped";
    return "done";
  }

  togglePause(): void {
    if (this.stopped) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.log("  ⏸  Paused");
      this.currentPlayer?.stop();
      this.cancelSubtitleAnimation();
      this.setPaused?.(true);
    } else {
      this.log("  ▶  Resumed");
      this.editor.setDecorations(this.qaDecorationType, []);
      this.setPaused?.(false);
      const r = this.resumeResolve;
      this.resumeResolve = null;
      r?.();
    }
  }

  next(): void { this.log("  ⏭  Skip next"); this.sendSignal("next"); }
  prev(): void { this.log("  ⏮  Skip prev"); this.sendSignal("prev"); }

  skipLine(): void {
    if (this.stopped) return;
    this.log(this.deepDiveActive ? "  ⏩  Skip line" : "  ⏭  Skip block");
    this.sendSignal("next");
  }

  skipFile(): void {
    if (this.stopped) return;
    this.log("  ⏭  Skip file");
    this.fileSkipRequested = true;
    this.stop();
  }

  deepDive(): void {
    if (this.stopped || this.deepDiveActive) return;
    this.log("  🔍  Deep dive");
    this.pendingDeepDive = true;

    if (this.skipResolve) {
      const r = this.skipResolve;
      this.skipResolve = null;
      this.currentPlayer?.stop();
      r("next");
    } else if (this.paused) {
      this.paused = false;
      this.editor.setDecorations(this.qaDecorationType, []);
      const r = this.resumeResolve;
      this.resumeResolve = null;
      r?.();
    }
  }

  async askQuestion(): Promise<void> {
    if (this.stopped) return;

    const wasPaused = this.paused;
    if (!wasPaused) this.togglePause();

    const question = await vscode.window.showInputBox({
      prompt: "Ask about this codebase...",
      placeHolder: "e.g. What does the auth middleware do?",
      ignoreFocusOut: true,
    });

    if (!question) {
      if (!wasPaused) this.togglePause();
      return;
    }

    this.log(`\n── Q&A: "${question}" ──`);
    this.setStatus("$(search) Searching codebase...");
    this.showSubtitle?.("🔍  Searching your codebase...", true);

    try {
      const { answer, topLabel, topFile } = await queryCodebase(question);

      this.log(`[Q&A] Answer: ${answer}`);
      this.log(`[Q&A] Top match: ${topLabel}${topFile ? ` (${topFile})` : ""}`);

      // Highlight the most relevant block in the editor
      const matchBlock = this.blocks.find(b => b.label === topLabel);
      if (matchBlock) {
        const range = new vscode.Range(
          new vscode.Position(matchBlock.startLine, 0),
          new vscode.Position(matchBlock.endLine, Number.MAX_SAFE_INTEGER)
        );
        this.editor.setDecorations(this.qaDecorationType, [range]);
        this.editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }

      // Speak the answer with subtitle animation
      this.setStatus("$(megaphone) Q&A — speaking answer...");
      this.startSubtitleAnimation(answer);

      try {
        const audio = await generateAudio(answer);
        if (!this.stopped) {
          const player = new AudioPlayer();
          this.currentPlayer = player;
          await player.play(audio);
          this.currentPlayer = null;
        }
      } catch (ttsErr) {
        const msg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
        this.log(`[Q&A] TTS error: ${msg}`);
        // No audio — subtitle stays visible for a moment so user can read it
        await new Promise<void>(r => setTimeout(r, 4000));
      } finally {
        this.cancelSubtitleAnimation();
        this.hideSubtitle?.();
      }

      this.setStatus("$(comment-discussion) Q&A done — Space to resume");

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`[Q&A] ERROR: ${msg}`);
      this.showSubtitle?.(`⚠️  ${msg.slice(0, 120)}`);
      this.setStatus("$(warning) Q&A failed — Space to resume");
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.log("  ⏹  Stopped");
    this.editor.setDecorations(this.qaDecorationType,   []);
    this.editor.setDecorations(this.lineDecorationType, []);
    this.sendSignal("next");
    const r = this.resumeResolve;
    this.resumeResolve = null;
    r?.();
  }

  // ── Prefetch ──────────────────────────────────────────────────────────────

  private kickPrefetch(i: number): void {
    if (i < 0 || i >= this.blocks.length || this.prefetchCache.has(i)) return;
    this.prefetchCache.set(i, this.fetchAudio(i));
  }

  private async fetchAudio(i: number): Promise<Buffer | null> {
    const { label, code } = this.blocks[i];
    const tag = `[${i + 1}/${this.blocks.length}] ${label}`;

    try {
      this.log(`${tag} → fetching narration...`);
      const ctx  = (i === 0 && this.fileContext) ? this.fileContext : undefined;
      const text = await fetchNarration(label, code, ctx);
      this.narrationCache.set(i, text);
      this.log(`${tag} → narration ready`);

      this.log(`${tag} → generating audio...`);
      const buf = await generateAudio(text);
      this.log(`${tag} → audio ready (${(buf.length / 1024).toFixed(1)} KB)`);
      return buf;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`${tag} → ERROR: ${msg}`);
      return null;
    }
  }

  // ── Block presentation ────────────────────────────────────────────────────

  private async presentBlock(i: number): Promise<Direction> {
    const block = this.blocks[i];
    const tag   = `[${i + 1}/${this.blocks.length}] ${block.label}`;

    this.kickPrefetch(i + 1);

    this.setStatus(`$(sync~spin) ${tag}`);
    this.showSubtitle?.("⏳  Preparing narration...", true);

    const audio = await this.prefetchCache.get(i)!;

    if (this.stopped) return "next";

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

    let dir: Direction;
    if (audio !== null) {
      this.setStatus(`$(megaphone) ${tag}`);
      this.log(`${tag} → playing...`);
      dir = await this.playWithControls(audio, narration);
      this.log(`${tag} → done`);
    } else {
      this.setStatus(`$(warning) ${tag} — TTS failed`);
      this.log(`${tag} → fallback 2s`);
      if (narration) this.showSubtitle?.(narration);
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

  private async runDeepDive(block: SemanticBlock, blockTag: string): Promise<void> {
    this.deepDiveActive = true;
    const ddTag = `[deep dive] ${block.label}`;

    this.setStatus(`$(sync~spin) ${ddTag} — preparing...`);
    this.showSubtitle?.("⏳  Preparing deep dive...", true);
    this.log(`${ddTag} → fetching line narrations...`);

    let narrations: string[];
    try {
      narrations = await fetchDeepDiveNarrations(block);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`${ddTag} → ERROR: ${msg}`);
      if (e instanceof Error && e.stack) this.log(e.stack);
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
    const N          = narrations.length;

    for (let j = 0; j < N && !this.stopped; j++) {
      const lineStart = block.startLine + Math.floor(j       * totalLines / N);
      const lineEnd   = block.startLine + Math.floor((j + 1) * totalLines / N) - 1;

      const lineRange = new vscode.Range(
        new vscode.Position(lineStart, 0),
        new vscode.Position(Math.min(lineEnd, block.endLine), Number.MAX_SAFE_INTEGER)
      );
      this.editor.setDecorations(this.lineDecorationType, [lineRange]);
      this.editor.revealRange(lineRange, vscode.TextEditorRevealType.InCenter);

      const chunkTag = `${ddTag} [${j + 1}/${N}]`;
      this.setStatus(`$(megaphone) ${chunkTag}`);
      this.log(`${chunkTag}: "${narrations[j]}"`);

      try {
        const audio = await generateAudio(narrations[j]);
        if (this.stopped) break;
        await this.playWithControls(audio, narrations[j]);
      } catch (e) {
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
   * Kick off a word-by-word subtitle animation.
   * Words appear at SUBTITLE_WORD_MS intervals, line-wrapping at SUBTITLE_MAX_CHARS.
   * Stopped automatically when playWithControls exits.
   */
  private startSubtitleAnimation(text: string): void {
    this.cancelSubtitleAnimation();

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let stopped  = false;
    let lineText  = "";
    let wordIdx   = 0;

    const advance = () => {
      if (stopped || this.stopped) return;
      if (wordIdx >= words.length) return;

      const word      = words[wordIdx++];
      const candidate = lineText ? `${lineText} ${word}` : word;

      lineText = candidate.length > SUBTITLE_MAX_CHARS ? word : candidate;

      this.showSubtitle?.(lineText);
      setTimeout(advance, SUBTITLE_WORD_MS);
    };

    advance();
    this.subtitleStopFn = () => { stopped = true; };
  }

  private cancelSubtitleAnimation(): void {
    this.subtitleStopFn?.();
    this.subtitleStopFn = null;
  }

  private clearSubtitle(): void {
    this.cancelSubtitleAnimation();
    this.hideSubtitle?.();
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  /**
   * Play `audio` with full pause / skip / deep-dive control.
   *
   * Loop fix: when togglePause() kills the audio process, play() resolves with
   * "next" immediately.  The `this.paused` check catches this and loops back
   * to waitForResume() + replay instead of advancing to the next block.
   *
   * Subtitle: word-by-word animation starts at the top of each loop iteration
   * (each time audio actually begins playing) and is cancelled on stop/skip.
   */
  private async playWithControls(audio: Buffer, subtitleText: string): Promise<Direction> {
    for (;;) {
      await this.waitForResume();
      if (this.stopped)         return "next";
      if (this.pendingDeepDive) return "next";
      if (this.pendingSkip !== null) {
        const dir = this.pendingSkip;
        this.pendingSkip = null;
        return dir;
      }

      // Start subtitle animation aligned with audio start
      this.startSubtitleAnimation(subtitleText);

      const player = new AudioPlayer();
      this.currentPlayer = player;

      const skipPromise  = new Promise<Direction>(r => { this.skipResolve = r; });
      const audioPromise = player.play(audio).then(() => "next" as Direction);

      const result = await Promise.race([audioPromise, skipPromise]);

      this.cancelSubtitleAnimation();
      player.stop();
      this.currentPlayer = null;
      this.skipResolve   = null;

      // Audio ended because pause killed the process → wait and replay
      if (result === "next" && this.paused) {
        continue;
      }

      return result;
    }
  }

  private async fallbackWait(ms: number): Promise<Direction> {
    await this.waitForResume();
    if (this.stopped) return "next";

    return new Promise<Direction>((resolve) => {
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

  private sendSignal(dir: Direction): void {
    if (this.skipResolve) {
      const r = this.skipResolve;
      this.skipResolve = null;
      this.currentPlayer?.stop();
      r(dir);
    } else {
      this.pendingSkip = dir;
      if (this.paused) {
        this.paused = false;
        const r = this.resumeResolve;
        this.resumeResolve = null;
        r?.();
      }
    }
  }

  private waitForResume(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise(r => { this.resumeResolve = r; });
  }

  private applyBlockDecoration(block: SemanticBlock): void {
    const range = new vscode.Range(
      new vscode.Position(block.startLine, 0),
      new vscode.Position(block.endLine, Number.MAX_SAFE_INTEGER)
    );
    this.editor.setDecorations(this.decorationType, [range]);
    this.editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  private cleanup(): void {
    this.cancelSubtitleAnimation();
    this.editor.setDecorations(this.decorationType,     []);
    this.editor.setDecorations(this.lineDecorationType, []);
    this.editor.setDecorations(this.qaDecorationType,   []);
    this.decorationType.dispose();
    this.lineDecorationType.dispose();
    this.qaDecorationType.dispose();
    this.clearStatus();
    this.hideSubtitle?.();
  }
}
