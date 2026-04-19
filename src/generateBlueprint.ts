import { callLLM } from './narrate';
import type { AnimationBlueprint } from './blueprintTypes';

export async function generateBlueprint(
  code: string,
  blockLabel: string,
  narration: string,
  _apiKey: string,
  audioDurationMs: number
): Promise<AnimationBlueprint> {
  const audioSecs = audioDurationMs / 1000;
  const wordCount = narration.trim().split(/\s+/).length;
  const minScenes = Math.max(3, Math.ceil(audioSecs / 4));
  const maxScenes = Math.min(8, minScenes + 2);

  const system = `You are an animation director. Generate JSON animation blueprints that explain code using visual metaphors. Think like 3Blue1Brown — show the concept, not the syntax. Return ONLY valid JSON, no markdown, no explanation.`;

  const user = `Code block label: ${blockLabel}
Narration: ${narration}
Code:
\`\`\`
${code}
\`\`\`

The narration audio is EXACTLY ${audioSecs.toFixed(1)} seconds long (${wordCount} words).

Split the narration into exactly ${minScenes} equal parts.
For each part, generate ONE scene that visually explains EXACTLY what that part of the narration is saying.
The scenes must follow the narration's story arc in order — Scene 1 = what the narration says first, Scene ${minScenes} = what the narration says last.
Each scene will be shown for ${(audioSecs / minScenes).toFixed(1)}s on average.

Return ONLY a valid JSON object matching this schema exactly:
{
  "fileTitle": "string — file or module name",
  "blockLabel": "string — function or block name",
  "narration": "string — the narration text provided",
  "audioDurationMs": ${audioDurationMs},
  "scenes": [
    // exactly ${minScenes} scenes, each with a "narrationChunk" field showing which part of the narration it covers
    // { "type": "textpop", "headline": "...", "subtext": "...", "emoji": "🔐", "narrationChunk": "..." }
    // { "type": "flow", "title": "...", "steps": [{"label": "...", "color": "#hex"}], "narrationChunk": "..." }
    // { "type": "arrow", "from": "...", "to": "...", "label": "...", "returnLabel": "...", "narrationChunk": "..." }
    // { "type": "box", "title": "...", "items": [{"label": "...", "value": "...", "highlight": true}], "narrationChunk": "..." }
    // { "type": "tree", "root": "...", "children": [{"label": "...", "children": [...]}], "narrationChunk": "..." }
    // { "type": "loop", "title": "...", "iterates": "...", "body": ["step1", "step2"], "narrationChunk": "..." }
    // { "type": "async", "title": "...", "steps": [{"label": "...", "duration": "~200ms", "isAwait": true}], "narrationChunk": "..." }
  ]
}

Rules:
- Do NOT include durationPerScene in your response JSON
- Keep labels SHORT (under 30 chars)
- Make it visual and conceptual, not literal code transcription
- First scene should always be a textpop that hooks the viewer
- Last scene should summarize or show the output/result`;

  const text = await callLLM(system, user, 1200);
  const clean = text.replace(/```json|```/g, '').trim();
  const bp = JSON.parse(clean) as AnimationBlueprint;
  // Ensure audioDurationMs is set correctly even if LLM drifts
  bp.audioDurationMs = audioDurationMs;
  return bp;
}
