# Walkthrough — Codebase Context

VS Code extension (TypeScript). Walks through `.ts` / `.py` files block-by-block with yellow highlights, AI voice narration, Netflix-style subtitles, and a live import-graph panel. Includes codebase indexing into Qdrant for semantic Q&A.

## Module map

| File | Role |
|---|---|
| `src/extension.ts` | `activate()` — commands, status-bar info item, indexing gate, multi-file orchestrator |
| `src/graph.ts` | `buildImportGraph(root, wsRoot)` → `ImportGraph`; `flattenDFS` for traversal order; `detectMainFile(wsRoot)` → entry-point auto-detection (TS: `package.json` "main" → `src/index.ts` → `index.ts` → `src/main.ts` → `main.ts`; Python: named candidates → `if __name__ == "__main__"` scan → active editor) |
| `src/graphPanel.ts` | Unified right panel (WebviewPanel) — file tree (top, scrollable) + subtitle zone (middle, fixed 88px, no lang tag) + progress line (3px, pure `#FF0000`) + video controls (bottom). Messages: `update`, `subtitle` (with `intervalMs`), `subtitle-loading`, `subtitle-hide`, `subtitle-language`, `set-paused`. Receives: `navigate`, `control` (`prev\|pause\|next\|deep-dive\|ask\|skip-file\|stop\|vol-<0-100>\|lang-<code>`). |
| `src/parser.ts` | `parseBlocks(source, langId)` — tree-sitter for TS + Python; returns `SemanticBlock[]` |
| `src/narrate.ts` | `fetchNarration` (LLM), `generateAudio` (Sarvam TTS), `queryCodebase` (Qdrant RAG with `onProgress` callback), `fetchDeepDiveNarrations` |
| `src/session.ts` | `WalkthroughSession` — playback loop, pause/resume (word-level + audio-trim resume), prefetch, subtitles, deep dive, Q&A (speaks answer) |
| `src/audioPlayer.ts` | Spawns `afplay` / PowerShell `SoundPlayer` / `aplay`; `stop()` kills the process. `AudioPlayer.volume` static (0–100, default 80). `elapsedMs` getter — ms since `play()` was called, used by pause/resume to trim the WAV on the next play. |
| `src/embedder.ts` | `embed(texts, cfg)` — local `all-MiniLM-L6-v2` (384 dims) via persistent Python subprocess (sentence-transformers). No API key needed. `disposeEmbedder()` cleans up on deactivate. |
| `src/codebaseIndexer.ts` | `indexWorkspace` — scans workspace, embeds blocks in batches of 10, upserts into Qdrant; `needsIndexing` — sync hash-cache pre-check (no network) |
| `src/config.ts` | `ConfigManager` — SecretStorage + VS Code settings; `WalkthroughConfig` shape; model catalogues |
| `src/onboarding.ts` | 4-step setup wizard webview — Provider → API Key + Model → Voice (Sarvam) → Done. No embedding key step — local model requires none. |

## Key flows

**Multi-file walkthrough:** `explain` → check config → model picker → indexing gate → `detectMainFile(wsRoot)` → `buildImportGraph` → `GraphPanel` → DFS queue → per-file `WalkthroughSession`. F=skip file, Esc=stop all.

**Indexing gate (every session start):**
1. `needsIndexing(wsRoot, cfg)` — sync, reads `.vscode/walkthrough-vector-cache.json`, hashes all `.ts`/`.py` files. Zero network calls.
2. If unchanged → posts `{ type: 'subtitle', words: [...], activeIndex: -1 }` showing "✓ Codebase knowledge is up to date." in the graph panel subtitle zone, then hides after 1.4 s.
3. If changed → `runIndexingWithUI` → posts `subtitle-loading` then cycling vibe messages (phase 1) then live file progress (phase 2) → cinematic finale messages → `subtitle-hide`.

**Codebase indexing:** `indexWorkspace` scans files, hashes for incremental cache, embeds blocks in batches of 10 via local `all-MiniLM-L6-v2` Python subprocess, upserts into Qdrant collection `code_blocks` (384 dims). Cache stored at `.vscode/walkthrough-vector-cache.json`.

**Q&A flow (Q key):** session pauses → user types question → `queryCodebase(question, onProgress)` runs 4 steps each updating the subtitle zone in real-time:
1. `"🔍 Analysing your question..."` — embeds question via local model
2. `"📡 Searching the codebase index..."` — Qdrant vector search (top 10, score ≥ 0.10)
3. `"📂 Fetched N blocks from: file1.py · file2.py — feeding to AI..."` — shows actual filenames
4. `"🤖 Asking AI with context from N files..."` — LLM call with 800-char snippets
→ answer spoken via `generateAudio` + `AudioPlayer` with word-by-word subtitle animation → Space resumes.

**Pause/resume fix (audio + subtitle):**
- `togglePause()` captures `this.audioResumeMs += this.currentPlayer?.elapsedMs` **before** stopping the player, and saves `subtitleResumeIndex` from `cancelSubtitleAnimation()`.
- On resume, `playWithControls` calls `trimWav(audio, this.audioResumeMs)` to skip already-played PCM bytes (reads `byteRate` + `blockAlign` from WAV header, block-aligned). Both `audioResumeMs` and `subtitleResumeIndex` reset to 0 at the start of each new block.

**Audio/subtitle sync:** `estimateWordIntervalMs(audio, wordCount)` reads the WAV header (`byteRate` at offset 28, `dataChunkSize` at offset 40) to derive exact audio duration, then divides by word count. Clamped to [80, 900] ms. Falls back to `SUBTITLE_WORD_MS_FALLBACK = 420ms` on malformed headers. This value drives both `startSubtitleAnimation` timing and the CSS transition on the red progress bar.

**Player startup delay:** On Windows, PowerShell + SoundPlayer takes ~750 ms to produce the first audio sample after spawn. Two constants at the top of `session.ts` (measured by `scripts/measure-audio-delay.js`) compensate by delaying subtitle start:
- `PLAYER_STARTUP_MS = 757` — regular block playback: player spawns → wait → subtitle starts
- `PLAYER_STARTUP_MS_QA = 907` — Q&A answer: busier post-LLM, needs extra headroom
The Q&A path also generates audio before starting the player (old code started subtitle before `generateAudio` returned, causing severe drift).

**Volume control:** `AudioPlayer.volume` (0–100, default 80) is a static field read at play-time. Platform: macOS → `afplay -v`; Windows → PowerShell `waveOutSetVolume` P/Invoke + SoundPlayer; Linux → `aplay` (no volume flag).

**Subtitles (sliding window):** `graphPanel.ts` webview renders a 10-word chunk around the current `activeIndex`. Font size 18px. The loading/preparing message (`#subtitle-loading-msg`) is 18px, white (`rgba(255,255,255,0.9)`), pulsing between 30%–100% opacity. For non-animated messages (`activeIndex = -1`) — Q&A progress steps and indexing vibes — text renders at full white opacity followed by three pulsing dots (`.anim-dots`, staggered `dotFade` animation) to indicate the system is working.

**Language picker:** Subtitle icon opens a dropdown (English / Hindi / Kannada / Telugu). Posts `{ type:'control', action:'lang-<code>' }`, applies matching font class to `#subtitle-words`.

**Video controls layout:** `#controls-bar` — LEFT: `[⏮ prev] [⏸/▶ pause] [⏭ next]`; RIGHT: `[DeepDive] [Volume▲] [Lang▲] [? Ask] | [▶ Next File] [⏹ Stop]`.

**Stop / close:** `walkthrough.stop` (Esc) and ⏹ both call `activeGraphPanel?.dispose()`. `deactivate()` also calls `disposeEmbedder()` to shut down the Python embedding process.

**No screen split:** all `showTextDocument` calls pass `{ viewColumn: vscode.ViewColumn.One }`.

**Prefetch:** block N+1 audio is fetched while block N plays. `narrationCache` stores narration text for subtitles.

## Controls (active when `walkthrough.running`)

| Key | Action |
|---|---|
| `Ctrl+Shift+E` / title button | Start / restart |
| `Space` | Pause / Resume |
| `←` / `→` | Prev / Next block |
| `D` / `Ctrl+Shift+I` | Deep Dive — line-by-line with amber highlights |
| `F` / `Ctrl+Shift+,` | Skip file → next file in graph |
| `Q` / `Ctrl+Shift+/` | Ask (Qdrant RAG → spoken answer) |
| `Esc` | Stop all |

## LLM providers

| Provider | Notes |
|---|---|
| `groq` | OpenAI-compat, `https://api.groq.com/openai/v1`. Qwen3 models get `reasoning_effort: "none"` to strip chain-of-thought tokens. |
| `openai` | `https://api.openai.com/v1` |
| `anthropic` | `https://api.anthropic.com/v1/messages` — different request/response shape, handled by `callAnthropic()` |
| `custom` | Any OpenAI-compat endpoint via `cfg.customBaseUrl` |

## Config shape (`WalkthroughConfig`)

```typescript
{
  provider:          LLMProvider;   // groq | openai | anthropic | custom
  model:             string;
  apiKey:            string;        // LLM key (SecretStorage)
  sarvamApiKey:      string;        // TTS key (SecretStorage)
  customBaseUrl:     string;
  embeddingProvider: "local";       // always local — all-MiniLM-L6-v2 via Python
}
```

## API keys

`.env` at project root (dev fallback — production uses SecretStorage):
```
GROQ_API_KEY=...
SARVAM_API_KEY=...
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...        # only for cloud Qdrant
```

Qdrant URL and API key are read from `process.env` directly (not stored in SecretStorage).

## Embedder — local sentence-transformers

`src/embedder.ts` spawns a persistent Python process on first use:
- Model: `all-MiniLM-L6-v2` (384 dims, already cached at `~/.cache/huggingface/hub/`)
- Protocol: stdin/stdout JSON lines — send `["text1","text2"]`, receive `[[...],[...]]`
- Process stays alive for the full session; `disposeEmbedder()` closes it on deactivate
- Requires: `pip install sentence-transformers`

## Incremental indexing cache

- Location: `<wsRoot>/.vscode/walkthrough-vector-cache.json`
- Schema: `{ embeddingProvider, vectorSize, files: { [relPath]: { hash, blockCount, indexedAt } } }`
- Hash: SHA-256 of file content, first 16 hex chars
- Block IDs in Qdrant: stable UUID derived from `MD5(relPath + "::" + label)` → idempotent upserts
- Cache invalidated on provider/vector-size change → full re-index
