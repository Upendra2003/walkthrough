"use strict";
/**
 * GraphPanel — VS Code WebviewPanel that renders the import-graph KG.
 *
 * Changes vs. previous version:
 *   - Python official SVG logo replaces the snake emoji.
 *   - setPaused(bool) flips the active node between "reading" and "⏸ paused"
 *     states with a blue tint, so the user knows the session is mid-block.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphPanel = void 0;
const vscode = require("vscode");
// Official Python logo SVG (VS Code codicons variant, fill="currentColor").
// Stored as a TS constant and embedded via JSON.stringify to avoid escaping issues.
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
        this.disposed = false;
        this.panel = vscode.window.createWebviewPanel("walkthroughGraph", "Walkthrough — Codebase Map", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.webview.html = buildHtml(graph.root);
        this.panel.webview.onDidReceiveMessage((msg) => {
            if (msg.type === "navigate" && this.clickCallback) {
                this.clickCallback(msg.file);
            }
        }, undefined, context.subscriptions);
        this.panel.onDidDispose(() => { this.disposed = true; }, undefined, context.subscriptions);
    }
    update(root) {
        if (this.disposed)
            return;
        this.panel.webview.postMessage({ type: "update", tree: serializeNode(root) });
    }
    /** Toggle the pause indicator on the currently-active node. */
    setPaused(paused) {
        if (this.disposed)
            return;
        this.panel.webview.postMessage({ type: "pause", paused });
    }
    onNodeClick(cb) {
        this.clickCallback = cb;
    }
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
    return { id: n.id, relativePath: n.relativePath, language: n.language, status: n.status,
        children: n.children.map(serializeNode) };
}
// ── HTML ──────────────────────────────────────────────────────────────────────
function buildHtml(root) {
    const initialJson = JSON.stringify(serializeNode(root)).replace(/</g, "\\u003c");
    // Embed SVG safely — JSON.stringify handles all escaping
    const pythonSvgJs = JSON.stringify(PYTHON_SVG);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--vscode-editor-background, #1e1e2e);
  color: var(--vscode-foreground, #cdd6f4);
  font-family: var(--vscode-font-family, 'Segoe UI', monospace);
  font-size: 13px;
  padding: 16px 12px;
  user-select: none;
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
#stats { font-size: 11px; color: var(--vscode-descriptionForeground, #6c7086); }

/* ── Node rows ── */
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
.node-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }

.node-row.active    { background: rgba(249,226,175,0.10); border-left-color: #f9e2af; }
.node-row.completed { background: rgba(166,227,161,0.07); border-left-color: #a6e3a1; }
.node-row.skipped   { opacity: 0.45; }

/* Pause state — replaces the yellow active tint with a calm blue */
.node-row.active.paused {
  background: rgba(137,180,250,0.10);
  border-left-color: #89b4fa;
}
.node-row.active.paused .filename { color: #89b4fa !important; }

/* ── Icon ── */
.icon {
  width: 18px;
  text-align: center;
  font-size: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* colour the SVG icon to match the row state */
  color: var(--vscode-descriptionForeground, #6c7086);
}
.node-row.active    .icon { color: #f9e2af; }
.node-row.completed .icon { color: #a6e3a1; }
.node-row.active.paused .icon { color: #89b4fa; }

/* ── Filename ── */
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

/* ── Badges ── */
.badge {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 10px;
  flex-shrink: 0;
  white-space: nowrap;
}
.badge-active    { background: rgba(249,226,175,0.18); color: #f9e2af; }
.badge-completed { background: rgba(166,227,161,0.18); color: #a6e3a1; }
.badge-skipped   { background: rgba(108,112,134,0.18); color: #9399b2; }
.badge-paused    { background: rgba(137,180,250,0.18); color: #89b4fa; }

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
.dot-active    { background: #f9e2af; }
.dot-completed { background: #a6e3a1; }
.dot-skipped   { background: #6c7086; }
.dot-pending   { background: #45475a; }
.dot-paused    { background: #89b4fa; }
</style>
</head>
<body>

<div id="header">
  <h2>&#x2B21; Codebase Map</h2>
  <span id="stats"></span>
</div>

<div id="tree"></div>

<div id="legend">
  <span class="legend-item"><span class="dot dot-active"></span>reading</span>
  <span class="legend-item"><span class="dot dot-paused"></span>paused</span>
  <span class="legend-item"><span class="dot dot-completed"></span>done</span>
  <span class="legend-item"><span class="dot dot-skipped"></span>skipped</span>
  <span class="legend-item"><span class="dot dot-pending"></span>pending</span>
</div>

<script>
var vscode      = acquireVsCodeApi();
var INITIAL_TREE = ${initialJson};
var PYTHON_SVG  = ${pythonSvgJs};

function getIcon(lang, status) {
  if (status === 'completed') return '&#x2713;';
  if (status === 'skipped')   return '&#x2298;';
  if (status === 'active')    return '&#x25B6;';
  if (lang === 'python')      return PYTHON_SVG;
  if (lang === 'typescript')  return 'TS';
  return '&#x25A1;';
}

function getBadgeLabel(status) {
  if (status === 'active')    return 'reading';
  if (status === 'completed') return 'done';
  if (status === 'skipped')   return 'skipped';
  return '';
}

function renderNode(node, container) {
  var wrapper = document.createElement('div');

  var row = document.createElement('div');
  row.className = 'node-row ' + node.status;
  row.setAttribute('data-file', node.id);
  row.addEventListener('click', function() {
    vscode.postMessage({ type: 'navigate', file: node.id });
  });

  var iconEl = document.createElement('span');
  iconEl.className = 'icon';
  iconEl.innerHTML = getIcon(node.language, node.status);
  row.appendChild(iconEl);

  var nameEl = document.createElement('span');
  nameEl.className = 'filename';
  nameEl.title = node.id;
  nameEl.textContent = node.relativePath;
  row.appendChild(nameEl);

  var label = getBadgeLabel(node.status);
  if (label) {
    var badge = document.createElement('span');
    badge.className = 'badge badge-' + node.status;
    badge.textContent = label;
    row.appendChild(badge);
  }

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

function countByStatus(node, counts) {
  counts[node.status] = (counts[node.status] || 0) + 1;
  for (var i = 0; i < node.children.length; i++) {
    countByStatus(node.children[i], counts);
  }
}

function render(tree) {
  var container = document.getElementById('tree');
  container.innerHTML = '';
  renderNode(tree, container);

  var counts = {};
  countByStatus(tree, counts);
  var total = Object.values(counts).reduce(function(a, b) { return a + b; }, 0);
  var done  = (counts['completed'] || 0) + (counts['skipped'] || 0);
  document.getElementById('stats').textContent = done + ' / ' + total + ' files';
}

/** Toggle pause state on the currently active node mid-block. */
function applyPause(isPaused) {
  var rows = document.querySelectorAll('.node-row.active');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (isPaused) {
      row.classList.add('paused');
      var b = row.querySelector('.badge-active');
      if (b) { b.className = 'badge badge-paused'; b.textContent = '⏸  paused'; }
    } else {
      row.classList.remove('paused');
      var b2 = row.querySelector('.badge-paused');
      if (b2) { b2.className = 'badge badge-active'; b2.textContent = 'reading'; }
    }
  }
}

window.addEventListener('message', function(event) {
  var msg = event.data;
  if (msg.type === 'update') render(msg.tree);
  if (msg.type === 'pause')  applyPause(msg.paused);
});

render(INITIAL_TREE);
</script>
</body>
</html>`;
}
//# sourceMappingURL=graphPanel.js.map