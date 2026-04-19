import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Audio, staticFile } from 'remotion';
import { AnimationBlueprint, AnimationScene } from '../types';
import { SubtitleBar } from '../components/SubtitleBar';
import { FlowDiagram } from '../components/FlowDiagram';
import { ArrowDiagram } from '../components/ArrowDiagram';
import { BoxDiagram } from '../components/BoxDiagram';
import { TreeDiagram } from '../components/TreeDiagram';
import { LoopDiagram } from '../components/LoopDiagram';
import { AsyncDiagram } from '../components/AsyncDiagram';
import { TextPop } from '../components/TextPop';

const BAR_HEIGHT = 60;
const CROSSFADE_FRAMES = 8;

interface Props {
  blueprint: AnimationBlueprint;
}

const renderScene = (
  scene: AnimationScene,
  localFrame: number,
  fps: number,
) => {
  const base = { frame: localFrame, fps };
  switch (scene.type) {
    case 'flow':    return <FlowDiagram {...scene} {...base} />;
    case 'arrow':   return <ArrowDiagram {...scene} {...base} />;
    case 'box':     return <BoxDiagram {...scene} {...base} />;
    case 'tree':    return <TreeDiagram {...scene} {...base} />;
    case 'loop':    return <LoopDiagram {...scene} {...base} />;
    case 'async':   return <AsyncDiagram {...scene} {...base} />;
    case 'textpop': return <TextPop {...scene} {...base} />;
    default:        return null;
  }
};

export const CodeExplainer: React.FC<Props> = ({ blueprint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!blueprint) return null;

  const sceneCount = Math.max(1, blueprint.scenes.length);
  const totalFrames = Math.ceil((blueprint.audioDurationMs / 1000) * fps);
  const framesPerScene = Math.max(1, Math.floor(totalFrames / sceneCount));

  // Compute which scene is active and the frame within that scene
  const sceneIndex = Math.min(Math.floor(frame / framesPerScene), sceneCount - 1);
  const localFrame = frame - sceneIndex * framesPerScene;

  // Crossfade opacity for current scene
  const fadeIn = interpolate(localFrame, [0, CROSSFADE_FRAMES], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    localFrame,
    [framesPerScene - CROSSFADE_FRAMES, framesPerScene],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const sceneOpacity = Math.min(fadeIn, fadeOut);

  const truncatedNarration =
    blueprint.narration.length > 80
      ? blueprint.narration.slice(0, 79) + '…'
      : blueprint.narration;

  const scene = blueprint.scenes[sceneIndex];

  return (
    <AbsoluteFill style={{ background: '#0d1117', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {!blueprint.silent && blueprint.audioPath && (
        <Audio src={staticFile(blueprint.audioPath)} startFrom={0} volume={1} />
      )}

      {/* Watermark */}
      <div style={{
        position: 'absolute', top: 12, left: 16, zIndex: 10,
        color: '#FF0000', fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontWeight: 700, letterSpacing: 1, opacity: 0.85,
      }}>
        Walkthrough
      </div>

      {/* Main content area */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: BAR_HEIGHT,
        opacity: sceneOpacity,
      }}>
        {scene ? renderScene(scene, localFrame, fps) : null}
      </div>

      {!blueprint.silent && blueprint.wordTimings && blueprint.wordTimings.length > 0 && (
        <SubtitleBar wordTimings={blueprint.wordTimings} />
      )}

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: BAR_HEIGHT,
        background: '#111',
        borderTop: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          flex: '0 0 auto',
          color: '#6b7280',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          minWidth: 180,
        }}>
          {blueprint.blockLabel}
        </div>

        <div style={{
          flex: 1,
          color: '#ffffff',
          fontSize: 15,
          textAlign: 'center',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {truncatedNarration}
        </div>

        <div style={{
          flex: '0 0 auto',
          color: '#6b7280',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          minWidth: 60,
          textAlign: 'right',
        }}>
          {sceneIndex + 1} / {sceneCount}
        </div>
      </div>
    </AbsoluteFill>
  );
};
