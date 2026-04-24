import { callLLM } from './narrate';
import type { AnimationBlueprint } from './blueprintTypes';

// Complete schema reference — one line per type showing ALL required fields.
// The LLM must see this so it never returns a scene with only type+narrationChunk.
const SCENE_SCHEMAS = `
textpop      → { "type":"textpop",       "headline":"Short hook ≤6 words",  "subtext":"One explanatory sentence.",  "emoji":"🔑" }
flow         → { "type":"flow",          "title":"Title",   "steps":[{"label":"Step 1"},{"label":"Step 2","color":"#22c55e"}] }
arrow        → { "type":"arrow",         "from":"Source",   "to":"Destination",  "label":"what flows",  "returnLabel":"return val" }
box          → { "type":"box",           "title":"Object",  "items":[{"label":"field","value":"val","highlight":true},{"label":"field2","value":"v2"}] }
tree         → { "type":"tree",          "root":"Root",     "children":[{"label":"Child1","children":[{"label":"Grandchild"}]},{"label":"Child2"}] }
loop         → { "type":"loop",          "title":"Title",   "iterates":"source collection",  "body":["step1","step2","step3"] }
async        → { "type":"async",         "title":"Title",   "steps":[{"label":"await fetchData()","duration":"~200ms","isAwait":true},{"label":"process result","duration":"sync","isAwait":false}] }
error-flow   → { "type":"error-flow",    "title":"Title",   "trySteps":["validate input","call API","parse response"],  "errorType":"ValueError",  "catchAction":"return 400 error" }
database     → { "type":"database",      "tableName":"users","columns":["id","name","email"],"rows":[["1","Alice","a@x.com"],["2","Bob","b@x.com"]],"queryLabel":"SELECT WHERE active=true","matchedRows":[0] }
api-request  → { "type":"api-request",   "method":"POST",   "endpoint":"/api/login",  "requestBody":"{ email, password }",  "statusCode":200,  "responseBody":"{ token, userId }" }
json-viewer  → { "type":"json-viewer",   "title":"Response","json":{"status":"ok","data":{"id":1,"name":"Alice"}},  "highlightKeys":["status"] }
env-config   → { "type":"env-config",    "title":"Env Setup","envVars":[{"key":"JWT_SECRET","value":"s3cr3t","secret":true},{"key":"PORT","value":"5000","secret":false}],  "appName":"App" }
auth-flow    → { "type":"auth-flow",     "title":"Auth Chain","steps":[{"label":"User Login","icon":"user"},{"label":"JWT Token","icon":"token"},{"label":"Server Verify","icon":"server"},{"label":"Authorized","icon":"check"}] }
array        → { "type":"array",         "title":"Title",   "items":["item1","item2","item3"],  "highlightIndex":1,  "operation":"map",  "operationLabel":"transform each item" }
stack        → { "type":"stack",         "title":"Call Stack","items":["main()","processRequest()","validateToken()"],  "activeIndex":2 }
conditional  → { "type":"conditional",   "condition":"is X missing?",  "truePath":["log error","exit(1)"],  "falsePath":["continue","register routes"],  "trueLabel":"YES","falseLabel":"NO","result":"App starts safely" }
pipeline     → { "type":"pipeline",      "title":"Pipeline","input":"Raw Input","stages":[{"label":"Parse","description":"parse JSON"},{"label":"Validate","description":"check fields","color":"#FFD700"},{"label":"Save","description":"write to DB"}],"output":"Response" }
middleware   → { "type":"middleware",    "title":"Request Flow","request":"POST /login","middlewares":[{"name":"CORS","action":"allow origin","passes":true},{"name":"Auth","action":"verify token","passes":true}],"finalHandler":"LoginHandler" }
event-emitter→ { "type":"event-emitter", "eventName":"user.created",  "emitterLabel":"UserService",  "listeners":["EmailService","AuditLogger","Analytics"] }
success      → { "type":"success",       "title":"Returns", "returnType":"AuthToken",  "fields":[{"key":"token","value":"eyJ..."},{"key":"expiresIn","value":"3600s"}],  "executionTime":"12ms" }
timeline     → { "type":"timeline",      "title":"Timeline","events":[{"time":"0ms","label":"Request in"},{"time":"50ms","label":"DB query"},{"time":"120ms","label":"Response sent","color":"#22c55e"}] }
compare      → { "type":"compare",       "title":"Before vs After","leftLabel":"Without Cache","rightLabel":"With Cache","leftItems":["DB hit every time","500ms latency"],"rightItems":["Cache hit","5ms latency"] }
hashmap      → { "type":"hashmap",       "title":"Route Map","pairs":[{"key":"/login","value":"auth_bp"},{"key":"/forms","value":"forms_bp"}],  "showBuckets":false }
stats        → { "type":"stats",         "title":"Metrics","stats":[{"label":"Req/sec","value":1200,"unit":"rps","good":true},{"label":"Error rate","value":2,"unit":"%","good":false}] }
graph-nodes  → { "type":"graph-nodes",   "title":"Dependencies","nodes":[{"id":"a","label":"app.py"},{"id":"b","label":"auth"},{"id":"c","label":"db"}],"edges":[{"from":"a","to":"b","label":"imports"},{"from":"a","to":"c"}] }
`;

const EXAMPLE = `
EXAMPLE — 3 scenes, every field filled with real code data:
{
  "fileTitle": "app.py",
  "blockLabel": "App Startup",
  "narration": "This file starts Flask, loads secrets, and registers routes.",
  "audioDurationMs": 9000,
  "scenes": [
    {
      "type": "textpop",
      "headline": "Flask App Entry Point",
      "subtext": "Loads secrets, registers 4 blueprints, starts server.",
      "emoji": "🚀",
      "narrationChunk": "This file starts Flask."
    },
    {
      "type": "env-config",
      "title": "Loading Secrets",
      "envVars": [
        { "key": "JWT_SECRET",      "value": "••••••••", "secret": true  },
        { "key": "WEBHOOK_SECRET",  "value": "••••••",   "secret": true  },
        { "key": "PORT",            "value": "5000",     "secret": false }
      ],
      "appName": "FlaskApp",
      "narrationChunk": "We load JWT_SECRET and WEBHOOK_SECRET from the environment."
    },
    {
      "type": "conditional",
      "condition": "JWT_SECRET missing?",
      "truePath":  ["log critical error", "sys.exit(1)"],
      "falsePath": ["continue startup",   "register blueprints"],
      "trueLabel":  "MISSING",
      "falseLabel": "OK",
      "result": "App starts safely",
      "narrationChunk": "If JWT_SECRET is absent the app crashes immediately — better to fail fast than be insecure."
    }
  ]
}`;

export async function generateBlueprint(
  code: string,
  blockLabel: string,
  narration: string,
  _apiKey: string,
  audioDurationMs: number
): Promise<AnimationBlueprint> {
  const audioSecs  = audioDurationMs / 1000;

  // Clamp: 1 scene per 3 seconds, between 3 and 12.
  const targetScenes = Math.round(audioSecs / 3);
  const minScenes    = Math.max(3, Math.min(targetScenes, 12));
  const maxScenes    = Math.min(12, minScenes + 2);

  console.log(
    `[Blueprint] ${audioSecs.toFixed(1)}s audio → ` +
    `target ${targetScenes} scenes (min: ${minScenes}, max: ${maxScenes})`
  );

  const system =
    `You are an animation director for a code walkthrough tool. ` +
    `Given code and its narration, produce a motion graphics blueprint. ` +
    `Return ONLY valid JSON — no markdown fences, no explanation outside the JSON object.`;

  const user =
`━━━ SCENE TYPE SCHEMAS (ALL fields are REQUIRED — no field may be omitted) ━━━
${SCENE_SCHEMAS}

━━━ COMPLETE EXAMPLE OUTPUT ━━━
${EXAMPLE}

━━━ YOUR TASK ━━━

Block label: ${blockLabel}

Code (first 900 chars):
\`\`\`
${code.slice(0, 900)}
\`\`\`

Narration (${audioSecs.toFixed(1)} seconds of audio):
${JSON.stringify(narration)}

━━━ RULES ━━━
1. Generate EXACTLY ${minScenes} scenes (range ${minScenes}–${maxScenes}).
   This narration is ${audioSecs.toFixed(1)}s → aim for one scene every ~3 seconds.

2. Split the narration into ${minScenes} sequential chunks.
   Each scene's "narrationChunk" = the exact words being spoken while that scene is on screen.
   Scene 1 plays first, scene ${minScenes} plays last. Cover the FULL narration.

3. Scene 1 MUST be "textpop" — a bold hook summarising the whole block in ≤6 words.
   Scene ${minScenes} SHOULD be "success" (if something is returned/initialised),
   "stats" (if there are measurable outcomes), or "textpop" (summary).

4. Choose the MOST SPECIFIC type per chunk from the schema list above.
   Use "flow" or "textpop" only as a last resort.

5. POPULATE EVERY FIELD with real data extracted from the code.
   Use actual variable names, route names, error types, env var names, function names from the code.
   NEVER leave an array empty. NEVER return a scene with only "type" and "narrationChunk".
   A scene missing its data fields renders a BLANK screen — this is a hard failure.

6. "narrationChunk" values together must cover the ENTIRE narration text end-to-end.

Return only the JSON object. Start with "{" and end with "}".`;

  const text  = await callLLM(system, user, 2500);
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const bp    = JSON.parse(clean) as AnimationBlueprint;
  bp.audioDurationMs = audioDurationMs; // always authoritative

  // Sanitise: replace any scene type the LLM hallucinated with a safe textpop fallback.
  const VALID = new Set([
    'textpop','flow','arrow','box','tree','loop','async','error-flow',
    'database','api-request','json-viewer','env-config','auth-flow','array',
    'stack','conditional','pipeline','middleware','event-emitter','success',
    'timeline','compare','hashmap','stats','graph-nodes',
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp.scenes = (bp.scenes ?? []).map((s: any) => {
    if (VALID.has(s.type)) return s;
    console.warn(`[Blueprint] Unknown scene type "${s.type}" — replacing with textpop`);
    return {
      type: 'textpop',
      headline: (s.narrationChunk ?? s.title ?? blockLabel).slice(0, 40),
      subtext: '',
      emoji: '📦',
      narrationChunk: s.narrationChunk ?? '',
    };
  });

  return bp;
}
