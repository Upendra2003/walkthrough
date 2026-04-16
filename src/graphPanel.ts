/**
 * GraphPanel — WebviewPanel: import graph (top) + subtitle zone + video controls (bottom).
 *
 * Layout (flex column, 100vh):
 *   ▸ #graph-section   — scrollable file tree            (flex: 1)
 *   ▸ #subtitle-section — capped subtitle zone           (flex-shrink: 0, max-height: 130px)
 *   ▸ #controls-bar     — video-player control row       (flex-shrink: 0, ~44px)
 *
 * Extension → webview messages:
 *   { type: 'update', tree }
 *   { type: 'subtitle', words, activeIndex }
 *   { type: 'subtitle-loading' }
 *   { type: 'subtitle-hide' }
 *   { type: 'subtitle-language', code, label }
 *   { type: 'set-paused', paused }          ← flips ⏸/▶ button icon
 *
 * Webview → extension messages:
 *   { type: 'navigate', file }
 *   { type: 'control',  action }            ← prev|pause|next|skip|deep-dive|skip-file|ask|stop
 *   { type: 'toggle-language' }
 */

import * as vscode from "vscode";
import { FileNode, ImportGraph } from "./graph";

const PYTHON_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" ' +
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

export class GraphPanel {
  private readonly panel: vscode.WebviewPanel;
  private clickCallback:   ((file: string) => void) | null = null;
  private controlCallback: ((action: string) => void) | null = null;
  private disposed = false;

  constructor(context: vscode.ExtensionContext, graph: ImportGraph) {
    this.panel = vscode.window.createWebviewPanel(
      "walkthroughGraph",
      "Walkthrough — Codebase Map",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = buildHtml(graph.root);

    this.panel.webview.onDidReceiveMessage(
      (msg: { type: string; file?: string; action?: string }) => {
        if (msg.type === "navigate" && msg.file && this.clickCallback) {
          this.clickCallback(msg.file);
        }
        if (msg.type === "control" && msg.action && this.controlCallback) {
          this.controlCallback(msg.action);
        }
      },
      undefined,
      context.subscriptions
    );

    this.panel.onDidDispose(() => { this.disposed = true; }, undefined, context.subscriptions);
  }

  update(root: FileNode): void {
    if (this.disposed) return;
    this.panel.webview.postMessage({ type: "update", tree: serializeNode(root) });
  }

  /** Send any message to the webview (subtitle, subtitle-loading, etc.). */
  postMessage(msg: object): void {
    if (!this.disposed) this.panel.webview.postMessage(msg);
  }

  /** Update the pause/play icon on the in-panel control button. */
  setPaused(paused: boolean): void {
    if (!this.disposed) this.panel.webview.postMessage({ type: "set-paused", paused });
  }

  onNodeClick(cb: (file: string) => void): void { this.clickCallback = cb; }

  /** Register a handler for in-panel button presses. */
  onControl(cb: (action: string) => void): void { this.controlCallback = cb; }

  reveal(): void {
    if (!this.disposed) this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  dispose(): void {
    if (!this.disposed) this.panel.dispose();
  }
}

// ── Serialise ──────────────────────────────────────────────────────────────────

interface SerialNode {
  id: string; relativePath: string; language: string; status: string; children: SerialNode[];
}

function serializeNode(n: FileNode): SerialNode {
  return {
    id: n.id, relativePath: n.relativePath, language: n.language, status: n.status,
    children: n.children.map(serializeNode),
  };
}

// ── HTML ───────────────────────────────────────────────────────────────────────

function buildHtml(root: FileNode): string {
  const initialJson = JSON.stringify(serializeNode(root)).replace(/</g, "\\u003c");
  const pythonSvgJs = JSON.stringify(PYTHON_SVG);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; font-src https://fonts.gstatic.com; style-src 'unsafe-inline' https://fonts.googleapis.com; script-src 'unsafe-inline';">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  overflow: hidden;
}

body {
  background: var(--vscode-editor-background, #1e1e2e);
  color: var(--vscode-foreground, #cdd6f4);
  font-family: var(--vscode-font-family, 'Segoe UI', monospace);
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
  padding: 16px 12px;
  min-height: 0;
}

#header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
#header h2 {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--vscode-textLink-foreground, #89b4fa);
  flex: 1;
}
#stats {
  font-size: 10px;
  color: var(--vscode-descriptionForeground, #6c7086);
  font-style: italic;
  letter-spacing: 0.02em;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 4px;
  margin: 1px 0;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.12s;
}
.node-row:hover    { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
.node-row.active   { background: rgba(249,226,175,0.10); border-left-color: #f9e2af; }
.node-row.completed{ background: rgba(166,227,161,0.07); border-left-color: #a6e3a1; }
.node-row.skipped  { opacity: 0.45; }

.chapter-num {
  font-size: 10px;
  color: rgba(255,255,255,0.2);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 20px;
  letter-spacing: 0.02em;
}
.node-row.active    .chapter-num { color: rgba(249,226,175,0.5); }
.node-row.completed .chapter-num { color: rgba(166,227,161,0.4); }

.icon {
  width: 18px;
  text-align: center;
  font-size: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vscode-descriptionForeground, #6c7086);
}
.node-row.active    .icon { color: #f9e2af; }
.node-row.completed .icon { color: #a6e3a1; }

.filename {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
}
.node-row.active    .filename { color: #f9e2af; font-weight: 600; }
.node-row.completed .filename { color: #a6e3a1; }
.node-row.skipped   .filename { text-decoration: line-through; color: #6c7086; }

.children {
  margin-left: 28px;
  border-left: 1px solid rgba(255,255,255,0.06);
  padding-left: 4px;
}

#legend {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 10.5px;
  color: var(--vscode-descriptionForeground, #6c7086);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.legend-item { display: flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-active  { background: #f9e2af; }
.dot-done    { background: #a6e3a1; }
.dot-skipped { background: #6c7086; }
.dot-pending { background: #45475a; }

/* ════ Subtitle section ════ */
#subtitle-section {
  flex-shrink: 0;
  border-top: 0.5px solid rgba(255,255,255,0.08);
  background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.82));
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 20px 12px;
  transition: opacity 0.25s ease;
  /* Fixed height: always exactly one "chunk" tall — no overflow, no clamp */
  height: 88px;
  overflow: hidden;
}
#subtitle-section.hidden {
  opacity: 0;
  pointer-events: none;
  height: 0;
  padding: 0;
  border-top-width: 0;
}

#lang-tag {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.28);
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.10);
  transition: color 0.15s, border-color 0.15s;
  user-select: none;
}
#lang-tag:hover { color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.25); }

#subtitle-inner {
  width: 100%;
  text-align: center;
  overflow: hidden;
}

#subtitle-words {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  color: white;
  /* words wrap naturally; the parent's fixed height clips excess */
  word-break: break-word;
  overflow-wrap: break-word;
}
#subtitle-words.devanagari { font-family: 'Noto Sans Devanagari', 'Segoe UI', sans-serif; }
#subtitle-words.tamil      { font-family: 'Noto Sans Tamil',       'Segoe UI', sans-serif; }

.word { display: inline; transition: opacity 0.12s ease; }
.word.done    { opacity: 0.38; color: white; }
.word.active  { opacity: 1.0;  color: white; filter: brightness(1.18); }
.word.pending { opacity: 0.18; color: white; }

#subtitle-loading-msg {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  color: rgba(255,255,255,0.28);
  font-style: italic;
  display: none;
}
@keyframes subtitlePulse {
  0%, 100% { opacity: 0.15; }
  50%       { opacity: 0.5;  }
}
#subtitle-loading-msg.pulsing {
  display: block;
  animation: subtitlePulse 1.6s ease infinite;
}

/* ════ Video-player controls bar ════ */
#controls-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 6px 12px 8px;
  gap: 8px;
  background: rgba(0,0,0,0.55);
  border-top: 0.5px solid rgba(255,255,255,0.07);
}

/* Primary playback group: ⏮ ⏸ ⏭ */
.ctrl-primary {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ctrl-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.6);
  font-size: 17px;
  cursor: pointer;
  padding: 4px 7px;
  border-radius: 5px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s, background 0.12s;
}
.ctrl-btn:hover { color: white; background: rgba(255,255,255,0.1); }

#btn-pause {
  font-size: 20px;
  padding: 4px 10px;
  color: rgba(255,255,255,0.85);
}
#btn-pause:hover { color: white; background: rgba(255,255,255,0.12); }

/* Thin separator */
.ctrl-divider {
  width: 1px;
  height: 18px;
  background: rgba(255,255,255,0.1);
  flex-shrink: 0;
  margin: 0 2px;
}

/* Secondary utility buttons */
.ctrl-secondary {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 1;
}

.ctrl-sm {
  background: none;
  border: none;
  color: rgba(255,255,255,0.35);
  font-size: 11px;
  cursor: pointer;
  padding: 3px 7px;
  border-radius: 4px;
  white-space: nowrap;
  line-height: 1.2;
  transition: color 0.12s, background 0.12s;
}
.ctrl-sm:hover { color: rgba(255,255,255,0.82); background: rgba(255,255,255,0.08); }

.ctrl-stop-btn {
  margin-left: auto;
  color: rgba(220,70,70,0.45);
  font-size: 14px;
  padding: 3px 6px;
}
.ctrl-stop-btn:hover { color: rgba(220,70,70,0.9); background: rgba(220,70,70,0.12); }
</style>
</head>
<body>

<!-- ── Scrollable graph section ── -->
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

<!-- ── Subtitle zone (capped, never overflows) ── -->
<div id="subtitle-section" class="hidden">
  <span id="lang-tag">EN</span>
  <div id="subtitle-inner">
    <div id="subtitle-words"></div>
    <div id="subtitle-loading-msg"></div>
  </div>
</div>

<!-- ── Video-player controls ── -->
<div id="controls-bar">
  <div class="ctrl-primary">
    <button class="ctrl-btn" data-action="prev"  title="Previous block  \u2190">&#x23EE;</button>
    <button class="ctrl-btn" id="btn-pause" data-action="pause" title="Pause  Space">&#x23F8;</button>
    <button class="ctrl-btn" data-action="next"  title="Next block  \u2192">&#x23ED;</button>
  </div>
  <div class="ctrl-divider"></div>
  <div class="ctrl-secondary">
    <button class="ctrl-sm" data-action="skip"      title="Skip block  S">&#x23E9; Skip</button>
    <button class="ctrl-sm" data-action="deep-dive" title="Deep Dive  D">&#x25A6; Dive</button>
    <button class="ctrl-sm" data-action="skip-file" title="Skip File  F">&#x23ED; File</button>
    <button class="ctrl-sm" data-action="ask"       title="Ask (Q&amp;A)  Q">&#x3F; Ask</button>
    <button class="ctrl-sm ctrl-stop-btn" data-action="stop" title="Stop  Esc">&#x23F9;</button>
  </div>
</div>

<script>
var vscode       = acquireVsCodeApi();
var INITIAL_TREE = ${initialJson};
var PYTHON_SVG   = ${pythonSvgJs};

// ── Render state ─────────────────────────────────────────────────────────────
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
  if (isDuplicate) row.style.opacity = '0.45';
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
    var childrenDiv = document.createElement('div');
    childrenDiv.className = 'children';
    for (var i = 0; i < node.children.length; i++) {
      renderNode(node.children[i], childrenDiv);
    }
    wrapper.appendChild(childrenDiv);
  }

  container.appendChild(wrapper);
}

function render(tree) {
  chapterCounter   = 0;
  seenIds          = new Set();
  activeChapterNum = 0;

  var container = document.getElementById('tree');
  container.innerHTML = '';
  renderNode(tree, container);

  var total   = chapterCounter;
  var statsEl = document.getElementById('stats');
  statsEl.textContent = activeChapterNum > 0
    ? 'Chapter ' + activeChapterNum + ' of ' + total
    : total + (total === 1 ? ' file' : ' files');
}

// ── Subtitle ─────────────────────────────────────────────────────────────────

function $sub()     { return document.getElementById('subtitle-section'); }
function $words()   { return document.getElementById('subtitle-words');   }
function $loading() { return document.getElementById('subtitle-loading-msg'); }

// Number of words shown at once — enough to fill ~2 lines in the panel.
var CHUNK = 10;

function updateSubtitle(words, activeIndex) {
  $sub().classList.remove('hidden');
  $loading().className = '';
  var el = $words();
  el.style.display = '';
  el.innerHTML = '';

  // activeIndex < 0 means "show all as plain caption" (indexing vibes, etc.)
  if (activeIndex < 0) {
    el.textContent = words.join(' ');
    el.style.opacity = '0.75';
    return;
  }
  el.style.opacity = '1';

  // Slide the window: always show the CHUNK words whose window contains activeIndex.
  // The window snaps forward only when activeIndex leaves the current chunk.
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
}

function showSubtitleLoading() {
  $sub().classList.remove('hidden');
  $words().style.display = 'none';
  var el = $loading();
  el.textContent = 'preparing\u2026';
  el.className = 'pulsing';
}

function hideSubtitle() {
  $sub().classList.add('hidden');
}

function updateLangTag(code, label) {
  document.getElementById('lang-tag').textContent = label || code || 'EN';
}

document.getElementById('lang-tag').addEventListener('click', function() {
  vscode.postMessage({ type: 'toggle-language' });
});

// ── Pause button state ───────────────────────────────────────────────────────

function applyPausedState(paused) {
  var btn = document.getElementById('btn-pause');
  btn.innerHTML  = paused ? '&#x25B6;' : '&#x23F8;';
  btn.title      = paused ? 'Resume  Space' : 'Pause  Space';
}

// ── Controls — event delegation ──────────────────────────────────────────────

document.getElementById('controls-bar').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  vscode.postMessage({ type: 'control', action: btn.getAttribute('data-action') });
});

// ── Message handler ──────────────────────────────────────────────────────────

window.addEventListener('message', function(event) {
  var msg = event.data;
  if      (msg.type === 'update')            render(msg.tree);
  else if (msg.type === 'subtitle')          updateSubtitle(msg.words, msg.activeIndex);
  else if (msg.type === 'subtitle-loading')  showSubtitleLoading();
  else if (msg.type === 'subtitle-hide')     hideSubtitle();
  else if (msg.type === 'subtitle-language') updateLangTag(msg.code, msg.label);
  else if (msg.type === 'set-paused')        applyPausedState(msg.paused);
});

render(INITIAL_TREE);
</script>
</body>
</html>`;
}
