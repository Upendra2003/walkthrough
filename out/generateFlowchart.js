"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFlowchart = generateFlowchart;
const narrate_1 = require("./narrate");
const SYSTEM_PROMPT = `You are a Mermaid.js v11 diagram generator for interactive code walkthroughs.
Given a code block, produce a diagram AND per-node explanations so users can click any node for a simple explanation.

════ OUTPUT FORMAT ════
Return ONLY a JSON object — no markdown fences, no prose outside the JSON.

{
  "mermaid": "<complete diagram as a string — escape newlines as \\n>",
  "explanations": {
    "<nodeId or name>": "<1-2 plain-English sentences a beginner can understand>"
  }
}

Rules for explanations:
- Use the SAME IDs/names used in the diagram (camelCase for flowchart, class/entity/participant names for others)
- Explain WHAT the node does in the code — not just its label
- Max 2 sentences. Simple language. No jargon.
- Include every meaningful node. Skip subgraph wrapper IDs.

════ CHOOSE THE RIGHT DIAGRAM TYPE ════

  flowchart LR    → functions, handlers, pipelines, conditionals, data transforms
  sequenceDiagram → HTTP calls, async flows, auth, multi-actor request/response
  stateDiagram-v2 → state machines, lifecycle hooks, status transitions
  classDiagram    → class definitions, OOP, inheritance, interfaces
  erDiagram       → DB tables, SQLAlchemy/Prisma models, foreign keys
  mindmap         → import lists, config/env, module overviews, settings

════ FLOWCHART LR ════
Start "mermaid" value with: flowchart LR

Arrow syntax (EXACTLY two dashes):
  A --> B               A -->|label| B        A -.-> B
  A ==> B               A --o B               A --x B

Node shapes:
  A["Process"]  A{"Decision?"}  A([Start/End])  A[[Sub]]  A[(DB)]  A>Flag]

Subgraphs (quoted name):
  subgraph grp1["Layer"]\\n    nodeA\\n    nodeB\\n  end

ClassDefs (define all 7, assign at bottom):
  classDef input fill:#6366f1,stroke:#4f46e5,color:#fff
  classDef process fill:#0ea5e9,stroke:#0284c7,color:#fff
  classDef decision fill:#f59e0b,stroke:#d97706,color:#fff
  classDef output fill:#10b981,stroke:#059669,color:#fff
  classDef error fill:#ef4444,stroke:#dc2626,color:#fff
  classDef storage fill:#8b5cf6,stroke:#7c3aed,color:#fff
  classDef external fill:#64748b,stroke:#475569,color:#fff
  class nodeA,nodeB process

STRICT RULES:
- Node IDs: camelCase only. NO spaces, hyphens, underscores as first char.
- FORBIDDEN node IDs (reserved): end class style default direction graph subgraph classDef
  → use endNode, classNode, etc. instead
- Arrow: exactly --> (two dashes). NEVER -> or --->
- NO quotes inside pipe labels: -->|text| YES, -->|"text"| NO
- NO angle brackets < > anywhere
- NO backticks, NO %% comments

════ SEQUENCEDIAGRAM ════
Start "mermaid" value with: sequenceDiagram
Explanations keys = participant names.

  participant Client
  participant Server as API Server
  Client->>Server: POST /login
  Server-->>Client: 200 JWT token
  activate Server
  deactivate Server
  Note over Client,Server: TLS encrypted
  loop Poll every 5s\\n    Client->>Server: GET /status\\n  end
  alt valid\\n    Server-->>Client: 200\\n  else invalid\\n    Server-->>Client: 401\\n  end

STRICT: NO parentheses in message labels. Write "400 Bad Request" not "(400) Bad Request".

════ STATEDIAGRAM-V2 ════
Start "mermaid" value with: stateDiagram-v2
Explanations keys = state names.

  [*] --> Idle
  Idle --> Processing : start
  Processing --> Done : success
  Processing --> Failed : error
  Done --> [*]

════ CLASSDIAGRAM ════
Start "mermaid" value with: classDiagram
Explanations keys = class names.

  class User {
    +int id
    +String email
    +login(password String) bool
  }
  User --|> BaseModel
  User --> Token : generates

════ ERDIAGRAM ════
Start "mermaid" value with: erDiagram
Explanations keys = ENTITY names (uppercase).

  USERS { int id PK  string email  int role_id FK }
  ROLES { int id PK  string name }
  USERS }o--|| ROLES : "belongs to"

Cardinality: ||--||  ||--o{  ||--|{  }o--o{

════ MINDMAP ════
Start "mermaid" value with: mindmap
Explanations keys = node label text exactly as written.

ONLY these 3 shapes (NEVER use ))...((  — causes crashes):
  root((Center Label))    ONLY for the root
  [Section Label]         major sections
  (Item Label)            leaf nodes

Rules: 2-space indentation = hierarchy. No arrows. No colons in labels. No special chars.

Example:
  mindmap\\n    root((App Setup))\\n      Environment\\n        (JWT SECRET)\\n        (DATABASE URL)\\n      Blueprints\\n        (auth bp)

════ COMPLETE EXAMPLE OUTPUT ════
{
  "mermaid": "flowchart LR\\n  subgraph reqPhase[\\"Request Phase\\"]\\n    startNode([\\"POST /login\\"])\\n    parseBody[\\"Parse Body\\"]\\n  end\\n  subgraph authPhase[\\"Auth Check\\"]\\n    checkCreds{\\"Creds Valid?\\"}\\n    genToken[\\"Generate JWT\\"]\\n    rejectNode[\\"Return 401\\"]\\n  end\\n  startNode --> parseBody\\n  parseBody -->|email + password| checkCreds\\n  checkCreds -->|yes| genToken\\n  checkCreds -->|no| rejectNode\\n  classDef input fill:#6366f1,stroke:#4f46e5,color:#fff\\n  classDef process fill:#0ea5e9,stroke:#0284c7,color:#fff\\n  classDef decision fill:#f59e0b,stroke:#d97706,color:#fff\\n  classDef output fill:#10b981,stroke:#059669,color:#fff\\n  classDef error fill:#ef4444,stroke:#dc2626,color:#fff\\n  classDef storage fill:#8b5cf6,stroke:#7c3aed,color:#fff\\n  classDef external fill:#64748b,stroke:#475569,color:#fff\\n  class startNode input\\n  class parseBody,genToken process\\n  class checkCreds decision\\n  class rejectNode error",
  "explanations": {
    "startNode": "This is where an HTTP POST request arrives at the login endpoint. It triggers the entire authentication flow.",
    "parseBody": "Reads the email and password the user sent in the request body. If either is missing the request fails here.",
    "checkCreds": "Compares the email and password against what is stored in the database. This is the core security gate.",
    "genToken": "Creates a signed JWT token that proves the user is logged in. The token expires after a set time.",
    "rejectNode": "Sends back a 401 Unauthorized response when credentials are wrong. No token is issued."
  }
}`;
async function generateFlowchart(code, blockLabel, language, _cfg, explanationLang = "en") {
    const langInstruction = explanationLang !== "en"
        ? `\nReturn all explanation values in ${explanationLang}. Node IDs must remain in English.`
        : "";
    const user = `Block: ${blockLabel}\nLanguage: ${language}\n\n` +
        `Code:\n${code.slice(0, 1400)}`;
    const raw = await (0, narrate_1.callLLM)(SYSTEM_PROMPT + langInstruction, user, 2200);
    // Strip think tags and fences
    const stripped = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
    // Parse JSON response
    let mermaid = '';
    let explanations = {};
    try {
        const parsed = JSON.parse(stripped);
        mermaid = String(parsed.mermaid ?? '');
        explanations = (parsed.explanations && typeof parsed.explanations === 'object')
            ? parsed.explanations
            : {};
    }
    catch {
        // Fallback: treat whole response as raw mermaid (no explanations)
        mermaid = stripped;
    }
    mermaid = sanitizeMermaid(mermaid);
    const VALID_STARTS = ['flowchart', 'sequenceDiagram', 'stateDiagram-v2',
        'classDiagram', 'erDiagram', 'mindmap'];
    if (!VALID_STARTS.some(s => mermaid.startsWith(s))) {
        throw new Error('Invalid Mermaid syntax returned');
    }
    return { mermaid, explanations };
}
function sanitizeMermaid(src) {
    const trimmed = src.trimStart();
    const isSequence = trimmed.startsWith('sequenceDiagram');
    const isClass = trimmed.startsWith('classDiagram');
    const isER = trimmed.startsWith('erDiagram');
    const isMindmap = trimmed.startsWith('mindmap');
    const isState = trimmed.startsWith('stateDiagram');
    let out = src;
    // All types: strip pure separator lines and %% comments
    out = out.replace(/^\s*-{4,}\s*$/gm, '');
    out = out.replace(/%%[^\n]*/g, '');
    // ── Mindmap fixes ─────────────────────────────────────────────────────────
    if (isMindmap) {
        // ))shapeName((label  →  (label)  — LLMs confuse shape name with label
        out = out.replace(/\)\)[^\n(]+\(\(([^\n(]+)/g, (_m, label) => `(${label.trim()})`);
        // ))label(( (correct but fragile)  →  (label)
        out = out.replace(/\)\)([^\n()]+)\(\(/g, (_m, label) => `(${label.trim()})`);
        // Colons in mindmap labels break parser
        out = out.replace(/^( +[^\n]+?):\s*$/gm, '$1');
        out = out.replace(/^( +[^\n]+?):/gm, '$1 ');
        // Strip stray arrows and classDef
        out = out.replace(/[ \t]*--[->|ox]+[^\n]*/g, '');
        out = out.replace(/^\s*classDef[^\n]*/gm, '');
        out = out.replace(/^\s*class\s+[^\n]*/gm, '');
    }
    // ── Sequence diagram fixes ────────────────────────────────────────────────
    if (isSequence) {
        // (400) in message text  →  [400]
        out = out.replace(/^(\s*[\w]+\s*[-]+[>x)]+\s*[\w]+\s*:\s*)(.+)$/gm, (_m, prefix, msg) => prefix + msg.replace(/\(([^)\n]*)\)/g, '[$1]'));
        out = out.replace(/^(\s*Note\s+(?:over|left of|right of)\s+[^:]+:\s*)(.+)$/gm, (_m, prefix, msg) => prefix + msg.replace(/\(([^)\n]*)\)/g, '[$1]'));
    }
    // ── Flowchart arrow normalisation ─────────────────────────────────────────
    if (!isSequence && !isClass && !isER && !isMindmap && !isState) {
        out = out
            .replace(/-{3,}>\|([^|\n]{0,80})\|>/g, '-->|$1|')
            .replace(/-{3,}>\|([^|\n]{0,80})\|/g, '-->|$1|')
            .replace(/-{3,}>/g, '-->')
            .replace(/->\|([^|\n]{0,80})\|>/g, '-->|$1|')
            .replace(/->\|([^|\n]{0,80})\|/g, '-->|$1|')
            .replace(/([A-Za-z0-9_"'\])])\s*->\s*([A-Za-z0-9_"'[({])/g, '$1 --> $2')
            .replace(/-->\|"([^"|\n]*)"\|/g, '-->|$1|')
            .replace(/-->\|'([^'|\n]*)'\|/g, '-->|$1|')
            .replace(/\[([^\]]*)<([^\]]*)\]/g, (_m, a, b) => `[${a} ${b}]`)
            .replace(/\[([^\]]*)>([^\]]*)\]/g, (_m, a, b) => `[${a} ${b}]`);
        // Reserved keyword node IDs before arrows → rename
        const RESERVED = /\b(end|class|style|default|direction|graph|subgraph|classDef|click|call)\b(?=\s*(?:-->|---|-\.->|==>|--o|--x))/g;
        out = out.replace(RESERVED, '$1Node');
    }
    return out.trim();
}
//# sourceMappingURL=generateFlowchart.js.map