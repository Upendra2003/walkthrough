import { callLLM } from './narrate';
import type { AnimationBlueprint } from './blueprintTypes';

export async function generateBlueprint(
  code: string,
  blockLabel: string,
  narration: string,
  _apiKey: string
): Promise<AnimationBlueprint> {
  const system = `You are an animation director. Generate JSON animation blueprints that explain code using visual metaphors. Think like 3Blue1Brown — show the concept, not the syntax. Return ONLY valid JSON, no markdown, no explanation.`;

  const user = `Code block label: ${blockLabel}
Narration: ${narration}
Code:
\`\`\`
${code}
\`\`\`

Return ONLY a valid JSON object matching this schema exactly:
{
  "fileTitle": "string — file or module name",
  "blockLabel": "string — function or block name",
  "narration": "string — the narration text provided",
  "durationPerScene": 4,
  "scenes": [
    // 3 to 5 scenes maximum
    // { "type": "textpop", "headline": "...", "subtext": "...", "emoji": "🔐" }
    // { "type": "flow", "title": "...", "steps": [{"label": "...", "color": "#hex"}] }
    // { "type": "arrow", "from": "...", "to": "...", "label": "...", "returnLabel": "..." }
    // { "type": "box", "title": "...", "items": [{"label": "...", "value": "...", "highlight": true}] }
    // { "type": "tree", "root": "...", "children": [{"label": "...", "children": [...]}] }
    // { "type": "loop", "title": "...", "iterates": "...", "body": ["step1", "step2"] }
    // { "type": "async", "title": "...", "steps": [{"label": "...", "duration": "~200ms", "isAwait": true}] }
  ]
}

Rules:
- Maximum 5 scenes
- Keep labels SHORT (under 30 chars)
- Make it visual and conceptual, not literal code transcription
- First scene should always be a textpop that hooks the viewer
- Last scene should summarize or show the output/result`;

  const text = await callLLM(system, user, 1000);
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as AnimationBlueprint;
}
