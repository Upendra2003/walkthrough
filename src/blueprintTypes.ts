export type AnimationScene =
  | FlowScene | BoxScene | ArrowScene | TextPopScene | TreeScene | LoopScene | AsyncScene;

export interface FlowScene { type: 'flow'; steps: { label: string; color?: string }[]; title: string; }
export interface BoxScene { type: 'box'; title: string; items: { label: string; value?: string; highlight?: boolean }[]; }
export interface ArrowScene { type: 'arrow'; from: string; to: string; label: string; returnLabel?: string; color?: string; }
export interface TextPopScene { type: 'textpop'; headline: string; subtext: string; emoji?: string; }
export interface TreeScene { type: 'tree'; root: string; children: { label: string; children?: { label: string }[] }[]; }
export interface LoopScene { type: 'loop'; title: string; iterates: string; body: string[]; }
export interface AsyncScene { type: 'async'; title: string; steps: { label: string; duration: string; isAwait: boolean }[]; }
export interface WordTiming { word: string; startMs: number; endMs: number; }

export interface AnimationBlueprint {
  fileTitle: string;
  blockLabel: string;
  narration: string;
  scenes: AnimationScene[];
  durationPerScene: number;
  silent?: boolean;
  audioPath?: string;
  audioDurationMs?: number;
  wordTimings?: WordTiming[];
}
