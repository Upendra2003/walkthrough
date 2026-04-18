"use strict";
/**
 * Onboarding wizard — shown on first install (or via walkthrough.configure).
 * 4 steps: Provider → API Key + Model → Sarvam → Done.
 *
 * Communicates back to the extension via postMessage:
 *   { type: 'save', config: WalkthroughConfig }
 *   { type: 'test', config: WalkthroughConfig }   ← extension replies with testResult
 *   { type: 'close' }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingPanel = void 0;
const vscode = require("vscode");
const config_1 = require("./config");
class OnboardingPanel {
    constructor(context, prefill, onSave, onTest) {
        this.disposed = false;
        this.panel = vscode.window.createWebviewPanel("walkthroughOnboarding", "Walkthrough — Setup", { viewColumn: vscode.ViewColumn.One, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.webview.html = buildHtml(prefill);
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === "save" && msg.config) {
                await onSave(msg.config);
                this.panel.webview.postMessage({ type: "saved" });
            }
            if (msg.type === "test" && msg.config) {
                const result = await onTest(msg.config);
                this.panel.webview.postMessage({ type: "testResult", ...result });
            }
            if (msg.type === "openLink" && msg.url) {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
            if (msg.type === "close") {
                this.panel.dispose();
            }
        }, undefined, context.subscriptions);
        this.panel.onDidDispose(() => { this.disposed = true; }, undefined, context.subscriptions);
    }
    dispose() {
        if (!this.disposed)
            this.panel.dispose();
    }
}
exports.OnboardingPanel = OnboardingPanel;
// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
function buildHtml(prefill) {
    const groqJson = JSON.stringify(config_1.GROQ_MODELS);
    const openaiJson = JSON.stringify(config_1.OPENAI_MODELS);
    const anthropicJson = JSON.stringify(config_1.ANTHROPIC_MODELS);
    const prefillJson = JSON.stringify({
        provider: prefill.provider ?? "groq",
        model: prefill.model ?? "qwen/qwen3-32b",
        apiKey: prefill.apiKey ?? "",
        sarvamApiKey: prefill.sarvamApiKey ?? "",
        customBaseUrl: prefill.customBaseUrl ?? "",
        embeddingProvider: "local",
    });
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #1a1b2e;
  color: #cdd6f4;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  display: flex;
  justify-content: center;
  padding: 40px 20px 60px;
  min-height: 100vh;
}

.wizard {
  width: 100%;
  max-width: 560px;
}

/* ── Progress bar ── */
.progress {
  display: flex;
  align-items: center;
  margin-bottom: 36px;
}
.step-dot {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #2a2b3d;
  border: 2px solid #313244;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #6c7086;
  flex-shrink: 0;
  transition: all 0.2s;
}
.step-dot.active  { border-color: #89b4fa; color: #89b4fa; background: rgba(137,180,250,0.1); }
.step-dot.done    { background: #89b4fa; border-color: #89b4fa; color: #1a1b2e; }
.step-line {
  flex: 1;
  height: 2px;
  background: #313244;
  margin: 0 6px;
  transition: background 0.2s;
}
.step-line.done { background: #89b4fa; }

/* ── Card ── */
.card {
  background: #24253b;
  border-radius: 12px;
  border: 1px solid #313244;
  padding: 32px;
  display: none;
}
.card.active { display: block; }

.card h1 { font-size: 22px; font-weight: 700; color: #cdd6f4; margin-bottom: 8px; }
.card h2 { font-size: 18px; font-weight: 600; color: #cdd6f4; margin-bottom: 8px; }
.card p  { color: #9399b2; line-height: 1.6; margin-bottom: 20px; }

/* ── Provider grid ── */
.providers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 28px;
}
.provider-card {
  background: #1e1f2e;
  border: 2px solid #313244;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.provider-card:hover  { border-color: #89b4fa; background: rgba(137,180,250,0.05); }
.provider-card.active { border-color: #89b4fa; background: rgba(137,180,250,0.08); }
.provider-card .pname { font-weight: 700; font-size: 15px; color: #cdd6f4; margin-bottom: 4px; }
.provider-card .pdesc { font-size: 12px; color: #6c7086; line-height: 1.4; }
.provider-badge {
  display: inline-block;
  background: rgba(166,227,161,0.15);
  color: #a6e3a1;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
}

/* ── Form ── */
.field { margin-bottom: 20px; }
.field label { display: block; font-size: 12px; font-weight: 600; color: #9399b2; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.input-wrap { position: relative; }
.field input, .field select {
  width: 100%;
  background: #1e1f2e;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 10px 12px;
  color: #cdd6f4;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.field input:focus, .field select:focus { border-color: #89b4fa; }
.field input[type=password] { padding-right: 40px; font-family: monospace; letter-spacing: 2px; }
.field select option { background: #24253b; }
.show-toggle {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  cursor: pointer; color: #6c7086; font-size: 12px; user-select: none;
}
.show-toggle:hover { color: #cdd6f4; }
.hint { font-size: 12px; color: #6c7086; margin-top: 6px; }
.hint a { color: #89b4fa; text-decoration: none; }
.hint a:hover { text-decoration: underline; }

/* ── Buttons ── */
.actions { display: flex; gap: 10px; margin-top: 28px; align-items: center; }
.btn {
  padding: 10px 22px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}
.btn-primary   { background: #89b4fa; color: #1a1b2e; }
.btn-primary:hover { background: #a5c8ff; }
.btn-secondary { background: transparent; color: #9399b2; border: 1px solid #313244; }
.btn-secondary:hover { border-color: #89b4fa; color: #cdd6f4; }
.btn-outline   { background: transparent; color: #89b4fa; border: 1px solid #89b4fa; }
.btn-outline:hover { background: rgba(137,180,250,0.1); }
.btn:disabled  { opacity: 0.45; cursor: not-allowed; }

/* ── Test result ── */
.test-result {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  display: none;
}
.test-result.ok  { background: rgba(166,227,161,0.12); color: #a6e3a1; border: 1px solid rgba(166,227,161,0.3); }
.test-result.err { background: rgba(243,139,168,0.12); color: #f38ba8; border: 1px solid rgba(243,139,168,0.3); }

/* ── Done screen ── */
.done-icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
.check-list { list-style: none; margin: 20px 0 28px; }
.check-list li { display: flex; align-items: center; gap: 10px; padding: 6px 0; color: #a6e3a1; font-size: 13px; }
.check-list li::before { content: "✓"; font-weight: 700; }
</style>
</head>
<body>
<div class="wizard">

  <!-- Progress dots -->
  <div class="progress">
    <div class="step-dot active" id="dot-1">1</div>
    <div class="step-line" id="line-1"></div>
    <div class="step-dot" id="dot-2">2</div>
    <div class="step-line" id="line-2"></div>
    <div class="step-dot" id="dot-3">3</div>
    <div class="step-line" id="line-3"></div>
    <div class="step-dot" id="dot-4">4</div>
  </div>

  <!-- Step 1: Provider -->
  <div class="card active" id="step-1">
    <h1>Welcome to Walkthrough</h1>
    <p>Your AI-powered code tour guide. Let's set up your language model in a few steps.</p>
    <div class="providers">
      <div class="provider-card active" id="card-groq" onclick="selectProvider('groq')">
        <div class="provider-badge">Free</div>
        <div class="pname">Groq</div>
        <div class="pdesc">Fast inference. 8 open-source models including Llama, Qwen, Mixtral.</div>
      </div>
      <div class="provider-card" id="card-openai" onclick="selectProvider('openai')">
        <div class="pname">OpenAI</div>
        <div class="pdesc">GPT-4o, GPT-4o Mini, GPT-4 Turbo.</div>
      </div>
      <div class="provider-card" id="card-anthropic" onclick="selectProvider('anthropic')">
        <div class="pname">Anthropic</div>
        <div class="pdesc">Claude Opus 4.6, Sonnet 4.6, Haiku 4.5.</div>
      </div>
      <div class="provider-card" id="card-custom" onclick="selectProvider('custom')">
        <div class="pname">Custom</div>
        <div class="pdesc">Any OpenAI-compatible API endpoint.</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="goto(2)">Next &rarr;</button>
    </div>
  </div>

  <!-- Step 2: API Key + Model -->
  <div class="card" id="step-2">
    <h2 id="s2-title">Configure Groq</h2>
    <p id="s2-desc">Enter your API key and choose the model to use for code narration.</p>

    <!-- Custom: base URL -->
    <div class="field" id="field-baseurl" style="display:none">
      <label>Base URL</label>
      <input type="text" id="input-baseurl" placeholder="https://your-api.example.com/v1">
    </div>

    <div class="field">
      <label id="key-label">API Key</label>
      <div class="input-wrap">
        <input type="password" id="input-apikey" placeholder="Paste your API key here">
        <span class="show-toggle" onclick="toggleShow('input-apikey', this)">Show</span>
      </div>
      <div class="hint" id="key-hint"></div>
    </div>

    <div class="field" id="field-model-select">
      <label>Model</label>
      <select id="select-model"></select>
    </div>

    <div class="field" id="field-model-text" style="display:none">
      <label>Model ID</label>
      <input type="text" id="input-model" placeholder="e.g. gpt-4o or your-custom-model">
    </div>

    <div class="test-result" id="test-result"></div>

    <div class="actions">
      <button class="btn btn-primary" onclick="goto(3)" id="btn-step2-next">Next &rarr;</button>
      <button class="btn btn-outline" onclick="testConnection()" id="btn-test">Test Connection</button>
      <button class="btn btn-secondary" onclick="goto(1)">&larr; Back</button>
    </div>
  </div>

  <!-- Step 3: Voice + Semantic Search -->
  <div class="card" id="step-3">
    <h2>Voice &amp; Semantic Search</h2>
    <p>One more key unlocks voice narration. Semantic Q&amp;A runs locally — no API key needed.</p>

    <div class="field">
      <label>Sarvam AI — Voice Narration</label>
      <div class="input-wrap">
        <input type="password" id="input-sarvam" placeholder="Paste your Sarvam API key">
        <span class="show-toggle" onclick="toggleShow('input-sarvam', this)">Show</span>
      </div>
      <div class="hint">
        Free key at <a href="#" onclick="openLink('https://dashboard.sarvam.ai')">dashboard.sarvam.ai</a>
      </div>
    </div>

    <div class="hint" style="margin-bottom:20px; padding:10px 14px; background:rgba(166,227,161,0.08); border-radius:6px; border:1px solid rgba(166,227,161,0.2);">
      Codebase Q&amp;A uses <strong>all-MiniLM-L6-v2</strong> locally via sentence-transformers — no API key required.
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="saveAndNext()">Save &amp; Finish</button>
      <button class="btn btn-secondary" onclick="goto(2)">&larr; Back</button>
    </div>
  </div>

  <!-- Step 4: Done -->
  <div class="card" id="step-4">
    <div class="done-icon">&#x1F3AC;</div>
    <h2 style="text-align:center; margin-bottom:12px">You're all set!</h2>
    <p style="text-align:center">Walkthrough is configured and ready to use.</p>
    <ul class="check-list" id="done-list">
      <li>LLM provider configured</li>
      <li>Model selected</li>
      <li>Voice narration ready</li>
    </ul>
    <div class="actions" style="justify-content:center">
      <button class="btn btn-primary" onclick="close_()">Start Exploring</button>
    </div>
  </div>

</div>

<script>
var vscode    = acquireVsCodeApi();
var PREFILL   = ${prefillJson};
var GROQ_MDL  = ${groqJson};
var OAI_MDL   = ${openaiJson};
var ANTH_MDL  = ${anthropicJson};

var provider = PREFILL.provider || 'groq';

// ── Provider selection ──────────────────────────────────────────────────────

function selectProvider(p) {
  provider = p;
  var cards = ['groq','openai','anthropic','custom'];
  for (var i = 0; i < cards.length; i++) {
    document.getElementById('card-' + cards[i]).className =
      'provider-card' + (cards[i] === p ? ' active' : '');
  }
}

// ── Step navigation ─────────────────────────────────────────────────────────

function goto(n) {
  for (var i = 1; i <= 4; i++) {
    document.getElementById('step-' + i).className = 'card' + (i === n ? ' active' : '');
    document.getElementById('dot-'  + i).className =
      'step-dot' + (i < n ? ' done' : i === n ? ' active' : '');
    if (i < 4) {
      document.getElementById('line-' + i).className =
        'step-line' + (i < n ? ' done' : '');
    }
  }
  if (n === 2) populateStep2();
}

// ── Step 2 population (dynamic based on provider) ──────────────────────────

function populateStep2() {
  var titles = {
    groq: 'Configure Groq',
    openai: 'Configure OpenAI',
    anthropic: 'Configure Anthropic',
    custom: 'Configure Custom Provider'
  };
  var descs = {
    groq: 'Enter your Groq API key (free at console.groq.com) and choose a model.',
    openai: 'Enter your OpenAI API key and choose a model.',
    anthropic: 'Enter your Anthropic API key and choose a Claude model.',
    custom: 'Enter your API key and base URL for your OpenAI-compatible endpoint.'
  };
  var hints = {
    groq: 'Get a free key at <a href="#" onclick="openLink(\'https://console.groq.com\')">console.groq.com</a>',
    openai: 'Get your key at <a href="#" onclick="openLink(\'https://platform.openai.com\')">platform.openai.com</a>',
    anthropic: 'Get your key at <a href="#" onclick="openLink(\'https://console.anthropic.com\')">console.anthropic.com</a>',
    custom: 'Your API key for the custom endpoint.'
  };

  document.getElementById('s2-title').textContent = titles[provider] || 'Configure LLM';
  document.getElementById('s2-desc').textContent  = descs[provider]  || '';
  document.getElementById('key-hint').innerHTML   = hints[provider]  || '';

  // Custom URL field
  var showCustomUrl = provider === 'custom';
  document.getElementById('field-baseurl').style.display = showCustomUrl ? '' : 'none';
  if (showCustomUrl && PREFILL.customBaseUrl) {
    document.getElementById('input-baseurl').value = PREFILL.customBaseUrl;
  }

  // Pre-fill API key
  document.getElementById('input-apikey').value = PREFILL.apiKey || '';

  // Model field
  var models = { groq: GROQ_MDL, openai: OAI_MDL, anthropic: ANTH_MDL }[provider];
  if (models) {
    document.getElementById('field-model-select').style.display = '';
    document.getElementById('field-model-text').style.display = 'none';
    var sel = document.getElementById('select-model');
    sel.innerHTML = '';
    for (var i = 0; i < models.length; i++) {
      var opt = document.createElement('option');
      opt.value = models[i].id;
      opt.textContent = models[i].label;
      if (models[i].id === PREFILL.model) opt.selected = true;
      sel.appendChild(opt);
    }
  } else {
    // custom — free text model input
    document.getElementById('field-model-select').style.display = 'none';
    document.getElementById('field-model-text').style.display   = '';
    document.getElementById('input-model').value = PREFILL.model || '';
  }

  // Clear test result
  var tr = document.getElementById('test-result');
  tr.style.display = 'none';
  tr.className = 'test-result';
  tr.textContent = '';
}

// ── Read current step-2 values ──────────────────────────────────────────────

function getStep2Config() {
  var apiKey  = document.getElementById('input-apikey').value.trim();
  var baseUrl = document.getElementById('input-baseurl').value.trim();
  var models  = { groq: GROQ_MDL, openai: OAI_MDL, anthropic: ANTH_MDL }[provider];
  var model   = models
    ? document.getElementById('select-model').value
    : document.getElementById('input-model').value.trim();
  var sarvam  = document.getElementById('input-sarvam')
    ? document.getElementById('input-sarvam').value.trim()
    : (PREFILL.sarvamApiKey || '');
  return { provider: provider, model: model, apiKey: apiKey,
           sarvamApiKey: sarvam, customBaseUrl: baseUrl };
}

// ── Test connection ─────────────────────────────────────────────────────────

function testConnection() {
  var btn = document.getElementById('btn-test');
  btn.disabled = true;
  btn.textContent = 'Testing...';

  var tr = document.getElementById('test-result');
  tr.style.display = 'none';

  vscode.postMessage({ type: 'test', config: getStep2Config() });
}

// ── Save & go to done ───────────────────────────────────────────────────────

function saveAndNext() {
  var sarvam = document.getElementById('input-sarvam').value.trim();
  if (!sarvam) { alert('Please enter your Sarvam API key.'); return; }
  var cfg = getStep2Config();
  cfg.sarvamApiKey      = sarvam;
  cfg.embeddingProvider = 'local';
  vscode.postMessage({ type: 'save', config: cfg });
}

function close_() {
  vscode.postMessage({ type: 'close' });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toggleShow(inputId, btn) {
  var el = document.getElementById(inputId);
  if (el.type === 'password') {
    el.type = 'text';
    el.style.letterSpacing = '';
    btn.textContent = 'Hide';
  } else {
    el.type = 'password';
    el.style.letterSpacing = '2px';
    btn.textContent = 'Show';
  }
}

function openLink(url) {
  vscode.postMessage({ type: 'openLink', url: url });
  return false;
}

// ── Receive messages from extension ─────────────────────────────────────────

window.addEventListener('message', function(e) {
  var m = e.data;

  if (m.type === 'testResult') {
    var btn = document.getElementById('btn-test');
    btn.disabled = false;
    btn.textContent = 'Test Connection';

    var tr = document.getElementById('test-result');
    tr.style.display = 'block';
    tr.className = 'test-result ' + (m.ok ? 'ok' : 'err');
    tr.textContent = m.message;
  }

  if (m.type === 'saved') {
    goto(4);
    // Update done list with provider/model info
    var cfg = getStep2Config();
    var sarvam = document.getElementById('input-sarvam').value.trim();
    var list   = document.getElementById('done-list');
    list.innerHTML =
      '<li>Provider: ' + cfg.provider + '</li>' +
      '<li>Model: ' + cfg.model + '</li>' +
      '<li>Voice narration: Sarvam AI</li>' +
      (sarvam ? '<li>Semantic search: local all-MiniLM-L6-v2 (Q&A ready)</li>' : '');
  }
});

// ── Pre-fill step-3 keys ─────────────────────────────────────────────────────
window.addEventListener('load', function() {
  if (PREFILL.sarvamApiKey) {
    document.getElementById('input-sarvam').value = PREFILL.sarvamApiKey;
  }
  selectProvider(provider);
});
</script>
</body>
</html>`;
}
//# sourceMappingURL=onboarding.js.map