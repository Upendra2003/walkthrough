export type AnimationScene =
  | FlowScene
  | BoxScene
  | ArrowScene
  | TextPopScene
  | TreeScene
  | LoopScene
  | AsyncScene
  | ErrorFlowScene
  | DatabaseQueryScene
  | APIRequestScene
  | JSONViewerScene
  | EnvConfigScene
  | AuthFlowScene
  | ArrayVisualizerScene
  | StackVisualizerScene
  | ConditionalBranchScene
  | PipelineFlowScene
  | MiddlewareChainScene
  | EventEmitterScene
  | SuccessResultScene
  | TimelineEventsScene
  | CompareViewScene
  | HashMapVisualizerScene
  | StatsCounterScene
  | GraphNodesScene;

export interface FlowScene {
  type: 'flow';
  steps: { label: string; color?: string }[];
  title: string;
}

export interface BoxScene {
  type: 'box';
  title: string;
  items: { label: string; value?: string; highlight?: boolean }[];
}

export interface ArrowScene {
  type: 'arrow';
  from: string;
  to: string;
  label: string;
  returnLabel?: string;
  color?: string;
}

export interface TextPopScene {
  type: 'textpop';
  headline: string;
  subtext: string;
  emoji?: string;
}

export interface TreeScene {
  type: 'tree';
  root: string;
  children: { label: string; children?: { label: string }[] }[];
}

export interface LoopScene {
  type: 'loop';
  title: string;
  iterates: string;
  body: string[];
}

export interface AsyncScene {
  type: 'async';
  title: string;
  steps: { label: string; duration: string; isAwait: boolean }[];
}

export interface ErrorFlowScene {
  type: 'error-flow';
  title: string;
  trySteps: string[];
  errorType: string;
  catchAction: string;
}

export interface DatabaseQueryScene {
  type: 'database';
  tableName: string;
  columns: string[];
  rows: string[][];
  queryLabel: string;
  matchedRows: number[];
}

export interface APIRequestScene {
  type: 'api-request';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  requestBody?: string;
  statusCode: number;
  responseBody: string;
}

export interface JSONViewerScene {
  type: 'json-viewer';
  title: string;
  json: Record<string, unknown>;
  highlightKeys?: string[];
}

export interface EnvConfigScene {
  type: 'env-config';
  title: string;
  envVars: { key: string; value: string; secret?: boolean }[];
  appName: string;
}

export interface AuthFlowScene {
  type: 'auth-flow';
  title: string;
  steps: {
    label: string;
    icon: 'user' | 'token' | 'server' | 'check' | 'lock';
    color?: string;
  }[];
}

export interface ArrayVisualizerScene {
  type: 'array';
  title: string;
  items: string[];
  highlightIndex?: number;
  operation?: 'push' | 'pop' | 'map' | 'filter' | 'none';
  operationLabel?: string;
}

export interface StackVisualizerScene {
  type: 'stack';
  title: string;
  items: string[];
  activeIndex?: number;
}

export interface ConditionalBranchScene {
  type: 'conditional';
  condition: string;
  truePath: string[];
  falsePath: string[];
  trueLabel?: string;
  falseLabel?: string;
  result?: string;
}

export interface PipelineFlowScene {
  type: 'pipeline';
  title: string;
  input: string;
  stages: { label: string; description: string; color?: string }[];
  output: string;
}

export interface MiddlewareChainScene {
  type: 'middleware';
  title: string;
  request: string;
  middlewares: {
    name: string;
    action: string;
    passes: boolean;
  }[];
  finalHandler: string;
}

export interface EventEmitterScene {
  type: 'event-emitter';
  eventName: string;
  emitterLabel: string;
  listeners: string[];
}

export interface SuccessResultScene {
  type: 'success';
  title: string;
  returnType: string;
  fields: { key: string; value: string }[];
  executionTime?: string;
}

export interface TimelineEventsScene {
  type: 'timeline';
  title: string;
  events: {
    time: string;
    label: string;
    color?: string;
  }[];
}

export interface CompareViewScene {
  type: 'compare';
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftItems: string[];
  rightItems: string[];
  leftColor?: string;
  rightColor?: string;
}

export interface HashMapVisualizerScene {
  type: 'hashmap';
  title: string;
  pairs: { key: string; value: string; bucket?: number }[];
  showBuckets?: boolean;
}

export interface StatsCounterScene {
  type: 'stats';
  title: string;
  stats: {
    label: string;
    value: number;
    unit: string;
    color?: string;
    good?: boolean;
  }[];
}

export interface GraphNodesScene {
  type: 'graph-nodes';
  title: string;
  nodes: { id: string; label: string; color?: string }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface AnimationBlueprint {
  fileTitle: string;
  blockLabel: string;
  narration: string;
  scenes: AnimationScene[];
  audioDurationMs: number; // source of truth — video matches this exactly
  silent?: boolean;        // if true, no audio or subtitles baked in
  audioPath?: string;
  wordTimings?: WordTiming[];
}
