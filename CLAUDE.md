# Walkthrough — Codebase Context

VS Code extension (TypeScript). Walks through `.ts` / `.py` files block-by-block with yellow highlights, AI voice narration, Netflix-style subtitles, and a live import-graph panel.

## Module map

| File | Role |
|---|---|
| `src/extension.ts` | `activate()` — 9 commands, multi-file orchestration, 9-item control bar |
| `src/graph.ts` | `buildImportGraph(root, wsRoot)` → `ImportGraph`; `flattenDFS` for traversal order |
| `src/graphPanel.ts` | WebviewPanel KG — renders file tree with pending/active/completed/skipped status |
| `src/parser.ts` | `parseBlocks(source, langId)` — tree-sitter for TS + Python; returns `SemanticBlock[]` |
| `src/narrate.ts` | `fetchNarration` (Groq), `generateAudio` (Sarvam TTS), `queryCodebase` (Qdrant), `fetchDeepDiveNarrations` |
| `src/session.ts` | `WalkthroughSession` — playback loop, pause/resume, prefetch, subtitles, deep dive, Q&A |
| `src/audioPlayer.ts` | Spawns `afplay` / PowerShell `SoundPlayer` / `aplay`; `stop()` kills the process |

## Key flows

**Multi-file walkthrough:** `explain` → `buildImportGraph` (workspace scan + path math) → `GraphPanel` → DFS queue → per-file `WalkthroughSession`. F=skip file, Esc=stop all.

**Pause fix:** `playWithControls` loops — killing the audio process resolves `play()` with `"next"`, but `this.paused` is true so `continue` replays the clip instead of advancing.

**Subtitles:** `after` decoration on the block's last line. Font injected via `textDecoration` CSS trick (VS Code doesn't expose `fontFamily` directly). Shows `⏳ Preparing...` while fetching, then actual narration text.

**Prefetch:** block N+1 audio is fetched while block N plays. `narrationCache` stores narration text (available before TTS) for subtitles.

## Controls (active when `walkthrough.running`)

| Key | Action |
|---|---|
| `Ctrl+Shift+E` / title button | Start / restart |
| Space | Pause — resumes from same clip start |
| ← / → | Prev / Next block |
| S | Skip block (or line in deep dive) |
| D | Deep Dive — line-by-line with amber highlights |
| F | Skip file → next file in graph |
| Q | Ask (Qdrant + Groq Q&A, blue highlight) |
| Esc | Stop all |

## API keys (`.env` at project root)
```
GROQ_API_KEY=...
SARVAM_API_KEY=...
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...        # only for cloud Qdrant
```
