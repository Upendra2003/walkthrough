# Walkthrough — Codebase Context

VS Code extension (TypeScript). Walks through `.ts` / `.py` files block-by-block with yellow highlights, AI voice narration, Netflix-style subtitles, and a live import-graph panel. Includes codebase indexing into Qdrant for semantic Q&A. Deep Dive mode (D key) replaces the video with an interactive Mermaid diagram; clicking any node activates a step slideshow panel showing the node's plain-English explanation, highlights it in the SVG, and shows a floating cross-file context popup listing which other files use this code.

## Module map

| File | Role |
|---|---|
| `src/extension.ts` | `activate()` — commands, status-bar info item, indexing gate, multi-file orchestrator. DNS connectivity preflight (`checkConnectivity` via `dns.resolve`) before session start — shows error + Retry if `ENOTFOUND`. Control handlers: `flowchart-next`, `flowchart-prev`, `flowchart-generate-audio:N`, `next-file`, `lang-<code>` → `activeSession.setLanguage(code)`. **Panel opened immediately** at the start of `explain` (before model picker) with a placeholder `FileNode` (`⏳ Scanning codebase...`); `runMultiFileWalkthrough` calls `update()` on the existing panel instead of creating a new one. Source files are opened with `preserveFocus: true` so the panel stays the active tab. After indexing, `vscode.window.showInformationMessage` notifies the user that vectors are stored in Qdrant. |
| `src/graph.ts` | `buildImportGraph(root, wsRoot)` → `ImportGraph`; `flattenDFS` for traversal order; `detectMainFile(wsRoot)` — TS: `package.json` "main" → `src/<stem>.ts` fallback → `src/index.ts` → `index.ts` → `src/main.ts`; Python: `main.py` → `app.py` → `server.py` → … → `if __name__ == "__main__"` scan → active editor |
| `src/graphPanel.ts` | Unified full-width panel (WebviewPanel, `ViewColumn.One` — no split). **Layout:** LEFT col (65%) — `#video-zone` → `#flowchart-zone` (mutually exclusive, toggled by Deep Dive) → `#subtitle-section` → `#progress-track` → `#controls-bar`. RIGHT col (35%) — `#graph-section`. **Mermaid v11** CDN (`mermaid@11`), `securityLevel:'loose'`. **Deep Dive zone** (`#flowchart-zone`): header (badge + label + progress) → `#fc-step-panel` (dots + step title + description, above canvas) → canvas (SVG, pan+zoom) → footer (Generate Audio + Download) → `#node-context-popup` (absolute-positioned floating tooltip). **Node click / step interaction:** `set-flowchart` message triggers `buildSteps(explanations)` (now accepts `FlowchartStep[]` array) + `renderDots()` → dot buttons appear in `#fc-step-panel`. `attachNodeClickHandlers()` wires click+hover on `g.node`, `g.actor`, `g.classGroup`, `.er.entityBox`, `.mindmap-node`, `g.statediagram-state`. Clicking a node calls `setActiveStep(idx, el)` → updates dot highlight, sets step text, calls `highlightNode()` (purple glow), and if `step.crossFileContext.length > 0` positions and shows `#node-context-popup` to the right of the clicked SVG element. Dot clicks call `setActiveStep(idx)` without `el` — popup stays hidden. **Cross-file popup** dismissed on outside click, node switch, or `exit-deepdive` message. **Messages in:** `update`, `subtitle` (with `intervalMs`), `subtitle-loading`, `subtitle-hide`, `subtitle-language`, `set-paused`, `set-video-src`, `video-play` (with `delayMs`), `video-reset`, `enter-deepdive`, `exit-deepdive`, `flowchart-loading`, `set-flowchart` (with `mermaid` + `explanations: FlowchartStep[]`), `flowchart-end`, `deepdive-audio-ready`, `deepdive-audio-ended`. **Messages out:** `navigate`, `control` (`prev\|pause\|next\|deep-dive\|ask\|skip-file\|stop\|vol-<0-100>\|lang-<code>\|flowchart-next\|flowchart-prev\|flowchart-generate-audio:N\|next-file`). |
| `src/generateFlowchart.ts` | `generateFlowchart(code, blockLabel, language, cfg, explanationLang?)` → `Promise<FlowchartResult>`. Single LLM call returns JSON `{ mermaid, explanations }`. LLM `explanations` is `Record<string, string>` which is converted to `FlowchartStep[]` (each with `nodeId`, `title`, `description`, `crossFileContext: []`) before returning. **6 diagram types:** `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `mindmap` — LLM picks the most appropriate. `explanationLang` (default `'en'`) appends "Return all explanation values in {lang}. Node IDs must remain in English." to the system prompt — node IDs never translated. `sanitizeMermaid()` applies type-specific fixes: mindmap `))shape((label` → `(label)`, sequence pipe-label arrows (`--->|label| B` → `-->> B: label`) + excess-dash normalisation (`-{3,}>` → `-->>`), sequence `(400)` → `[400]` in messages, flowchart arrow normalisation (`--->` / `->` → `-->`), reserved keyword node IDs renamed (`end` → `endNode`), `%%` comments stripped. `maxTokens=2200`. |
| `src/blueprintTypes.ts` | Local copy of `AnimationBlueprint` + all 25 scene type interfaces + shared diagram types. Never import from `../motion/src/types` — shifts TypeScript `rootDir`. `audioDurationMs` is required and is the single source of truth for video length. **Cross-file types:** `CrossFileContext { filePath, blockLabel, snippet }`, `FlowchartStep { nodeId, title, description, crossFileContext }`, `FlowchartResult { mermaid, explanations: FlowchartStep[] }`. |
| `src/generateBlueprint.ts` | `generateBlueprint(code, blockLabel, narration, _, audioDurationMs)` — calls `callLLM` to produce `AnimationBlueprint` JSON. Scene count: `targetScenes = round(audioSecs/3)`, `minScenes = max(3, min(targetScenes, 12))`, `maxScenes = min(12, minScenes+2)`. Prompt includes full field schema for all 25 scene types + a complete example blueprint so the LLM always populates every field. Scenes with only `type`+`narrationChunk` render blank. Unknown scene types replaced with `textpop` fallback. `maxTokens=2500`. `bp.audioDurationMs` always overwritten after LLM response. |
| `src/videoRenderer.ts` | `renderBlockVideo(opts)` — bundles `motion/` once via `@remotion/bundler`, renders silent MP4 to `.vscode/walkthrough-videos/` via `@remotion/renderer`. `clearVideoCache(wsRoot)` deletes MP4s + resets bundle cache. `__dirname` at runtime is `out/` → motion root resolved as `'../motion'`. |
| `src/parser.ts` | `parseBlocks(source, langId)` — tree-sitter for TS + Python; returns `SemanticBlock[]`; `filterImportantBlocks(blocks)` removes imports, comment-only blocks, trivial methods; always keeps level-0 overview, class declarations, async/await/try/catch blocks, Python `__main__` guard |
| `src/narrate.ts` | `fetchNarration(label, code, fileContext?, language?, crossFileContext?)` — LLM narration enriched with cross-file context when provided, then `translateText()` if `language !== 'en'`. When `crossFileContext` is non-empty the system prompt adds a section listing related files and instructs the LLM to weave 1-2 sentences about cross-file relationships naturally (70-90 words total). `fetchCrossFileContext(blockLabel, blockCode, currentFilePath, cfg, topK=3)` — embeds `label + code.slice(0,300)`, queries Qdrant, filters same-file hits, returns top `topK` as `CrossFileContext[]`; returns `[]` silently on any error. `fetchNodeCrossFileContext(nodeLabel, currentFilePath, cfg)` — same logic but cleans camelCase/underscores, topK=3; used for flowchart node popups. `generateAudio(text, language?)` — Sarvam TTS; `language` selects TTS voice code via `SARVAM_LANG_CODES` (`en→en-IN`, `hi→hi-IN`, `kn→kn-IN`, `te→te-IN`). `translateText(text, targetLang, key)` — POST `api.sarvam.ai/translate`, model `mayura:v1`; returns original on `targetLang === 'en'`. `queryCodebase(question, onProgress?, language?)` — Qdrant RAG; appends "Respond in {lang}." to system prompt when non-English. `fetchDeepDiveNarrations(block, language?)` — translates each chunk via `translateText` when non-English. |
| `src/session.ts` | `WalkthroughSession` — Phase 1: whole-file overview; Phase 2: block-by-block. **`presentBlock` flow:** (1) show loading subtitle; (2) await audio from `prefetchCache` (skipped for non-English); (3) render video OR await `videoCacheMap`; (4) `set-video-src`; (5) wait 300ms; (6) `video-play` with `delayMs=PLAYER_STARTUP_MS`; (7) `prefetchNextBlock(i+1)` (skipped for non-English); (8) `playWithControls`. **Cross-file narration:** `fetchAudio` and `prefetchNextBlock` call `fetchCrossFileContext` (Qdrant, fast) before `fetchNarration` — result passed as 5th arg; fails silently to `[]`. **Language:** `currentLanguage: string` (init from `cfg.language`, default `'en'`). `setLanguage(code)` — public, shows info message, skips if same code. Non-English: `kickPrefetch` and `prefetchNextBlock` are no-ops; `presentBlock` bypasses `prefetchCache`; all `fetchNarration`, `generateAudio`, `queryCodebase`, `fetchDeepDiveNarrations`, `generateFlowchart` calls receive `currentLanguage`. `generateDeepDiveAudio` always re-fetches narration when non-English (cache may be stale language). **Deep Dive mode:** `mode: 'video' \| 'deepdive'`. D press → `enterDeepDive()` → posts `enter-deepdive` + calls `showFlowchartBlock(index)`. `showFlowchartBlock` generates flowchart → enriches each `FlowchartStep` with `crossFileContext` via `fetchNodeCrossFileContext` (all in parallel, 5s timeout each, fails to `[]`) → posts `set-flowchart` with enriched `FlowchartStep[]`. `flowchartCache: Map<number, FlowchartResult>`, `flowchartPrefetch: Map<number, Promise<FlowchartResult>>`. `waitForDeepDiveExit()` blocks `presentBlock` until `exitDeepDive()` resolves it. `playWithControls` returns `"next"` immediately when `mode === 'deepdive'`. `generateDeepDiveAudio(index)` fetches narration + TTS, waits `PLAYER_STARTUP_MS`, then calls `startSubtitleAnimation` so the red progress bar animates during Deep Dive audio playback. `skipFile()` posts `exit-deepdive` to the webview when `mode === 'deepdive'` before stopping — ensures the next file's video plays correctly (not obscured by flowchart-zone). `relativeFilePath()` — private helper returning wsRoot-relative path with forward slashes (used to match Qdrant payload `file` field). |
| `src/audioPlayer.ts` | Spawns `afplay` / PowerShell `SoundPlayer` / `aplay`; `stop()` kills process. `AudioPlayer.volume` static (0–100, default 80). `elapsedMs` getter used by pause/resume to trim WAV. |
| `src/embedder.ts` | `embed(texts)` — local `all-MiniLM-L6-v2` (384 dims) via persistent Python subprocess. `disposeEmbedder()` on deactivate. |
| `src/codebaseIndexer.ts` | `indexWorkspace` — scans, embeds in batches of 10, upserts into Qdrant; `needsIndexing` — sync hash-cache pre-check. **Qdrant payload shape:** `{ code, label, file (relative path), language, startLine, endLine }` — `file` field is used to filter cross-file results in `fetchCrossFileContext`. |
| `src/config.ts` | `ConfigManager` — SecretStorage + VS Code settings; `WalkthroughConfig` shape. `language` field added — stored via `walkthrough.language` VS Code setting (not SecretStorage), default `'en'`. |
| `src/onboarding.ts` | 4-step setup wizard — Provider → API Key + Model → Voice → Done |

## Key flows

**Multi-file walkthrough:** `explain` → config check → **GraphPanel opens immediately** (placeholder) → model picker → **DNS connectivity check** → indexing gate (+ Qdrant notification on completion) → `detectMainFile` → `buildImportGraph` → panel updated via `update()` → DFS queue → per-file: `parseBlocks` → `filterImportantBlocks` → `WalkthroughSession`. Source files open with `preserveFocus: true` so panel stays full-width. F=skip file, Esc=stop.

**Cross-file narration enrichment:** For each block, `fetchAudio` calls `fetchCrossFileContext` (embed query → Qdrant search → filter same file → top 3 hits). Results are passed to `fetchNarration` as the 5th `crossFileContext` arg. When non-empty, the LLM prompt gains a section listing the related files and instructs the model to weave 1-2 sentences about cross-file relationships into the narration (70-90 words total). Qdrant unavailability silently returns `[]` — narration falls back to the standard 60-80 word prompt.

**Video/audio sync:** `audioDurationMs` from the WAV header is the source of truth. `set-video-src` loads the MP4 without playing. After 300ms, `video-play` is sent with `delayMs=PLAYER_STARTUP_MS` (757ms). The webview calls `video.play()` at `t + delayMs`; audio spawns at `t ≈ 0` and produces first sample ~757ms later. Both start together. ✅

**Audio/subtitle sync:** `estimateWordIntervalMs` reads WAV header (`byteRate` offset 28, `dataChunkSize` offset 40), divides by word count, clamps to [80, 900]ms. Drives subtitle animation and red progress bar CSS transition.

**Pause/resume:** `togglePause()` accumulates `elapsedMs` into `audioResumeMs` before stopping. Resume calls `trimWav(audio, audioResumeMs)` to skip PCM bytes (block-aligned). `subtitleResumeIndex` saved by `cancelSubtitleAnimation()`. Both reset at the start of each new block.

**Player startup delay:**
- `PLAYER_STARTUP_MS = 757` — regular blocks
- `PLAYER_STARTUP_MS_QA = 907` — Q&A (extra headroom post-LLM)

**Q&A flow (Q key):** pause → question input → subtitle progress steps (embed → Qdrant search → fetch blocks → LLM with "Respond in {lang}" appended) → spoken answer in `currentLanguage` with subtitles → Space resumes.

**Language switching flow:** UI fires `lang-<code>` control → `extension.ts` calls `activeSession.setLanguage(code)` → session stores `currentLanguage`, shows info message "Language will change from the next block." → next `presentBlock` calls `fetchNarration(…, currentLanguage)` which generates English narration then calls `translateText()` → `generateAudio(translatedText, currentLanguage)` uses the matching Sarvam TTS voice code. Prefetch cache (`prefetchCache`, `prefetchNextBlock`) is entirely skipped for non-English — audio generated fresh each block. Flowchart explanations translated via LLM prompt instruction (node IDs stay English). Deep Dive audio re-fetches narration fresh when non-English.

**Indexing gate:** `needsIndexing` (sync, zero network) → if changed: `runIndexingWithUI` with subtitle progress → cinematic finale → `vscode.window.showInformationMessage("✅ N code block(s) converted to vectors and stored in Qdrant DB.")` → `subtitle-hide`.

**Deep Dive flow (D key):**
1. `deepDive()` sets `mode = 'deepdive'`, stops audio, posts `enter-deepdive` → webview hides `#video-zone`, shows `#flowchart-zone`
2. `showFlowchartBlock(index)` calls `generateFlowchart()` → LLM returns `{ mermaid, explanations }` JSON; `explanations` converted to `FlowchartStep[]` with `crossFileContext: []`
3. `showFlowchartBlock` runs `fetchNodeCrossFileContext` for every step in parallel (`Promise.all`, 5s timeout each) → attaches results to each step's `crossFileContext` field
4. Posts `set-flowchart` with enriched `FlowchartStep[]` → webview calls `buildSteps(explanations)` + `renderDots()`, then `mermaid.render()`, then `attachNodeClickHandlers()`
5. User clicks a node → matched to step index → `setActiveStep(idx, el)` → highlights dot, updates `#fc-step-panel` text, calls `highlightNode()` (purple glow); if `step.crossFileContext.length > 0` the `#node-context-popup` is populated and positioned 10px right of the SVG node
6. Popup dismissed on outside click, clicking a different node, or `exit-deepdive` message
7. D again → `exitDeepDive()` posts `exit-deepdive`, resolves `deepDiveExitResolve`, restores video mode
8. `skipFile()` (Next File button or F key) also posts `exit-deepdive` when in deepdive mode — prevents next file's video being hidden behind flowchart-zone
9. `playWithControls` returns `"next"` immediately if `mode === 'deepdive'` so audio never restarts

**Flowchart diagram types — selection logic (in LLM prompt):**
- `flowchart LR` → functions, handlers, pipelines, conditional logic
- `sequenceDiagram` → HTTP calls, async multi-actor flows, auth
- `stateDiagram-v2` → state machines, lifecycle hooks
- `classDiagram` → OOP class definitions, inheritance
- `erDiagram` → DB tables, SQLAlchemy/Prisma models
- `mindmap` → imports, config/env, module overviews

**Mermaid sanitizer — common fixes applied:**
- Mindmap: `))cloud((External Dependencies` → `(External Dependencies)` (shape/label confusion)
- Mindmap: colons in labels stripped; stray arrows removed
- Sequence: flowchart-style pipe-label arrows → sequence colon syntax: `Actor --->|starts| B` → `Actor -->> B: starts`
- Sequence: excess-dash arrows normalised: `-{3,}(>>|>|x|\))` → `--$1`
- Sequence: `(400)` in message text → `[400]`
- Flowchart: `--->` / `->` → `-->`; `-->|"text"|` → `-->|text|`; reserved IDs (`end`, `class`) → `endNode`
- All: `%%` comments stripped, pure separator lines removed

**Qdrant payload contract** (set by `codebaseIndexer.ts`, read by `narrate.ts`):
```
{ code: string, label: string, file: string (relative, forward-slash), language, startLine, endLine }
```
`fetchCrossFileContext` filters hits where `payload.file === currentFilePath` (relative path). Always returns `[]` on Qdrant unavailability — never throws.

**Connectivity preflight:** `checkConnectivity(hostname)` uses `dns.resolve` before starting. On `ENOTFOUND` shows `showErrorMessage` with Retry button instead of silently completing all files.

**Remotion layer:** `Root.tsx` — 1280×720, 30fps. `durationInFrames = ceil(audioDurationMs/1000 × 30)`. `CodeExplainer.tsx` dispatches 25 scene types; `framesPerScene = floor(totalFrames/sceneCount)`. All Remotion components use `= []` defaults on array props to prevent crash when LLM omits a field.

**Blueprint prompt:** `generateBlueprint.ts` sends the LLM a one-line schema for all 25 scene types + a complete 3-scene example blueprint. Rule: never return a scene with only `type`+`narrationChunk` — missing data fields render blank screens. Unknown types replaced with `textpop` fallback.

**Narration style:** 3–4 sentences, 60–80 words (70-90 when cross-file context is present). Sentence 1: main purpose. Sentences 2–3: key flow steps. Sentence 4: outcome or cross-file connection. Direct and technical — no analogies. File Overview blocks describe architecture, not imports.

## Controls

| Key | Action |
|---|---|
| `Ctrl+Shift+E` / title button | Start / restart |
| `Space` | Pause / Resume |
| `←` / `→` | Prev / Next block (or prev/next flowchart block in Deep Dive) |
| `D` / `Ctrl+Shift+I` | Toggle Deep Dive — shows interactive Mermaid flowchart; D again exits |
| `F` / `Ctrl+Shift+,` | Skip file |
| `Q` / `Ctrl+Shift+/` | Ask (RAG → spoken answer) |
| `Esc` | Stop all |

**Deep Dive panel controls:**
| Button | Action |
|---|---|
| `🔊 Generate Audio` | Narrate the current flowchart block aloud |
| `Download ↓` | Save the SVG diagram to disk |
| `▶ Next File` (end card) | Exit deep dive and advance to next file |
| Click any node | Activate step: purple glow + explanation panel + cross-file popup (if data available) |
| Click any dot | Activate step: purple glow + explanation panel (no popup) |

## LLM providers

| Provider | Notes |
|---|---|
| `groq` | OpenAI-compat, `https://api.groq.com/openai/v1`. Qwen3 → `reasoning_effort: "none"` |
| `openai` | `https://api.openai.com/v1` |
| `anthropic` | `https://api.anthropic.com/v1/messages` — different shape, `callAnthropic()` |
| `custom` | Any OpenAI-compat endpoint via `cfg.customBaseUrl` |

## Config

```typescript
{ provider, model, apiKey, sarvamApiKey, customBaseUrl, embeddingProvider: "local", language: "en" }
```

**Language codes:** `en` (English), `hi` (Hindi), `kn` (Kannada), `te` (Telugu). Maps to Sarvam TTS/translate codes `en-IN`, `hi-IN`, `kn-IN`, `te-IN`. Stored in VS Code setting `walkthrough.language`; read at session start from `cfg.language`.

`.env` dev fallback: `GROQ_API_KEY`, `SARVAM_API_KEY`, `QDRANT_URL=http://localhost:6333`, `QDRANT_API_KEY`.

## Build

```bash
npm run compile   # one-shot
npm run watch     # auto-recompile on save
```

After compiling: `Ctrl+Shift+P` → **Developer: Reload Window**. Changes to `.ts` files are invisible until compiled.

**TypeScript rootDir rule:** Never import from `../motion/src/` in `src/` — shifts rootDir and moves output to `out/src/`. Use `src/blueprintTypes.ts` for shared types.

## Incremental indexing cache

`.vscode/walkthrough-vector-cache.json` — `{ embeddingProvider, vectorSize, files: { [relPath]: { hash, blockCount, indexedAt } } }`. Hash = SHA-256 first 16 hex chars. Block IDs = stable UUID from `MD5(relPath + "::" + label)`.
