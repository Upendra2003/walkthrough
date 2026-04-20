# Walkthrough — Codebase Context

VS Code extension (TypeScript). Walks through `.ts` / `.py` files block-by-block with yellow highlights, AI voice narration, Netflix-style subtitles, and a live import-graph panel. Includes codebase indexing into Qdrant for semantic Q&A.

## Module map

| File | Role |
|---|---|
| `src/extension.ts` | `activate()` — commands, status-bar info item, indexing gate, multi-file orchestrator |
| `src/graph.ts` | `buildImportGraph(root, wsRoot)` → `ImportGraph`; `flattenDFS` for traversal order; `detectMainFile(wsRoot)` — TS: `package.json` "main" → `src/<stem>.ts` fallback → `src/index.ts` → `index.ts` → `src/main.ts`; Python: `main.py` → `app.py` → `server.py` → … → `if __name__ == "__main__"` scan → active editor |
| `src/graphPanel.ts` | Unified right panel (WebviewPanel). Layout top→bottom: `#graph-section` (`flex:1 1 0`, scrollable) → `#video-zone` (`flex:1 1 0`, placeholder until MP4 ready, `⛶` fullscreen btn) → `#subtitle-section` (88px) → `#progress-track` (3px red) → `#controls-bar`. **Messages in:** `update`, `subtitle` (with `intervalMs`), `subtitle-loading` (with optional `text` e.g. `"🎬 Preparing visuals... 50%"`), `subtitle-hide`, `subtitle-language`, `set-paused`, `set-video-src` (does NOT auto-play), `video-play` (with `delayMs` for sync), `video-reset`. **Messages out:** `navigate`, `control` (`prev\|pause\|next\|deep-dive\|ask\|skip-file\|stop\|vol-<0-100>\|lang-<code>`). |
| `src/blueprintTypes.ts` | Local copy of `AnimationBlueprint` + all 25 scene type interfaces. Never import from `../motion/src/types` — shifts TypeScript `rootDir`. `audioDurationMs` is required and is the single source of truth for video length. |
| `src/generateBlueprint.ts` | `generateBlueprint(code, blockLabel, narration, _, audioDurationMs)` — calls `callLLM` to produce `AnimationBlueprint` JSON. Scene count: `targetScenes = round(audioSecs/3)`, `minScenes = max(3, min(targetScenes, 12))`, `maxScenes = min(12, minScenes+2)`. Prompt includes full field schema for all 25 scene types + a complete example blueprint so the LLM always populates every field. Scenes with only `type`+`narrationChunk` render blank. `maxTokens=2500`. `bp.audioDurationMs` always overwritten after LLM response. |
| `src/videoRenderer.ts` | `renderBlockVideo(opts)` — bundles `motion/` once via `@remotion/bundler`, renders silent MP4 to `.vscode/walkthrough-videos/` via `@remotion/renderer`. `clearVideoCache(wsRoot)` deletes MP4s + resets bundle cache. `__dirname` at runtime is `out/` → motion root resolved as `'../motion'`. |
| `src/parser.ts` | `parseBlocks(source, langId)` — tree-sitter for TS + Python; returns `SemanticBlock[]`; `filterImportantBlocks(blocks)` removes imports, comment-only blocks, trivial methods; always keeps level-0 overview, class declarations, async/await/try/catch blocks, Python `__main__` guard |
| `src/narrate.ts` | `fetchNarration` (LLM, 60–80 word concise technical narration per block), `generateAudio` (Sarvam TTS), `queryCodebase` (Qdrant RAG with `onProgress`), `fetchDeepDiveNarrations` |
| `src/session.ts` | `WalkthroughSession` — Phase 1: whole-file overview; Phase 2: block-by-block (entered when D pressed). **`presentBlock` flow:** (1) show `"🎬 Preparing visuals..."` subtitle; (2) await audio from `prefetchCache` or fetch inline; (3) render video inline with `onProgress` OR await `videoCacheMap`; (4) send `set-video-src` (no auto-play); (5) wait 300ms; (6) send `video-play` with `delayMs=PLAYER_STARTUP_MS`; (7) fire `prefetchNextBlock(i+1)` concurrently; (8) `playWithControls`. **`prefetchNextBlock`:** fetches narration → audio → blueprint → renders MP4 silently; stores in `prefetchCache` + `videoCacheMap` so the next `presentBlock` starts instantly. |
| `src/audioPlayer.ts` | Spawns `afplay` / PowerShell `SoundPlayer` / `aplay`; `stop()` kills process. `AudioPlayer.volume` static (0–100, default 80). `elapsedMs` getter used by pause/resume to trim WAV. |
| `src/embedder.ts` | `embed(texts)` — local `all-MiniLM-L6-v2` (384 dims) via persistent Python subprocess. `disposeEmbedder()` on deactivate. |
| `src/codebaseIndexer.ts` | `indexWorkspace` — scans, embeds in batches of 10, upserts into Qdrant; `needsIndexing` — sync hash-cache pre-check |
| `src/config.ts` | `ConfigManager` — SecretStorage + VS Code settings; `WalkthroughConfig` shape |
| `src/onboarding.ts` | 4-step setup wizard — Provider → API Key + Model → Voice → Done |

## Key flows

**Multi-file walkthrough:** `explain` → config check → model picker → indexing gate → `detectMainFile` → `buildImportGraph` → `GraphPanel` → DFS queue → per-file: `parseBlocks` → `filterImportantBlocks` → `WalkthroughSession`. F=skip file, Esc=stop.

**Video/audio sync:** `audioDurationMs` from the WAV header is the source of truth. `set-video-src` loads the MP4 without playing. After 300ms, `video-play` is sent with `delayMs=PLAYER_STARTUP_MS` (757ms). The webview calls `video.play()` at `t + delayMs`; audio spawns at `t ≈ 0` and produces first sample ~757ms later. Both start together. ✅

**Audio/subtitle sync:** `estimateWordIntervalMs` reads WAV header (`byteRate` offset 28, `dataChunkSize` offset 40), divides by word count, clamps to [80, 900]ms. Drives subtitle animation and red progress bar CSS transition.

**Pause/resume:** `togglePause()` accumulates `elapsedMs` into `audioResumeMs` before stopping. Resume calls `trimWav(audio, audioResumeMs)` to skip PCM bytes (block-aligned). `subtitleResumeIndex` saved by `cancelSubtitleAnimation()`. Both reset at the start of each new block.

**Player startup delay:**
- `PLAYER_STARTUP_MS = 757` — regular blocks
- `PLAYER_STARTUP_MS_QA = 907` — Q&A (extra headroom post-LLM)

**Q&A flow (Q key):** pause → question input → 4 subtitle progress steps (embed → Qdrant search → fetch blocks → LLM) → spoken answer with subtitles → Space resumes.

**Indexing gate:** `needsIndexing` (sync, zero network) → if changed: `runIndexingWithUI` with subtitle progress → `subtitle-hide`.

**Remotion layer:** `Root.tsx` — 1280×720, 30fps. `durationInFrames = ceil(audioDurationMs/1000 × 30)`. `CodeExplainer.tsx` dispatches 25 scene types; `framesPerScene = floor(totalFrames/sceneCount)`. All Remotion components use `= []` defaults on array props to prevent crash when LLM omits a field.

**Blueprint prompt:** `generateBlueprint.ts` sends the LLM a one-line schema for all 25 scene types + a complete 3-scene example blueprint. Rule: never return a scene with only `type`+`narrationChunk` — missing data fields render blank screens.

**Narration style:** 3–4 sentences, 60–80 words. Sentence 1: main purpose. Sentences 2–3: key flow steps. Sentence 4: outcome. Direct and technical — no analogies. File Overview blocks describe architecture, not imports.

## Controls

| Key | Action |
|---|---|
| `Ctrl+Shift+E` / title button | Start / restart |
| `Space` | Pause / Resume |
| `←` / `→` | Prev / Next block |
| `D` / `Ctrl+Shift+I` | Deep Dive — line-by-line amber highlights |
| `F` / `Ctrl+Shift+,` | Skip file |
| `Q` / `Ctrl+Shift+/` | Ask (RAG → spoken answer) |
| `Esc` | Stop all |

## LLM providers

| Provider | Notes |
|---|---|
| `groq` | OpenAI-compat, `https://api.groq.com/openai/v1`. Qwen3 → `reasoning_effort: "none"` |
| `openai` | `https://api.openai.com/v1` |
| `anthropic` | `https://api.anthropic.com/v1/messages` — different shape, `callAnthropic()` |
| `custom` | Any OpenAI-compat endpoint via `cfg.customBaseUrl` |

## Config

```typescript
{ provider, model, apiKey, sarvamApiKey, customBaseUrl, embeddingProvider: "local" }
```

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
