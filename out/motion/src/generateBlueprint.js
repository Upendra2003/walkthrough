"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBlueprint = generateBlueprint;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
async function generateBlueprint(code, blockLabel, narration, apiKey) {
    const client = new sdk_1.default({ apiKey });
    const prompt = `
You are an animation director. Given a code block, generate a JSON animation blueprint
that explains what this code DOES using visual metaphors. Think like 3Blue1Brown —
show the concept, not the syntax.

Code block label: ${blockLabel}
Narration: ${narration}
Code:
\`\`\`
${code}
\`\`\`

Return ONLY a valid JSON object matching this schema exactly, no markdown, no explanation:
{
  "fileTitle": "string — file or module name",
  "blockLabel": "string — function or block name",
  "narration": "string — the narration text provided",
  "durationPerScene": 4,
  "scenes": [
    // 3 to 5 scenes maximum
    // Pick scene types that best explain the concept:
    //
    // { "type": "textpop", "headline": "...", "subtext": "...", "emoji": "🔐" }
    // Use for: opening hook, summarizing what the function does
    //
    // { "type": "flow", "title": "...", "steps": [{"label": "...", "color": "#hex"}] }
    // Use for: sequential steps, pipeline, middleware chain
    //
    // { "type": "arrow", "from": "...", "to": "...", "label": "...", "returnLabel": "..." }
    // Use for: function calls, API requests, data passing between two things
    //
    // { "type": "box", "title": "...", "items": [{"label": "...", "value": "...", "highlight": true}] }
    // Use for: objects, configs, return values, parameters
    //
    // { "type": "tree", "root": "...", "children": [{"label": "...", "children": [...]}] }
    // Use for: recursive functions, import trees, component hierarchies
    //
    // { "type": "loop", "title": "...", "iterates": "...", "body": ["step1", "step2"] }
    // Use for: for loops, map/filter/reduce, iteration patterns
    //
    // { "type": "async", "title": "...", "steps": [{"label": "...", "duration": "~200ms", "isAwait": true}] }
    // Use for: async/await functions, promise chains, API calls with waiting
  ]
}

Rules:
- Maximum 5 scenes
- Keep labels SHORT (under 30 chars)
- Make it visual and conceptual, not literal code transcription
- First scene should always be a textpop that hooks the viewer
- Last scene should summarize or show the output/result
`;
    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
}
//# sourceMappingURL=generateBlueprint.js.map