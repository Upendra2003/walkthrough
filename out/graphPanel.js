"use strict";
/**
 * GraphPanel — unified right-panel WebviewPanel.
 *
 * Layout (flex column, 100vh):
 *   1. #graph-section    — scrollable file tree           (flex: 1)
 *   2. #subtitle-section — fixed-height subtitle zone     (88px, no lang tag)
 *   3. #progress-track   — animated read-line             (3px, pure #FF0000)
 *   4. #controls-bar     — video-player controls
 *
 * Font: Source Sans 3 (Google Fonts)
 *
 * Controls layout:
 *   LEFT  — [LeftSkip] [Pause/Play] [RightSkip]
 *   RIGHT — [Volume/DeepDive] [Subtitle/LangPicker] [?/Ask] | [▶ Next File] [⏹]
 *
 * Extension → webview:
 *   { type:'update', tree }
 *   { type:'subtitle', words, activeIndex }
 *   { type:'subtitle-loading' }
 *   { type:'subtitle-hide' }
 *   { type:'subtitle-language', code, label }
 *   { type:'set-paused', paused }
 *
 * Webview → extension:
 *   { type:'navigate', file }
 *   { type:'control', action }   prev|pause|next|deep-dive|ask|skip-file|stop|lang-en|lang-hi|lang-kn|lang-te
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphPanel = void 0;
const vscode = require("vscode");
const PYTHON_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" ' +
    'xmlns="http://www.w3.org/2000/svg" fill="currentColor">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.3753 4.5C13.1843 4.47123 ' +
    '13.2789 4.49306 13.4486 4.55176V4.54395C14.1194 4.7788 14.5896 5.47487 14.8734 ' +
    '6.65137C14.9865 7.12094 15.025 7.68709 14.9837 8.29199C14.9233 9.18038 14.8062 ' +
    '9.6891 14.5316 10.2539C14.3848 10.5557 14.3251 10.6424 14.1165 10.8555C13.853 ' +
    '11.1246 13.581 11.283 13.2513 11.3604C13.126 11.3891 12.4354 11.4037 10.5111 ' +
    '11.417L7.93686 11.4346V11.834L11.307 11.8574L11.3246 11.9258C11.3539 12.0363 ' +
    '11.3455 13.1035 11.3128 13.418C11.263 13.8965 11.1644 14.1505 10.93 14.4043C10.7617 ' +
    '14.5865 10.3997 14.7712 10.0414 14.8584C9.52503 14.9841 9.29118 15 7.95151 15C6.59702 ' +
    '15 6.25423 14.9759 5.86362 14.8564C5.32957 14.6925 4.78274 14.1894 4.62045 13.7119C4.51552 ' +
    '13.4031 4.49987 13.0873 4.50033 11.3516C4.50082 9.51205 4.46186 9.28047 4.62924 ' +
    '8.96387C4.80669 8.62897 4.83627 8.64518 5.2435 8.49121C5.41307 8.42758 5.81874 ' +
    '8.4435 7.56283 8.4375C9.44234 8.4255 10.6953 8.45988 11.013 8.36035C11.4851 8.21186 ' +
    '11.9904 8.00177 12.1996 7.57324C12.3987 7.16514 12.3609 6.89967 12.3753 5.8125V4.5Z' +
    'M10.1175 12.793C9.94476 12.7115 9.66961 12.7316 9.50912 12.8408C9.30759 12.977 ' +
    '9.23867 13.1112 9.23862 13.3691C9.23862 13.5669 9.24863 13.6061 9.33139 13.7246C9.52047 ' +
    '13.997 9.86114 14.0813 10.1546 13.9287C10.619 13.6866 10.5974 13.0215 10.1175 12.793Z"/>' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M8.04819 1C9.40318 1 9.74628 1.02409 ' +
    '10.1371 1.14355C10.671 1.30765 11.217 1.81077 11.3792 2.28809C11.4842 2.59689 11.5008 ' +
    '2.91281 11.5003 4.64844C11.4998 6.48793 11.4929 6.56819 11.3255 6.88477C11.148 7.21991 ' +
    '10.8158 7.36065 10.4085 7.51465C10.239 7.57828 10.1816 7.5565 8.43783 7.5625C6.55843 ' +
    '7.57451 4.99071 7.5544 4.57651 7.70215C4.1043 7.85067 3.92818 8.01266 3.71908 8.44141C3.54503 ' +
    '8.79845 3.61477 9.37003 3.62533 10.2354V11.5C2.81561 11.5288 2.72101 11.507 2.55112 ' +
    '11.4482V11.4561C1.88029 11.2213 1.41007 10.5252 1.12631 9.34863C1.01316 8.87907 0.974754 ' +
    '8.31288 1.01596 7.70801C1.07643 6.81954 1.19436 6.31098 1.46908 5.74609C1.61585 5.44433 ' +
    '1.67544 5.35774 1.88412 5.14453C2.14751 4.87556 2.41874 4.71708 2.74838 4.63965C2.87299 ' +
    '4.61084 3.56384 4.59622 5.48959 4.58301L8.06283 4.56543V4.16602L4.69369 4.14258L4.67514 ' +
    '4.07422C4.64585 3.96376 4.65425 2.8966 4.68686 2.58203C4.73665 2.10355 4.83534 1.84948 ' +
    '5.06967 1.5957C5.23792 1.41359 5.59992 1.22878 5.95834 1.1416C6.47478 1.0159 6.70835 1 ' +
    '8.04819 1ZM6.6683 2.27539C6.47915 2.00309 6.13851 1.91849 5.84506 2.07129C5.38063 2.31333 ' +
    '5.40229 2.97852 5.88217 3.20703C6.05485 3.28864 6.33 3.26833 6.49057 3.15918C6.69213 ' +
    '3.02307 6.76103 2.88881 6.76108 2.63086C6.76108 2.43311 6.75106 2.39389 6.6683 2.27539Z"/>' +
    '</svg>';
class GraphPanel {
    constructor(context, graph) {
        this.clickCallback = null;
        this.controlCallback = null;
        this.disposed = false;
        const assetsUri = vscode.Uri.joinPath(context.extensionUri, "assets");
        this.panel = vscode.window.createWebviewPanel("walkthroughGraph", "Walkthrough — Codebase Map", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [assetsUri],
        });
        const w = this.panel.webview;
        const uri = (file) => w.asWebviewUri(vscode.Uri.joinPath(assetsUri, file)).toString();
        const icons = {
            play: uri("Video-PlayButton.png"),
            pause: uri("Video-PauseButton.png"),
            leftSkip: uri("Video-LeftSkip.png"),
            rightSkip: uri("Video-RightSkip.png"),
            backPlay: uri("Video-BackPlayButton.png"),
            subtitle: uri("Video-Subtitle.png"),
            volume: uri("Video-Volume.png"),
        };
        w.html = buildHtml(graph.root, w.cspSource, icons);
        w.onDidReceiveMessage((msg) => {
            if (msg.type === "navigate" && msg.file && this.clickCallback) {
                this.clickCallback(msg.file);
            }
            if (msg.type === "control" && msg.action && this.controlCallback) {
                this.controlCallback(msg.action);
            }
        }, undefined, context.subscriptions);
        this.panel.onDidDispose(() => { this.disposed = true; }, undefined, context.subscriptions);
    }
    update(root) {
        if (this.disposed)
            return;
        this.panel.webview.postMessage({ type: "update", tree: serializeNode(root) });
    }
    postMessage(msg) {
        if (!this.disposed)
            this.panel.webview.postMessage(msg);
    }
    setPaused(paused) {
        if (!this.disposed)
            this.panel.webview.postMessage({ type: "set-paused", paused });
    }
    onNodeClick(cb) { this.clickCallback = cb; }
    onControl(cb) { this.controlCallback = cb; }
    reveal() {
        if (!this.disposed)
            this.panel.reveal(vscode.ViewColumn.Beside, true);
    }
    dispose() {
        if (!this.disposed)
            this.panel.dispose();
    }
}
exports.GraphPanel = GraphPanel;
function serializeNode(n) {
    return {
        id: n.id, relativePath: n.relativePath, language: n.language, status: n.status,
        children: n.children.map(serializeNode),
    };
}
// ── HTML ───────────────────────────────────────────────────────────────────────
function buildHtml(root, cspSource, icons) {
    const initialJson = JSON.stringify(serializeNode(root)).replace(/</g, "\\u003c");
    const pythonSvgJs = JSON.stringify(PYTHON_SVG);
    const iconsJs = JSON.stringify(icons);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; font-src https://fonts.gstatic.com; style-src 'unsafe-inline' https://fonts.googleapis.com; script-src 'unsafe-inline'; img-src ${cspSource};">
<style>
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,200..900;1,200..900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }

body {
  background: var(--vscode-editor-background, #1e1e2e);
  color: var(--vscode-foreground, #cdd6f4);
  font-family: 'Source Sans 3', var(--vscode-font-family, 'Segoe UI'), system-ui, sans-serif;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  user-select: none;
}

/* ════ Graph section ════ */
#graph-section {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px 12px;
  min-height: 0;
}

#header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
#header h2 {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--vscode-textLink-foreground, #89b4fa);
  flex: 1;
}
#stats {
  font-size: 10px;
  color: var(--vscode-descriptionForeground, #6c7086);
  font-style: italic;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  margin: 1px 0;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.12s;
}
.node-row:hover    { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
.node-row.active   { background: rgba(249,226,175,0.09); border-left-color: #f9e2af; }
.node-row.completed{ background: rgba(166,227,161,0.07); border-left-color: #a6e3a1; }
.node-row.skipped  { opacity: 0.38; }

.chapter-num {
  font-size: 9.5px;
  color: rgba(255,255,255,0.18);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 18px;
  font-weight: 500;
}
.node-row.active    .chapter-num { color: rgba(249,226,175,0.45); }
.node-row.completed .chapter-num { color: rgba(166,227,161,0.38); }

.icon {
  width: 16px; text-align: center; font-size: 11px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--vscode-descriptionForeground, #6c7086);
}
.node-row.active    .icon { color: #f9e2af; }
.node-row.completed .icon { color: #a6e3a1; }

.filename {
  flex: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 12.5px; font-weight: 400;
}
.node-row.active    .filename { color: #f9e2af; font-weight: 600; }
.node-row.completed .filename { color: #a6e3a1; }
.node-row.skipped   .filename { text-decoration: line-through; color: #6c7086; }

.children {
  margin-left: 24px;
  border-left: 1px solid rgba(255,255,255,0.05);
  padding-left: 4px;
}

#legend {
  margin-top: 14px;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.05);
  font-size: 10px;
  color: var(--vscode-descriptionForeground, #6c7086);
  display: flex; flex-wrap: wrap; gap: 10px;
}
.legend-item { display: flex; align-items: center; gap: 4px; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-active  { background: #f9e2af; }
.dot-done    { background: #a6e3a1; }
.dot-skipped { background: #6c7086; }
.dot-pending { background: #3b3d52; }

/* ════ Subtitle section (no lang tag) ════ */
#subtitle-section {
  flex-shrink: 0;
  height: 88px;
  overflow: hidden;
  border-top: 0.5px solid rgba(255,255,255,0.07);
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  transition: opacity 0.25s ease;
}
#subtitle-section.hidden {
  opacity: 0;
  pointer-events: none;
  height: 0;
  padding: 0;
  border-top-width: 0;
}

#subtitle-inner { width: 100%; text-align: center; overflow: hidden; }

#subtitle-words {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 18px; font-weight: 400; line-height: 1.55;
  color: white;
  word-break: break-word; overflow-wrap: break-word;
}
#subtitle-words.devanagari { font-family: 'Noto Sans Devanagari', 'Source Sans 3', sans-serif; }
#subtitle-words.tamil      { font-family: 'Noto Sans Tamil',       'Source Sans 3', sans-serif; }
#subtitle-words.kannada    { font-family: 'Noto Sans Kannada',     'Source Sans 3', sans-serif; }
#subtitle-words.telugu     { font-family: 'Noto Sans Telugu',      'Source Sans 3', sans-serif; }

.word { display: inline; transition: opacity 0.12s ease; }
.word.done    { opacity: 0.35; color: white; }
.word.active  { opacity: 1.0;  color: white; filter: brightness(1.15); font-weight: 600; }
.word.pending { opacity: 0.16; color: white; }

#subtitle-loading-msg {
  font-family: 'Source Sans 3', sans-serif;
  font-size: 18px; font-weight: 300;
  color: rgba(255,255,255,0.28); font-style: italic;
  display: none;
}
@keyframes subtitlePulse {
  0%, 100% { opacity: 0.15; }
  50%       { opacity: 0.5; }
}
#subtitle-loading-msg.pulsing {
  display: block;
  animation: subtitlePulse 1.6s ease infinite;
}

/* ════ Progress / read-line — pure #FF0000, no glow ════ */
#progress-track {
  flex-shrink: 0;
  height: 3px;
  background: rgba(255,255,255,0.05);
  position: relative;
}
#progress-fill {
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  width: 0%;
  background: #FF0000;
  /* transition matches SUBTITLE_WORD_MS = 450ms → bar flows continuously */
  transition: width 0.45s linear;
}

/* ════ Controls bar ════ */
#controls-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 6px 14px 8px;
  background: rgba(0,0,0,0.52);
  gap: 4px;
}

#ctrl-primary {
  display: flex; align-items: center; gap: 2px;
}
#ctrl-secondary {
  display: flex; align-items: center; gap: 2px;
  margin-left: auto;
}

/* Base icon button */
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px 6px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.6;
  transition: opacity 0.14s, background 0.14s;
  flex-shrink: 0;
}
.icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.09); }
.icon-btn img { width: 20px; height: 20px; object-fit: contain; display: block; }

/* Pause/play — 24px */
#btn-pause       { opacity: 0.88; padding: 4px 10px; }
#btn-pause:hover { opacity: 1; }
#btn-pause img   { width: 24px; height: 24px; }

/* Small utility icon buttons */
.icon-btn-sm img { width: 17px; height: 17px; }

/* Thin separator */
.ctrl-sep {
  width: 1px; height: 16px;
  background: rgba(255,255,255,0.09);
  flex-shrink: 0; margin: 0 4px;
}

/* ── Volume picker ── */
.vol-wrap { position: relative; }

#vol-picker {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(18,18,30,0.97);
  border: 1px solid rgba(255,255,255,0.13);
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0,0,0,0.55);
  min-width: 130px;
}
#vol-picker.hidden { display: none; }

#vol-label {
  font-family: 'Source Sans 3', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.55);
  letter-spacing: 0.04em;
}

#vol-slider {
  width: 100px;
  cursor: pointer;
  accent-color: #f9e2af;
  height: 4px;
}

/* ── Language picker ── */
.lang-wrap { position: relative; }

#lang-picker {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: rgba(18, 18, 30, 0.97);
  border: 1px solid rgba(255,255,255,0.13);
  border-radius: 8px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 120px;
  z-index: 200;
  /* subtle shadow */
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
#lang-picker.hidden { display: none; }
.lang-opt {
  background: none;
  border: none;
  color: rgba(255,255,255,0.65);
  font-family: 'Source Sans 3', sans-serif;
  font-size: 12.5px;
  font-weight: 400;
  padding: 6px 12px;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
}
.lang-opt:hover   { background: rgba(255,255,255,0.09); color: white; }
.lang-opt.active  { color: #f9e2af; background: rgba(249,226,175,0.1); font-weight: 600; }

/* ── Question mark (Ask) ── */
.ctrl-ask {
  background: none; border: none; cursor: pointer;
  color: rgba(255,255,255,0.45);
  font-size: 16px; font-weight: 700;
  padding: 4px 6px;
  border-radius: 6px;
  font-family: 'Source Sans 3', sans-serif;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
}
.ctrl-ask:hover { color: white; background: rgba(255,255,255,0.09); }

/* ── Next File rectangle button ── */
#btn-next-file {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px 4px 9px;
  background: rgba(255,255,255,0.9);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  color: #111;
  font-family: 'Source Sans 3', sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 0.12s;
  flex-shrink: 0;
}
#btn-next-file:hover { background: #ffffff; }
/* Black play triangle inside the button */
.next-tri {
  width: 0; height: 0;
  border-style: solid;
  border-width: 5px 0 5px 9px;
  border-color: transparent transparent transparent #111111;
  flex-shrink: 0;
}

/* ── Stop ── */
.ctrl-stop {
  background: none; border: none; cursor: pointer;
  color: rgba(220,70,70,0.4);
  font-size: 14px;
  padding: 3px 5px; border-radius: 5px;
  transition: color 0.12s, background 0.12s;
}
.ctrl-stop:hover { color: rgba(220,70,70,0.9); background: rgba(220,70,70,0.1); }
</style>
</head>
<body>

<!-- ① File tree -->
<div id="graph-section">
  <div id="header">
    <h2>&#x2B21; Codebase Map</h2>
    <span id="stats"></span>
  </div>
  <div id="tree"></div>
  <div id="legend">
    <span class="legend-item"><span class="dot dot-active"></span>active</span>
    <span class="legend-item"><span class="dot dot-done"></span>done</span>
    <span class="legend-item"><span class="dot dot-skipped"></span>skipped</span>
    <span class="legend-item"><span class="dot dot-pending"></span>pending</span>
  </div>
</div>

<!-- ② Subtitle (no lang tag) -->
<div id="subtitle-section" class="hidden">
  <div id="subtitle-inner">
    <div id="subtitle-words"></div>
    <div id="subtitle-loading-msg"></div>
  </div>
</div>

<!-- ③ Progress read-line -->
<div id="progress-track">
  <div id="progress-fill"></div>
</div>

<!-- ④ Video-player controls -->
<div id="controls-bar">

  <!-- Left: prev / pause / next -->
  <div id="ctrl-primary">
    <button class="icon-btn" data-action="prev" title="Previous block  \u2190">
      <img src="${icons.leftSkip}" alt="Prev">
    </button>
    <button class="icon-btn" id="btn-pause" data-action="pause" title="Pause / Resume  Space">
      <img id="pause-icon" src="${icons.pause}" alt="Pause">
    </button>
    <button class="icon-btn" data-action="next" title="Next block  \u2192">
      <img src="${icons.rightSkip}" alt="Next">
    </button>
  </div>

  <!-- Right: utilities -->
  <div id="ctrl-secondary">

    <!-- Deep Dive -->
    <button class="icon-btn icon-btn-sm" data-action="deep-dive" title="Deep Dive  D">
      <img src="${icons.backPlay}" alt="Deep Dive">
    </button>

    <!-- Volume slider -->
    <div class="vol-wrap">
      <button class="icon-btn icon-btn-sm" id="btn-vol" title="Volume">
        <img src="${icons.volume}" alt="Volume">
      </button>
      <div id="vol-picker" class="hidden">
        <div id="vol-label">80%</div>
        <input type="range" id="vol-slider" min="0" max="100" value="80" step="5">
      </div>
    </div>

    <!-- Subtitle icon → language picker -->
    <div class="lang-wrap">
      <button class="icon-btn icon-btn-sm" id="btn-lang" title="Select subtitle language">
        <img src="${icons.subtitle}" alt="Language">
      </button>
      <div id="lang-picker" class="hidden">
        <button class="lang-opt" data-lang="en" data-cls="">English</button>
        <button class="lang-opt" data-lang="hi" data-cls="devanagari">Hindi</button>
        <button class="lang-opt" data-lang="kn" data-cls="kannada">Kannada</button>
        <button class="lang-opt" data-lang="te" data-cls="telugu">Telugu</button>
      </div>
    </div>

    <!-- Ask Q&A — ? mark right beside subtitle icon -->
    <button class="ctrl-ask" data-action="ask" title="Ask Q&amp;A  Q">?</button>

    <div class="ctrl-sep"></div>

    <!-- Next File rectangle button -->
    <button id="btn-next-file" data-action="skip-file" title="Skip to next file  F">
      <span class="next-tri"></span>
      Next File
    </button>

    <!-- Stop -->
    <button class="ctrl-stop" data-action="stop" title="Stop  Esc">&#x23F9;</button>

  </div>
</div>

<script>
var vscode       = acquireVsCodeApi();
var INITIAL_TREE = ${initialJson};
var PYTHON_SVG   = ${pythonSvgJs};
var ICONS        = ${iconsJs};

// ── Render state ──────────────────────────────────────────────────────────────
var chapterCounter   = 0;
var seenIds          = new Set();
var activeChapterNum = 0;

function getIcon(lang, status) {
  if (status === 'completed') return '&#x2713;';
  if (status === 'skipped')   return '&#x2298;';
  if (status === 'active')    return '&#x25B6;';
  if (lang === 'python')      return PYTHON_SVG;
  if (lang === 'typescript')  return 'TS';
  return '&#x25A1;';
}

function renderNode(node, container) {
  chapterCounter++;
  var myChapter   = chapterCounter;
  var isDuplicate = seenIds.has(node.id);
  if (!isDuplicate) seenIds.add(node.id);
  if (node.status === 'active') activeChapterNum = myChapter;

  var wrapper = document.createElement('div');
  var row = document.createElement('div');
  row.className = 'node-row ' + node.status;
  row.setAttribute('data-file', node.id);
  if (isDuplicate) row.style.opacity = '0.42';
  row.addEventListener('click', function() {
    vscode.postMessage({ type: 'navigate', file: node.id });
  });

  var chapEl = document.createElement('span');
  chapEl.className = 'chapter-num';
  chapEl.textContent = isDuplicate ? '\u21A9' : String(myChapter).padStart(2, '0');
  row.appendChild(chapEl);

  var iconEl = document.createElement('span');
  iconEl.className = 'icon';
  iconEl.innerHTML = getIcon(node.language, node.status);
  row.appendChild(iconEl);

  var nameEl = document.createElement('span');
  nameEl.className = 'filename';
  nameEl.title = node.id;
  nameEl.textContent = node.relativePath;
  row.appendChild(nameEl);

  wrapper.appendChild(row);

  if (node.children && node.children.length > 0) {
    var childDiv = document.createElement('div');
    childDiv.className = 'children';
    for (var i = 0; i < node.children.length; i++) {
      renderNode(node.children[i], childDiv);
    }
    wrapper.appendChild(childDiv);
  }
  container.appendChild(wrapper);
}

function render(tree) {
  chapterCounter = 0; seenIds = new Set(); activeChapterNum = 0;
  document.getElementById('tree').innerHTML = '';
  renderNode(tree, document.getElementById('tree'));
  var total = chapterCounter;
  document.getElementById('stats').textContent = activeChapterNum > 0
    ? 'Chapter ' + activeChapterNum + ' of ' + total
    : total + (total === 1 ? ' file' : ' files');
}

// ── Progress bar ──────────────────────────────────────────────────────────────

var progressFill = null;  // cached after first access
function $fill() { return progressFill || (progressFill = document.getElementById('progress-fill')); }

function setProgress(pct, intervalMs) {
  var el = $fill();
  if (intervalMs && intervalMs > 0) {
    // Sync transition duration to the actual per-word step — bar flows in lock-step
    el.style.transition = 'width ' + (intervalMs / 1000).toFixed(3) + 's linear';
  }
  el.style.width = pct + '%';
}

// ── Subtitle ──────────────────────────────────────────────────────────────────

var CHUNK = 10;

function $sub()     { return document.getElementById('subtitle-section'); }
function $words()   { return document.getElementById('subtitle-words'); }
function $loading() { return document.getElementById('subtitle-loading-msg'); }

function updateSubtitle(words, activeIndex, intervalMs) {
  $sub().classList.remove('hidden');
  $loading().className = '';
  var el = $words();
  el.style.display = '';
  el.innerHTML = '';

  if (activeIndex < 0) {
    el.textContent = words.join(' ');
    el.style.opacity = '0.72';
    setProgress(0);
    return;
  }
  el.style.opacity = '1';

  var chunkStart = Math.floor(activeIndex / CHUNK) * CHUNK;
  var chunkEnd   = Math.min(chunkStart + CHUNK, words.length);
  var localIdx   = activeIndex - chunkStart;

  for (var i = chunkStart; i < chunkEnd; i++) {
    if (i > chunkStart) el.appendChild(document.createTextNode('\u00A0'));
    var span = document.createElement('span');
    var local = i - chunkStart;
    span.className = 'word ' + (local < localIdx ? 'done' : local === localIdx ? 'active' : 'pending');
    span.textContent = words[i];
    el.appendChild(span);
  }

  // Advance red progress bar — transition matches the real per-word interval
  var pct = words.length > 1 ? (activeIndex / (words.length - 1)) * 100 : 100;
  setProgress(pct, intervalMs);
}

function showSubtitleLoading() {
  $sub().classList.remove('hidden');
  $words().style.display = 'none';
  var el = $loading();
  el.textContent = 'preparing\u2026';
  el.className = 'pulsing';
  setProgress(0, 0);
}

function hideSubtitle() {
  $sub().classList.add('hidden');
  setProgress(0, 0);
}

// ── Volume picker ─────────────────────────────────────────────────────────────

document.getElementById('btn-vol').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById('lang-picker').classList.add('hidden');  // close other popups
  document.getElementById('vol-picker').classList.toggle('hidden');
});

document.getElementById('vol-picker').addEventListener('click', function(e) {
  e.stopPropagation();  // don't close on internal clicks
});

document.getElementById('vol-slider').addEventListener('input', function() {
  var level = parseInt(this.value, 10);
  document.getElementById('vol-label').textContent = level + '%';
  vscode.postMessage({ type: 'control', action: 'vol-' + level });
});

// ── Language picker ───────────────────────────────────────────────────────────

var currentLangCls = '';  // current subtitle-words class

function applyLang(code, cls) {
  currentLangCls = cls;
  $words().className = cls;
  // Mark active in picker
  document.querySelectorAll('.lang-opt').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-lang') === code);
  });
}

// Toggle picker open/close on subtitle icon click
document.getElementById('btn-lang').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById('lang-picker').classList.toggle('hidden');
});

// Select a language
document.getElementById('lang-picker').addEventListener('click', function(e) {
  e.stopPropagation();
  var btn = e.target.closest('.lang-opt');
  if (!btn) return;
  var code = btn.getAttribute('data-lang');
  var cls  = btn.getAttribute('data-cls');
  applyLang(code, cls);
  document.getElementById('lang-picker').classList.add('hidden');
  vscode.postMessage({ type: 'control', action: 'lang-' + code });
});

// Close all popups when clicking anywhere else
document.addEventListener('click', function() {
  document.getElementById('lang-picker').classList.add('hidden');
  document.getElementById('vol-picker').classList.add('hidden');
});

// ── Pause icon swap ───────────────────────────────────────────────────────────

function applyPausedState(paused) {
  document.getElementById('pause-icon').src = paused ? ICONS.play : ICONS.pause;
}

// ── Controls — delegated click handler ────────────────────────────────────────

document.getElementById('controls-bar').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  vscode.postMessage({ type: 'control', action: btn.getAttribute('data-action') });
});

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', function(event) {
  var msg = event.data;
  if      (msg.type === 'update')           render(msg.tree);
  else if (msg.type === 'subtitle')         updateSubtitle(msg.words, msg.activeIndex, msg.intervalMs);
  else if (msg.type === 'subtitle-loading') showSubtitleLoading();
  else if (msg.type === 'subtitle-hide')    hideSubtitle();
  else if (msg.type === 'subtitle-language') applyLang(msg.code, msg.label || '');
  else if (msg.type === 'set-paused')       applyPausedState(msg.paused);
});

// Init — mark English as selected by default
applyLang('en', '');
render(INITIAL_TREE);
</script>
</body>
</html>`;
}
//# sourceMappingURL=graphPanel.js.map