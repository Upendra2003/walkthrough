# Graph Report - .  (2026-04-17)

## Corpus Check
- Corpus is ~19,886 words - fits in a single context window. You may not need a graph.

## Summary
- 168 nodes · 310 edges · 15 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.8)
- Token cost: 3,200 input · 2,100 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Playback Engine & Session Control|Playback Engine & Session Control]]
- [[_COMMUNITY_Documentation & Media Assets|Documentation & Media Assets]]
- [[_COMMUNITY_Config Management & Utilities|Config Management & Utilities]]
- [[_COMMUNITY_Extension Activation & UI Controls|Extension Activation & UI Controls]]
- [[_COMMUNITY_Codebase Indexing & Qdrant|Codebase Indexing & Qdrant]]
- [[_COMMUNITY_LLM Narration & API Calls|LLM Narration & API Calls]]
- [[_COMMUNITY_Import Graph & Language Detection|Import Graph & Language Detection]]
- [[_COMMUNITY_Video Control Assets|Video Control Assets]]
- [[_COMMUNITY_Code Block Parser|Code Block Parser]]
- [[_COMMUNITY_Embedding Layer|Embedding Layer]]
- [[_COMMUNITY_Audio Player|Audio Player]]
- [[_COMMUNITY_Onboarding Wizard|Onboarding Wizard]]
- [[_COMMUNITY_Project Overview|Project Overview]]
- [[_COMMUNITY_Onboarding Module|Onboarding Module]]
- [[_COMMUNITY_Roadmap|Roadmap]]

## God Nodes (most connected - your core abstractions)
1. `WalkthroughSession` - 25 edges
2. `log()` - 17 edges
3. `runMultiFileWalkthrough()` - 14 edges
4. `indexWorkspace()` - 11 edges
5. `GraphPanel` - 9 edges
6. `runSingleFile()` - 7 edges
7. `callLLM()` - 7 edges
8. `session.ts â€” WalkthroughSession Playback Engine` - 7 edges
9. `getConfig()` - 6 edges
10. `queryCodebase()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Video Back Play Button Icon` --conceptually_related_to--> `Video Controls Bar`  [INFERRED]
  assets/Video-BackPlayButton.png → CLAUDE.md
- `Video Left Skip Icon` --conceptually_related_to--> `Video Controls Bar`  [INFERRED]
  assets/Video-LeftSkip.png → CLAUDE.md
- `Video Right Skip Icon` --conceptually_related_to--> `Video Controls Bar`  [INFERRED]
  assets/Video-RightSkip.png → CLAUDE.md
- `Video Play Button Icon` --conceptually_related_to--> `Video Controls Bar`  [INFERRED]
  assets/Video-PlayButton.png → CLAUDE.md
- `runMultiFileWalkthrough()` --calls--> `flattenDFS()`  [INFERRED]
  src\extension.ts → src\graph.ts

## Hyperedges (group relationships)
- **Q&A RAG Pipeline** — claudemd_qa_flow, claudemd_qdrant, claudemd_narrate_ts, claudemd_audioplayer_ts, claudemd_sliding_window_subtitles [EXTRACTED 0.95]
- **Multi-File Walkthrough Orchestration** — claudemd_extension_ts, claudemd_graph_ts, claudemd_session_ts, claudemd_graphpanel_ts [EXTRACTED 0.95]
- **Codebase Indexing Pipeline** — claudemd_codebaseindexer_ts, claudemd_embedder_ts, claudemd_qdrant, claudemd_incremental_indexing_cache [EXTRACTED 0.95]

## Communities

### Community 0 - "Playback Engine & Session Control"
Cohesion: 0.19
Nodes (3): findRootFile(), log(), WalkthroughSession

### Community 1 - "Documentation & Media Assets"
Cohesion: 0.09
Nodes (26): Video Pause Button Icon, Volume Audio Control Icon, audioPlayer.ts â€” Cross-Platform Audio Player, codebaseIndexer.ts â€” Workspace Scanner & Qdrant Upserter, config.ts â€” ConfigManager & WalkthroughConfig, embedder.ts â€” Embedding API Wrapper, extension.ts â€” Activation & Orchestrator, graph.ts â€” Import Graph Builder (+18 more)

### Community 2 - "Config Management & Utilities"
Cohesion: 0.14
Nodes (5): stableUUID(), ConfigManager, buildHtml(), GraphPanel, serializeNode()

### Community 3 - "Extension Activation & UI Controls"
Cohesion: 0.21
Nodes (13): activate(), deactivate(), delay(), initControlBar(), langLabel(), makeCallbacks(), makeSBItem(), runIndexingWithUI() (+5 more)

### Community 4 - "Codebase Indexing & Qdrant"
Cohesion: 0.3
Nodes (15): cachePath(), ensureCollection(), extToLang(), fileHash(), indexWorkspace(), loadCache(), needsIndexing(), pingQdrant() (+7 more)

### Community 5 - "LLM Narration & API Calls"
Cohesion: 0.27
Nodes (13): loadAndApplyConfig(), callAnthropic(), callLLM(), callOpenAICompat(), fetchDeepDiveNarrations(), fetchNarration(), generateAudio(), getConfig() (+5 more)

### Community 6 - "Import Graph & Language Detection"
Cohesion: 0.26
Nodes (10): buildImportGraph(), extractImports(), extractNames(), extractPythonImports(), extractTsImports(), flattenDFS(), resolveImport(), resolvePythonImport() (+2 more)

### Community 7 - "Video Control Assets"
Cohesion: 0.2
Nodes (10): Video Back Play Button Icon, Video Left Skip Icon, Netflix N Logo Play Button Icon, Video Play Button Icon, Video Right Skip Icon, Subtitle Toggle Icon, graphPanel.ts â€” Unified Right Panel, Sliding Window Subtitle Rendering (+2 more)

### Community 8 - "Code Block Parser"
Cohesion: 0.44
Nodes (8): assembleBlocks(), extractArrowFunctionName(), extractPyClassMethods(), extractTsClassMethods(), mergeRanges(), parseBlocks(), parsePythonBlocks(), parseTypeScriptBlocks()

### Community 9 - "Embedding Layer"
Cohesion: 0.8
Nodes (4): embed(), embedJina(), embedOpenAI(), httpPost()

### Community 10 - "Audio Player"
Cohesion: 0.5
Nodes (1): AudioPlayer

### Community 11 - "Onboarding Wizard"
Cohesion: 0.67
Nodes (2): buildHtml(), OnboardingPanel

### Community 12 - "Project Overview"
Cohesion: 1.0
Nodes (2): Walkthrough VS Code Extension, Walkthrough Extension (README)

### Community 13 - "Onboarding Module"
Cohesion: 1.0
Nodes (1): onboarding.ts â€” 4-Step Setup Wizard

### Community 14 - "Roadmap"
Cohesion: 1.0
Nodes (1): Roadmap â€” Future Features

## Knowledge Gaps
- **20 isolated node(s):** `Walkthrough VS Code Extension`, `onboarding.ts â€” 4-Step Setup Wizard`, `Prefetch: Block N+1 Audio While N Plays`, `WalkthroughConfig Shape`, `Sarvam AI TTS â€” Voice Narration` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Project Overview`** (2 nodes): `Walkthrough VS Code Extension`, `Walkthrough Extension (README)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Onboarding Module`** (1 nodes): `onboarding.ts â€” 4-Step Setup Wizard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Roadmap`** (1 nodes): `Roadmap â€” Future Features`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runMultiFileWalkthrough()` connect `Extension Activation & UI Controls` to `Playback Engine & Session Control`, `Code Block Parser`, `Config Management & Utilities`, `Import Graph & Language Detection`?**
  _High betweenness centrality (0.236) - this node is a cross-community bridge._
- **Why does `log()` connect `Playback Engine & Session Control` to `Extension Activation & UI Controls`, `LLM Narration & API Calls`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `parseBlocks()` connect `Code Block Parser` to `Extension Activation & UI Controls`, `Codebase Indexing & Qdrant`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `log()` (e.g. with `.run()` and `.togglePause()`) actually correct?**
  _`log()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `runMultiFileWalkthrough()` (e.g. with `buildImportGraph()` and `flattenDFS()`) actually correct?**
  _`runMultiFileWalkthrough()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `indexWorkspace()` (e.g. with `parseBlocks()` and `embed()`) actually correct?**
  _`indexWorkspace()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Walkthrough VS Code Extension`, `onboarding.ts â€” 4-Step Setup Wizard`, `Prefetch: Block N+1 Audio While N Plays` to the rest of the system?**
  _20 weakly-connected nodes found - possible documentation gaps or missing edges._