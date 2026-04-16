# Walkthrough — Codebase Context

VS Code extension (TypeScript). Walks through `.ts` / `.py` files block-by-block with yellow highlights, AI voice narration, Netflix-style subtitles, and a live import-graph panel. Includes codebase indexing into Qdrant for semantic Q&A.

## Module map

| File | Role |
|---|---|
| `src/extension.ts` | `activate()` — commands, status-bar info item, indexing gate, multi-file orchestrator |
| `src/graph.ts` | `buildImportGraph(root, wsRoot)` → `ImportGraph`; `flattenDFS` for traversal order |
| `src/graphPanel.ts` | Unified right panel (WebviewPanel) — file tree (top, scrollable) + subtitle zone (middle, fixed 88px) + video controls (bottom). Messages: `update`, `subtitle`, `subtitle-loading`, `subtitle-hide`, `subtitle-language`, `set-paused`. Receives: `navigate`, `control`, `toggle-language`. |
| `src/parser.ts` | `parseBlocks(source, langId)` — tree-sitter for TS + Python; returns `SemanticBlock[]` |
| `src/narrate.ts` | `fetchNarration` (LLM), `generateAudio` (Sarvam TTS), `queryCodebase` (Qdrant RAG), `fetchDeepDiveNarrations` |
| `src/session.ts` | `WalkthroughSession` — playback loop, pause/resume (word-level resume), prefetch, subtitles, deep dive, Q&A (speaks answer) |
| `src/audioPlayer.ts` | Spawns `afplay` / PowerShell `SoundPlayer` / `aplay`; `stop()` kills the process |
| `src/embedder.ts` | `embed(texts, cfg)` — Jina AI (`jina-embeddings-v2-base-code`, 768 dims) or OpenAI (`text-embedding-3-small`, 1536 dims) |
| `src/codebaseIndexer.ts` | `indexWorkspace` — scans workspace, embeds blocks, upserts into Qdrant; `needsIndexing` — sync hash-cache pre-check (no network) |
| `src/config.ts` | `ConfigManager` — SecretStorage + VS Code settings; `WalkthroughConfig` shape; model catalogues |
| `src/onboarding.ts` | 4-step setup wizard webview — Provider → API Key + Model → Voice + Jina → Done |

## Key flows

**Multi-file walkthrough:** `explain` → check config → model picker → indexing gate → `buildImportGraph` → `GraphPanel` → DFS queue → per-file `WalkthroughSession`. F=skip file, Esc=stop all.

**Indexing gate (every session start):**
1. `needsIndexing(wsRoot, cfg)` — sync, reads `.vscode/walkthrough-vector-cache.json`, hashes all `.ts`/`.py` files. Zero network calls.
2. If unchanged → posts `{ type: 'subtitle', words: [...], activeIndex: -1 }` showing "✓ Codebase knowledge is up to date." in the graph panel subtitle zone, then hides after 1.4 s.
3. If changed → `runIndexingWithUI` → posts `subtitle-loading` then cycling vibe messages (phase 1) then live file progress (phase 2) → cinematic finale messages → `subtitle-hide`.

**Codebase indexing:** `indexWorkspace` scans files, hashes for incremental cache, embeds blocks in batches of 10 via Jina/OpenAI, upserts into Qdrant collection `code_blocks`. Cache stored at `.vscode/walkthrough-vector-cache.json`.

**Q&A flow (Q key):** session pauses → user types question → `queryCodebase` embeds question → Qdrant vector search (top 5 blocks, score ≥ 0.25) → LLM answers with RAG context → **`generateAudio` + `AudioPlayer` speaks the answer** → subtitle word-by-word animation in sync → Space resumes walkthrough.

**Pause/resume word fix:** `togglePause()` kills the audio player and calls `cancelSubtitleAnimation()`, which now returns the last displayed word index (stored in `subtitleResumeIndex`). When `playWithControls` loops back after `waitForResume()`, it calls `startSubtitleAnimation(text, subtitleResumeIndex)` so the subtitle continues from the exact word it stopped at — not from the beginning. `subtitleResumeIndex` is reset to 0 at the top of each `playWithControls` call so each new block/chunk starts fresh.

**Subtitles (sliding window):** `graphPanel.ts` webview renders a 10-word chunk around the current `activeIndex`. When `activeIndex` crosses a chunk boundary (every 10 words), the display snaps to the next chunk — like real subtitles. The subtitle zone is a fixed 88px tall container; content never overflows. For non-animated messages (indexing vibes, `activeIndex = -1`), all words render as plain text at 75% opacity.

**Video controls:** `graphPanel.ts` hosts a `#controls-bar` row at the bottom (⏮ ⏸ ⏭ | Skip Dive File Ask ⏹). Button clicks post `{ type: 'control', action }` to the extension. `GraphPanel.onControl(cb)` wires the handler. `GraphPanel.postMessage({ type: 'set-paused', paused })` flips the ⏸/▶ icon. Status bar button items have been removed — the panel is the single control surface.

**Stop / close:** `walkthrough.stop` (Esc) and the in-panel ⏹ button both call `activeGraphPanel?.dispose()` so the codebase map panel closes automatically.

**No screen split:** all `showTextDocument` calls in `runMultiFileWalkthrough` pass `{ viewColumn: vscode.ViewColumn.One }` — code always opens in column 1, graph panel always stays in column 2.

**Prefetch:** block N+1 audio is fetched while block N plays. `narrationCache` stores narration text (available before TTS) for subtitles.

## Controls (active when `walkthrough.running`)

| Key | Action |
|---|---|
| `Ctrl+Shift+E` / title button | Start / restart |
| `Space` | Pause / Resume |
| `←` / `→` | Prev / Next block |
| `S` / `Ctrl+Shift+.` | Skip block (or line in deep dive) |
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
  provider:           LLMProvider;       // groq | openai | anthropic | custom
  model:              string;
  apiKey:             string;            // LLM key (SecretStorage)
  sarvamApiKey:       string;            // TTS key (SecretStorage)
  customBaseUrl:      string;
  embeddingProvider:  "jina" | "openai";
  embeddingApiKey:    string;            // Jina or OpenAI key (SecretStorage)
}
```

Fallback chain for `embeddingApiKey`: SecretStorage → `JINA_API_KEY` env → `EMBEDDING_API_KEY` env.

## API keys

`.env` at project root (dev fallback — production uses SecretStorage):
```
GROQ_API_KEY=...
SARVAM_API_KEY=...
JINA_API_KEY=...
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...        # only for cloud Qdrant
```

Qdrant URL and API key are read from `process.env` directly (not stored in SecretStorage).

## Incremental indexing cache

- Location: `<wsRoot>/.vscode/walkthrough-vector-cache.json`
- Schema: `{ embeddingProvider, vectorSize, files: { [relPath]: { hash, blockCount, indexedAt } } }`
- Hash: SHA-256 of file content, first 16 hex chars
- Block IDs in Qdrant: stable UUID derived from `MD5(relPath + "::" + label)` → idempotent upserts
- Cache invalidated on provider/vector-size change → full re-index
