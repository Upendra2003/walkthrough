# Walkthrough
<img width="2752" height="1097" alt="Intro1" src="https://github.com/user-attachments/assets/d98cfb52-7980-4484-8620-0a0e410315f8" />

> *AI tools generate large codebases fast. But comprehending them? That's still on you.*
>
> **What if your codebase had a Netflix narrator?**

Walkthrough is a VS Code extension that turns any TypeScript or Python project into a guided, voice-narrated code tour. Block by block, file by file — with highlights, subtitles, and an AI that actually understands your code.
<img width="1919" height="1079" alt="Main" src="https://github.com/user-attachments/assets/3f8f099c-63d9-4ff8-a04d-b25895652239" />

---
## What it does

You open a project, press play, and a senior-developer voice walks you through every function, class, and module — explaining what it does, why it exists, and how it fits the bigger picture. Like a documentary, but for code.

You are never just reading. You are watching, listening, and asking.

---

## Features

| Feature | How to use |
|---|---|
| **Voice narration** | Plays automatically, block by block |
| **Netflix-style subtitles** | Word-by-word animation — sliding 10-word window, stays in sync |
| **Pause / Resume** | `Space` or the ⏸ button — resumes audio from exact pause point, subtitle from exact word |
| **Skip block** | `→` |
| **Go back** | `←` |
| **Deep Dive** | `D` — line-by-line walkthrough of any block |
| **Ask anything** | `Q` — ask a question, get a spoken answer from your codebase |
| **Skip file** | `F` — jump to the next file in the import graph |
| **Stop** | `Esc` — stops walkthrough and closes the codebase map panel |
| **In-panel controls** | ⏮ ⏸ ⏭ + DeepDive · Volume · Language · Ask · Next File · Stop |

### Ask (Q&A)
Press `Q` at any point. Type your question. The extension shows you exactly what it's doing — live in the subtitle zone:

```
🔍 Analysing your question...
📡 Searching the codebase index...
📂 Fetched 8 blocks from: database.py · models.py · routes/auth.py — feeding to AI...
🤖 Asking AI with context from 3 files...
```

Then it speaks the answer back with word-by-word subtitles, and highlights the most relevant block in the editor.

```
Q: "how is auth handled?"

→ highlights routes/auth.py
→ speaks: "Authentication uses a JWT system. The jwt_required decorator
   validates a Bearer token and populates g.user with the MongoDB user
   document. Login is at /login, and /me retrieves the current user."
```

### Multi-file walkthrough
Walkthrough automatically builds an import graph from your entry point, traverses it in DFS order, and walks through every file — tracking progress in a live knowledge graph panel.

### Codebase indexing
On every session start, Walkthrough scans your project, embeds every semantic block using a **local `all-MiniLM-L6-v2` model** (no API key needed), and stores the vectors in Qdrant. Unchanged files are skipped via a hash cache. The Q&A feature uses these vectors for retrieval-augmented answers.

---

## Setup

### 1. Install the extension
Open VS Code → Extensions → search **Walkthrough** → Install.

### 2. Install sentence-transformers (one-time)
Codebase indexing and Q&A run fully locally — no embedding API key needed.

```bash
pip install sentence-transformers
```

The `all-MiniLM-L6-v2` model (~90 MB) will be downloaded automatically on first use and cached at `~/.cache/huggingface/hub/`.

### 3. Configure (first launch)
The setup wizard opens automatically. You need:

| Key | Where to get it |
|---|---|
| **LLM API key** | [console.groq.com](https://console.groq.com) (free) — or OpenAI / Anthropic |
| **Sarvam AI key** | [dashboard.sarvam.ai](https://dashboard.sarvam.ai) (free) — voice narration |
| **Qdrant** | [cloud.qdrant.io](https://cloud.qdrant.io) (free tier) or run locally |

Reopen the wizard anytime via `Ctrl+Shift+P` → **Walkthrough: Configure**.

### 4. Environment variables (optional, for local dev)

```env
GROQ_API_KEY=...
SARVAM_API_KEY=...
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...
```

---

## Supported languages

- TypeScript / TSX
- Python

---

## Supported LLM providers

| Provider | Models |
|---|---|
| **Groq** (recommended, free) | Qwen3 32B, Llama 3.3 70B, DeepSeek R1, Mixtral, Gemma |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **Custom** | Any OpenAI-compatible endpoint |

---

## Architecture

```
extension.ts        activation, commands, indexing UI, session orchestrator
├── graph.ts        import graph builder (DFS traversal order)
├── graphPanel.ts   unified right panel — file tree + subtitle zone + video controls
├── parser.ts       tree-sitter semantic block parser (TS + Python)
├── session.ts      playback engine — pause/resume (audio trim + word resume), skip, deep dive, Q&A
├── narrate.ts      LLM narration, Sarvam TTS, Qdrant Q&A (RAG + live progress)
├── embedder.ts     local all-MiniLM-L6-v2 via persistent Python subprocess
├── codebaseIndexer.ts  workspace scanner + Qdrant vector upsert (384-dim)
├── audioPlayer.ts  cross-platform audio (PowerShell / afplay / aplay) + elapsedMs
├── onboarding.ts   setup wizard (3-step webview — no embedding key step)
└── config.ts       SecretStorage + VS Code settings manager
```

---

## Keyboard shortcuts

| Action | Key |
|---|---|
| Start / Restart | `Ctrl+Shift+E` |
| Pause / Resume | `Space` |
| Previous block | `←` |
| Next block | `→` |
| Deep Dive | `D` or `Ctrl+Shift+I` |
| Skip file | `F` or `Ctrl+Shift+,` |
| Ask (Q&A) | `Q` or `Ctrl+Shift+/` |
| Stop | `Esc` |

All shortcuts are active only while a walkthrough is running (`walkthrough.running` context).

---

## Roadmap

### Animated mascot
A character that lives alongside the code — reacts to what's being explained, shows surprise at complex logic, nods along to simple ones. Explanation that feels like a friend, not a textbook.

### Note-taking
Write notes directly beside code blocks while listening. Attached to the block, exportable as markdown, persisted across sessions.

### Open source contributions
- Tree-sitter grammar improvements for better block detection
- Additional language support (Go, Rust, Java)
- Alternative TTS providers

---

## Contributing

Issues and PRs are welcome. If you find a codebase where the narration is confusing or wrong, open an issue with the file — improving the prompt is the highest-leverage contribution right now.
