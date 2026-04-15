"use strict";
/**
 * SubtitlePanel — a WebviewView registered in the VS Code panel area (bottom,
 * where Terminal / Output / Problems live).
 *
 * Renders a full-width Netflix-style subtitle bar.  Text is pushed via
 * postMessage so word-by-word animations in session.ts drive the display.
 *
 * Usage:
 *   // in activate() — register once
 *   const provider = new SubtitleViewProvider(context);
 *   context.subscriptions.push(
 *     vscode.window.registerWebviewViewProvider('walkthrough.subtitle', provider,
 *       { webviewOptions: { retainContextWhenHidden: true } })
 *   );
 *
 *   // to show/hide from anywhere
 *   provider.show('Hello world');
 *   provider.hide();
 *   provider.focus();   // open + focus the panel tab
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubtitleViewProvider = void 0;
const vscode = require("vscode");
class SubtitleViewProvider {
    constructor(context) {
        this.context = context;
        /** Messages queued while the view hasn't been resolved yet. */
        this.queue = [];
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.html = buildSubtitleHtml();
        // Flush any messages that arrived before the view was created
        for (const msg of this.queue) {
            webviewView.webview.postMessage(msg);
        }
        this.queue.length = 0;
        webviewView.onDidDispose(() => { this.view = undefined; });
    }
    /** Show a line of subtitle text.  loading=true renders it dimmed/italic. */
    show(text, loading = false) {
        this.post({ type: "text", text, loading });
    }
    /** Clear / hide the subtitle. */
    hide() {
        this.post({ type: "hide" });
    }
    /** Open and focus the subtitle panel tab. */
    focus() {
        vscode.commands.executeCommand("walkthrough.subtitle.focus");
    }
    post(msg) {
        if (this.view) {
            this.view.webview.postMessage(msg);
        }
        else {
            // View hasn't been resolved yet — queue the message
            this.queue.push(msg);
        }
    }
}
exports.SubtitleViewProvider = SubtitleViewProvider;
// ---------------------------------------------------------------------------
// Webview HTML
// ---------------------------------------------------------------------------
function buildSubtitleHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #0c0c0c;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: 'Google Sans Flex', 'Google Sans', 'Open Sans', 'Segoe UI', system-ui, sans-serif;
}

#wrap {
  width: 100%;
  padding: 0 5%;
  display: flex;
  justify-content: center;
}

#sub {
  color: #f0f0e8;
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  line-height: 1.55;
  padding: 5px 24px 6px;
  background: rgba(6, 6, 6, 0.96);
  border-radius: 5px;
  border: 1.5px solid rgba(235, 195, 60, 0.45);
  letter-spacing: 0.012em;
  min-height: 34px;
  max-width: 960px;
  width: 100%;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

#sub.loading {
  color: #555;
  font-size: 13px;
  font-style: italic;
  border-color: rgba(255, 255, 255, 0.07);
}

#sub.hidden {
  opacity: 0;
}
</style>
</head>
<body>
<div id="wrap">
  <div id="sub" class="hidden"></div>
</div>

<script>
var el = document.getElementById('sub');

window.addEventListener('message', function(e) {
  var m = e.data;
  if (m.type === 'text') {
    el.textContent = m.text;
    el.className   = m.loading ? 'loading' : '';
  } else if (m.type === 'hide') {
    el.textContent = '';
    el.className   = 'hidden';
  }
});
</script>
</body>
</html>`;
}
//# sourceMappingURL=subtitlePanel.js.map