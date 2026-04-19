import * as vscode from "vscode";
import * as path from "path";
import { parseBlocks, filterImportantBlocks } from "./parser";
import { buildImportGraph, flattenDFS, ImportGraph, detectMainFile } from "./graph";
import { GraphPanel } from "./graphPanel";
import { WalkthroughSession, SessionCallbacks } from "./session";
import {
  ConfigManager, WalkthroughConfig, LLMProvider,
  GROQ_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS,
} from "./config";
import { OnboardingPanel } from "./onboarding";
import { setActiveConfig, callLLM } from "./narrate";
import { indexWorkspace, needsIndexing } from "./codebaseIndexer";
import { disposeEmbedder } from "./embedder";
import { AudioPlayer } from "./audioPlayer";
import { clearVideoCache } from "./videoRenderer";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let outputChannel: vscode.OutputChannel;
let activeSession: WalkthroughSession | null = null;
let activeGraphPanel: GraphPanel | null = null;
let configManager: ConfigManager;
let multiFileStop = false;

// ── Status bar items ──────────────────────────────────────────────────────────
// Only the info item remains — controls have moved into the GraphPanel.

let sbInfo: vscode.StatusBarItem;  // language · filename · block progress

let controlItems: vscode.StatusBarItem[] = [];

/** Language + filename prefix prepended to every setStatus message. */
let currentFilePrefix = "";

// ---------------------------------------------------------------------------
// Status bar helpers
// ---------------------------------------------------------------------------

function makeSBItem(
  priority: number,
  text: string,
  command: string | undefined,
  tooltip: string
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.text    = text;
  item.tooltip = tooltip;
  if (command) item.command = command;
  return item;
}

function initControlBar(): void {
  sbInfo = makeSBItem(120, "", undefined, "Walkthrough — current block");
  controlItems = [sbInfo];
}

/** Show or hide the status info item. */
function showControls(visible: boolean): void {
  controlItems.forEach(item => visible ? item.show() : item.hide());
}

/**
 * Build the language tag shown in the info item.
 * Uses the file-code codicon + the full language name — no emojis.
 *
 * VS Code's built-in Codicons don't include Python/TypeScript logos, so we use
 * the generic $(file-code) icon alongside the language name as plain text.
 */
function langLabel(languageId: string): string {
  const names: Record<string, string> = {
    python:           "Python",
    typescript:       "TypeScript",
    typescriptreact:  "TypeScript",
    javascript:       "JavaScript",
    javascriptreact:  "JavaScript",
  };
  return `$(file-code)  ${names[languageId] ?? languageId}`;
}

/** Build session callbacks that wire into the control bar and graph panel. */
function makeCallbacks(): SessionCallbacks {
  return {
    log,
    setStatus: (msg) => {
      sbInfo.text = `${currentFilePrefix}  ${msg}`;
    },
    clearStatus: () => {
      sbInfo.text = "";
    },
    setPaused: (paused) => {
      activeGraphPanel?.setPaused(paused);
    },
    showSubtitle: (_text, loading) => {
      if (loading) {
        activeGraphPanel?.postMessage({ type: "subtitle-loading" });
      }
      // Non-loading plain text falls through to showSubtitleWords for word animation
    },
    showSubtitleWords: (words, activeIndex, wordIntervalMs) => {
      activeGraphPanel?.postMessage({ type: "subtitle", words, activeIndex, intervalMs: wordIntervalMs });
    },
    hideSubtitle: () => {
      activeGraphPanel?.postMessage({ type: "subtitle-hide" });
    },
  };
}

// ---------------------------------------------------------------------------
// Root-file candidates (checked in order — first match wins)
// ---------------------------------------------------------------------------

const ROOT_CANDIDATES: { file: string; label: string }[] = [
  { file: "app.py",         label: "Flask / Python entry point" },
  { file: "main.py",        label: "Python entry point" },
  { file: "server.py",      label: "Python server entry point" },
  { file: "manage.py",      label: "Django management script" },
  { file: "wsgi.py",        label: "WSGI entry point" },
  { file: "run.py",         label: "Python run script" },
  { file: "application.py", label: "Python application" },
  { file: "index.ts",       label: "TypeScript entry point" },
  { file: "app.ts",         label: "TypeScript app entry point" },
  { file: "server.ts",      label: "TypeScript server entry point" },
  { file: "main.ts",        label: "TypeScript entry point" },
  { file: "index.js",       label: "JavaScript entry point" },
  { file: "app.js",         label: "JavaScript app entry point" },
];

const SUPPORTED_LANGUAGES = new Set(["typescript", "typescriptreact", "python", "javascript"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void { outputChannel.appendLine(msg); }

function setRunning(value: boolean): void {
  vscode.commands.executeCommand("setContext", "walkthrough.running", value);
  showControls(value);
}

async function findRootFile(): Promise<{ uri: vscode.Uri; label: string } | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;

  const wsRoot = folders[0].uri;
  log(`[scan] Workspace root: ${wsRoot.fsPath}`);

  for (const c of ROOT_CANDIDATES) {
    const uri = vscode.Uri.joinPath(wsRoot, c.file);
    try {
      await vscode.workspace.fs.stat(uri);
      log(`[scan] Found root file: ${c.file} (${c.label})`);
      return { uri, label: c.label };
    } catch { /* not found */ }
  }

  log("[scan] No known root file found in workspace root");
  return undefined;
}

// ---------------------------------------------------------------------------
// Multi-file walkthrough orchestrator
// ---------------------------------------------------------------------------

async function runMultiFileWalkthrough(
  extensionContext: vscode.ExtensionContext,
  rootUri: vscode.Uri,
  rootFileContext: string | undefined,
  sessionCfg?: WalkthroughConfig
): Promise<void> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    ?? path.dirname(rootUri.fsPath);

  // ── Build import graph ────────────────────────────────────────────────────
  log(`\n[graph] Building import graph from: ${rootUri.fsPath}`);

  sbInfo.text = "$(sync~spin)  Scanning codebase — building import map...";
  sbInfo.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  sbInfo.show();

  let graph: ImportGraph;
  try {
    graph = buildImportGraph(rootUri.fsPath, wsRoot);
    sbInfo.backgroundColor = undefined;  // clear loading highlight
    const total = graph.nodeMap.size;
    log(`[graph] Discovered ${total} file(s)`);
    flattenDFS(graph).forEach((n, i) =>
      log(`  ${String(i + 1).padStart(2)}. ${n.relativePath}`)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[graph] ERROR building graph: ${msg}`);
    sbInfo.backgroundColor = undefined;
    const doc    = await vscode.workspace.openTextDocument(rootUri);
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
    await runSingleFile(editor, rootFileContext, sessionCfg);
    return;
  }

  // ── Open / update KG panel ────────────────────────────────────────────────
  activeGraphPanel?.dispose();
  activeGraphPanel = new GraphPanel(extensionContext, graph);

  activeGraphPanel.onNodeClick(async (filePath) => {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
    } catch (e) { log(`[graph] Cannot open ${filePath}: ${e}`); }
  });

  activeGraphPanel.onControl((action) => {
    // Volume slider — update AudioPlayer level; takes effect on next block play
    if (action.startsWith("vol-")) {
      const level = parseInt(action.slice(4), 10);
      if (!isNaN(level)) AudioPlayer.volume = Math.max(0, Math.min(100, level));
      return;
    }
    // Language selection — log for now; future TTS routing hooks in here
    if (action.startsWith("lang-")) {
      log(`[lang] Subtitle language changed to: ${action.slice(5)}`);
      return;
    }
    switch (action) {
      case "prev":      activeSession?.prev();         break;
      case "pause":     activeSession?.togglePause();  break;
      case "next":      activeSession?.next();         break;
      case "deep-dive": activeSession?.deepDive();     break;
      case "skip-file": activeSession?.skipFile();     break;
      case "ask":       activeSession?.askQuestion();  break;
      case "stop":
        multiFileStop = true;
        activeSession?.stop();
        activeSession = null;
        activeGraphPanel?.dispose();
        activeGraphPanel = null;
        setRunning(false);
        break;
    }
  });

  // ── DFS traversal ────────────────────────────────────────────────────────
  const queue  = flattenDFS(graph);
  const seen   = new Set<string>();
  let completedCount = 0;
  let skippedCount   = 0;

  for (const node of queue) {
    if (multiFileStop) break;

    if (seen.has(node.id)) {
      log(`[graph] ${node.relativePath} — already explained, skipping duplicate`);
      continue;
    }
    seen.add(node.id);

    // Open file — always in column One so the graph panel never gets pushed aside
    let editor: vscode.TextEditor;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(node.file));
      editor    = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
    } catch (e) {
      log(`[graph] Cannot open ${node.relativePath}: ${e}`);
      node.status = "skipped";
      activeGraphPanel?.update(graph.root);
      skippedCount++;
      continue;
    }

    // Mark active
    node.status = "active";
    activeGraphPanel?.update(graph.root);
    activeGraphPanel?.reveal();

    // Parse blocks
    let blocks;
    try {
      log(`\n[parse] ${node.relativePath} (${node.language})`);
      blocks = parseBlocks(editor.document.getText(), node.language);
      const allCount = blocks.length;
      blocks = filterImportantBlocks(blocks);
      log(`⚡ Filtered ${allCount} blocks → ${blocks.length} important blocks remain`);
      blocks.forEach((b, i) =>
        log(`  [${i + 1}] ${b.label}  (lines ${b.startLine + 1}–${b.endLine + 1})`)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[parse] ERROR: ${msg}`);
      node.status = "skipped";
      activeGraphPanel?.update(graph.root);
      skippedCount++;
      continue;
    }

    if (blocks.length === 0) {
      log(`[parse] No blocks — ${node.relativePath}`);
      node.status = "completed";
      activeGraphPanel?.update(graph.root);
      completedCount++;
      continue;
    }

    // Set file prefix for info item
    currentFilePrefix = `${langLabel(node.language)}  ·  ${path.basename(node.file)}`;

    const ctx     = node.depth === 0 ? rootFileContext : undefined;
    const session = new WalkthroughSession(editor, blocks, ctx ?? null, makeCallbacks(),
      sessionCfg && activeGraphPanel ? {
        wsRoot,
        filePath: node.file,
        panel:    activeGraphPanel,
        cfg:      sessionCfg,
      } : undefined
    );

    activeSession = session;
    log(`[session] ${node.relativePath}  (⏮←  ⏸Space  ⏭→  S:Skip  D:Dive  F:SkipFile  Q:Ask  Esc:Stop)`);

    let result: Awaited<ReturnType<typeof session.run>>;
    try {
      result = await session.run();
    } finally {
      if (activeSession === session) activeSession = null;
    }

    if (multiFileStop || result === "stopped") {
      node.status = "pending";
      activeGraphPanel?.update(graph.root);
      break;
    }

    node.status = result === "file-skipped" ? "skipped" : "completed";
    activeGraphPanel?.update(graph.root);

    if (result === "file-skipped") skippedCount++;
    else completedCount++;

    log(`[graph] ${node.relativePath} → ${node.status}`);
  }

  if (!multiFileStop) {
    const total = queue.length;
    const msg = `Walkthrough complete — ${completedCount} explained, ${skippedCount} skipped (${total} files total)`;
    log(`\n── ${msg} ──`);
    vscode.window.showInformationMessage(msg);
  }
}

// ---------------------------------------------------------------------------
// Single-file helper (standalone or fallback)
// ---------------------------------------------------------------------------

async function runSingleFile(
  editor: vscode.TextEditor,
  fileContext?: string,
  sessionCfg?: WalkthroughConfig
): Promise<void> {
  const { languageId, fileName } = editor.document;
  log(`[launch] File: ${fileName}  Language: ${languageId}`);

  let blocks;
  try {
    log("[parse] Parsing...");
    blocks = parseBlocks(editor.document.getText(), languageId);
    const allCount = blocks.length;
    blocks = filterImportantBlocks(blocks);
    log(`⚡ Filtered ${allCount} blocks → ${blocks.length} important blocks remain`);
    blocks.forEach((b, i) =>
      log(`  [${i + 1}] ${b.label}  (lines ${b.startLine + 1}–${b.endLine + 1})`)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[ERROR] Parse failed: ${msg}`);
    if (err instanceof Error && err.stack) log(err.stack);
    vscode.window.showErrorMessage(`Walkthrough parse error — ${msg}`);
    return;
  }

  if (blocks.length === 0) {
    vscode.window.showWarningMessage("Walkthrough: No blocks found in this file.");
    return;
  }

  currentFilePrefix = `${langLabel(languageId)}  ·  ${path.basename(fileName)}`;

  const sfWsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    ?? path.dirname(editor.document.uri.fsPath);
  const session = new WalkthroughSession(editor, blocks, fileContext ?? null, makeCallbacks(),
    sessionCfg ? {
      wsRoot:   sfWsRoot,
      filePath: editor.document.fileName,
      panel:    activeGraphPanel ?? { postMessage: () => undefined },
      cfg:      sessionCfg,
    } : undefined
  );
  activeSession = session;

  log("[session] ⏮←  ⏸Space  ⏭→  S:Skip  D:Dive  Q:Ask  Esc:Stop");

  await session.run();
  if (activeSession === session) activeSession = null;
}

// ---------------------------------------------------------------------------
// Model picker — shown every time the user starts a walkthrough
// ---------------------------------------------------------------------------

type ModelPickItem = vscode.QuickPickItem & {
  provider?: LLMProvider;
  modelId?:  string;
  isConfig?: boolean;
};

async function showModelPicker(): Promise<{ provider: LLMProvider; model: string } | undefined> {
  const current = await configManager.getConfig();

  const items: ModelPickItem[] = [];

  // ── Currently active (always visible at top) ────────────────────────────
  items.push({
    label:       `$(check)  ${current.provider}  ·  ${current.model}`,
    description: "currently active — press Enter to keep",
    provider:    current.provider,
    modelId:     current.model,
    alwaysShow:  true,
  });

  // ── Groq ─────────────────────────────────────────────────────────────────
  items.push({ kind: vscode.QuickPickItemKind.Separator, label: "Groq — Free open-source models" });
  for (const m of GROQ_MODELS) {
    items.push({
      label:       `$(cloud)  ${m.label}`,
      description: `groq · ${m.id}`,
      provider:    "groq",
      modelId:     m.id,
    });
  }

  // ── OpenAI ───────────────────────────────────────────────────────────────
  items.push({ kind: vscode.QuickPickItemKind.Separator, label: "OpenAI" });
  for (const m of OPENAI_MODELS) {
    items.push({
      label:       `$(cloud)  ${m.label}`,
      description: `openai · ${m.id}`,
      provider:    "openai",
      modelId:     m.id,
    });
  }

  // ── Anthropic ────────────────────────────────────────────────────────────
  items.push({ kind: vscode.QuickPickItemKind.Separator, label: "Anthropic" });
  for (const m of ANTHROPIC_MODELS) {
    items.push({
      label:       `$(cloud)  ${m.label}`,
      description: `anthropic · ${m.id}`,
      provider:    "anthropic",
      modelId:     m.id,
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  items.push({ kind: vscode.QuickPickItemKind.Separator, label: "" });
  items.push({
    label:    "$(settings-gear)  Configure API keys...",
    description: "Open the Walkthrough setup wizard",
    isConfig: true,
    alwaysShow: true,
  });

  const pick = await vscode.window.showQuickPick(items, {
    title:             "Walkthrough — Choose Model",
    placeHolder:       "Select AI model for this session  (Esc to cancel)",
    matchOnDescription: true,
    ignoreFocusOut:    false,
  });

  if (!pick) return undefined;   // user pressed Esc

  if (pick.isConfig) {
    vscode.commands.executeCommand("walkthrough.configure");
    return undefined;
  }

  return { provider: pick.provider!, model: pick.modelId! };
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

async function loadAndApplyConfig(): Promise<WalkthroughConfig> {
  const cfg = await configManager.getConfig();
  setActiveConfig(cfg);
  log(`[config] Provider: ${cfg.provider}  Model: ${cfg.model}`);
  return cfg;
}

function openOnboarding(context: vscode.ExtensionContext, prefill: Partial<WalkthroughConfig>): void {
  new OnboardingPanel(
    context,
    prefill,
    async (cfg) => {
      await configManager.saveConfig(cfg);
      setActiveConfig(cfg);
      log(`[config] Saved — Provider: ${cfg.provider}  Model: ${cfg.model}`);
      vscode.window.showInformationMessage("Walkthrough configuration saved!");
    },
    async (cfg): Promise<{ ok: boolean; message: string }> => {
      try {
        // Test with a tiny prompt
        const reply = await (async () => {
          const saved = cfg;
          setActiveConfig(saved);
          return callLLM("Respond with exactly one word: OK", "Test", 10);
        })();
        return { ok: true, message: `Connection successful — model replied: "${reply.slice(0, 30)}"` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg.slice(0, 200) };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Cinematic indexing UI — shown before every session
// ---------------------------------------------------------------------------

/** Shown while connecting / preparing — before file-by-file progress starts. */
const INDEXING_VIBES = [
  "🧠  Waking up the neural networks...",
  "📡  Connecting to Jina AI embeddings...",
  "🔮  Preparing your Qdrant vector store...",
  "⚡  Getting ready to read every line...",
  "🎯  Building semantic understanding of your code...",
  "🚀  Weaving intelligence into your codebase...",
  "✨  Teaching the AI about your architecture...",
];

async function runIndexingWithUI(
  wsRoot:  string,
  cfg:     WalkthroughConfig
): Promise<void> {
  // Phase 1 (setup/connect): rotate vibe messages.
  // Phase 2 (file loop): show actual file progress instead.
  let vibeIdx = 0;
  let inFilePhase = false;

  const vibeTimer = setInterval(() => {
    if (!inFilePhase) {
      activeGraphPanel?.postMessage({ type: "subtitle-loading" });
      // Update the loading text by cycling vibes via a plain subtitle message
      const vibe = INDEXING_VIBES[vibeIdx % INDEXING_VIBES.length];
      activeGraphPanel?.postMessage({
        type: "subtitle",
        words: vibe.split(/\s+/).filter(Boolean),
        activeIndex: -1,
      });
      vibeIdx++;
    }
  }, 1800);

  activeGraphPanel?.postMessage({ type: "subtitle-loading" });

  try {
    let result = { indexed: 0, skipped: 0, files: 0 };

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:    "$(sync~spin)  Walkthrough — Building Knowledge Base",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Initialising..." });

        try {
          result = await indexWorkspace(
            wsRoot,
            cfg,
            (p) => {
              progress.report({ message: p.message, increment: p.increment });
              log(`[index] ${p.message}`);

              // Once we hit actual file processing, switch subtitle to live progress.
              if (p.total > 0) {
                inFilePhase = true;
                const pct  = Math.round((p.current / p.total) * 100);
                const icon = p.message.startsWith("✓") ? "✓" : "⚡";
                const text = `${icon}  ${p.message}  —  ${pct}% (${p.current} / ${p.total} files)`;
                activeGraphPanel?.postMessage({
                  type: "subtitle",
                  words: text.split(/\s+/).filter(Boolean),
                  activeIndex: -1,
                });
              }
            },
            log
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log(`[index] ERROR: ${msg}`);
          // Non-fatal — walkthrough still runs; Q&A won't work until Qdrant is up.
          vscode.window.showWarningMessage(
            `Walkthrough: Indexing failed — ${msg.slice(0, 120)}. Q&A may not work.`
          );
          return;
        }

        const summary = result.indexed > 0
          ? `$(check)  ${result.indexed} new blocks  ·  ${result.skipped} cached`
          : `$(check)  Knowledge base up to date  (${result.skipped} blocks)`;
        progress.report({ message: summary });
        await delay(1500);
      }
    );

    // 🎬 Cinematic finale
    clearInterval(vibeTimer);

    const total = result.indexed + result.skipped;
    if (total > 0) {
      const newLabel = result.indexed > 0 ? `${result.indexed} new` : "all";
      const line1 = `🎯  ${total} code blocks in Qdrant — ${newLabel} indexed, AI knows your codebase.`;
      activeGraphPanel?.postMessage({
        type: "subtitle",
        words: line1.split(/\s+/).filter(Boolean),
        activeIndex: -1,
      });
      await delay(2200);
      const line2 = "🎬  The stage is set.  Lights, camera...  action!";
      activeGraphPanel?.postMessage({
        type: "subtitle",
        words: line2.split(/\s+/).filter(Boolean),
        activeIndex: -1,
      });
      await delay(2000);
    }

    activeGraphPanel?.postMessage({ type: "subtitle-hide" });

  } finally {
    clearInterval(vibeTimer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Walkthrough");
  outputChannel.show(true);

  // Config manager (SecretStorage + VS Code settings)
  configManager = new ConfigManager(context.secrets);

  // Build the control bar (hidden until a session starts)
  initControlBar();
  controlItems.forEach(item => context.subscriptions.push(item));

  setRunning(false);

  // ── walkthrough.configure — open onboarding/settings wizard ──────────────
  const configure = vscode.commands.registerCommand("walkthrough.configure", async () => {
    const prefill = await configManager.getConfig();
    openOnboarding(context, prefill);
  });

  // ── walkthrough.explain ───────────────────────────────────────────────────
  const explain = vscode.commands.registerCommand("walkthrough.explain", async () => {
    // Check config — show onboarding if not set up yet
    if (!(await configManager.isConfigured())) {
      vscode.window.showInformationMessage(
        "Walkthrough needs to be configured first.",
        "Open Setup"
      ).then(choice => {
        if (choice === "Open Setup") {
          vscode.commands.executeCommand("walkthrough.configure");
        }
      });
      return;
    }

    multiFileStop = true;
    activeSession?.stop();
    activeSession = null;

    outputChannel.clear();
    outputChannel.show(true);
    log("=== Walkthrough triggered ===");

    // ── Model picker — user selects provider + model before every session ────
    const picked = await showModelPicker();
    if (!picked) {
      // User pressed Esc or opened Configure — don't start
      setRunning(false);
      return;
    }

    // Apply the chosen provider + model on top of saved config (keys stay)
    const baseConfig = await configManager.getConfig();
    const sessionConfig: WalkthroughConfig = {
      ...baseConfig,
      provider: picked.provider,
      model:    picked.model,
    };
    setActiveConfig(sessionConfig);
    log(`[config] Session: ${picked.provider} · ${picked.model}`);

    // ── Indexing (builds/updates Qdrant vector store) ────────────────────────
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsRoot) clearVideoCache(wsRoot);
    if (wsRoot) {
      if (needsIndexing(wsRoot, sessionConfig)) {
        log("[index] New or changed files detected — starting indexing.");
        await runIndexingWithUI(wsRoot, sessionConfig);
      } else {
        log("[index] All files cached and unchanged — skipping indexing.");
        activeGraphPanel?.postMessage({
          type: "subtitle",
          words: ["✓", "Codebase", "knowledge", "is", "up", "to", "date."],
          activeIndex: -1,
        });
        await delay(1400);
        activeGraphPanel?.postMessage({ type: "subtitle-hide" });
      }
    }

    setRunning(true);
    multiFileStop = false;

    try {
      const mainFile = await detectMainFile(wsRoot ?? "");

      if (!mainFile) {
        log("[detect] No entry point detected.");
        vscode.window.showWarningMessage(
          "Walkthrough: Could not detect an entry point. " +
          "Open app.py / main.py / index.ts and try again."
        );
        return;
      }

      log(`🎯 Entry point detected: ${path.basename(mainFile)}`);

      const mainUri = vscode.Uri.file(mainFile);
      const doc     = await vscode.workspace.openTextDocument(mainUri);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
      await runMultiFileWalkthrough(context, mainUri, undefined, sessionConfig);

    } finally {
      setRunning(false);
      multiFileStop = false;
    }
  });

  // ── walkthrough.togglePause (Space) ──────────────────────────────────────
  const togglePause = vscode.commands.registerCommand("walkthrough.togglePause", () => {
    activeSession?.togglePause();
  });

  // ── walkthrough.next (→) ─────────────────────────────────────────────────
  const next = vscode.commands.registerCommand("walkthrough.next", () => {
    activeSession?.next();
  });

  // ── walkthrough.prev (←) ─────────────────────────────────────────────────
  const prev = vscode.commands.registerCommand("walkthrough.prev", () => {
    activeSession?.prev();
  });

  // ── walkthrough.stop (Escape) ────────────────────────────────────────────
  const stop = vscode.commands.registerCommand("walkthrough.stop", () => {
    multiFileStop = true;
    if (activeSession) {
      activeSession.stop();
      activeSession = null;
    }
    activeGraphPanel?.dispose();
    activeGraphPanel = null;
    setRunning(false);
    log("[session] Stopped by user");
  });

  // ── walkthrough.ask (Q) ──────────────────────────────────────────────────
  const ask = vscode.commands.registerCommand("walkthrough.ask", () => {
    activeSession?.askQuestion();
  });

  // ── walkthrough.deepDive (D) ─────────────────────────────────────────────
  const deepDive = vscode.commands.registerCommand("walkthrough.deepDive", () => {
    activeSession?.deepDive();
  });

  // ── walkthrough.skipLine (S) ─────────────────────────────────────────────
  const skipLine = vscode.commands.registerCommand("walkthrough.skipLine", () => {
    activeSession?.skipLine();
  });

  // ── walkthrough.skipFile (F) ─────────────────────────────────────────────
  const skipFile = vscode.commands.registerCommand("walkthrough.skipFile", () => {
    activeSession?.skipFile();
  });

  context.subscriptions.push(
    outputChannel,
    configure,
    explain, togglePause, next, prev, stop, ask, deepDive, skipLine, skipFile
  );

  // Show onboarding automatically on first install (non-blocking)
  configManager.isConfigured().then(configured => {
    if (!configured) {
      log("[onboarding] First run detected — opening setup wizard");
      configManager.getConfig().then(prefill => openOnboarding(context, prefill));
    }
  });
}

export function deactivate(): void {
  multiFileStop = true;
  activeSession?.stop();
  activeSession = null;
  activeGraphPanel?.dispose();
  activeGraphPanel = null;
  setRunning(false);
  disposeEmbedder();
}
