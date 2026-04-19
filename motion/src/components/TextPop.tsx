import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { TextPopScene } from '../types';

interface Props extends TextPopScene {
  frame?: number;
  fps?: number;
}

export const TextPop: React.FC<Props> = ({ headline, subtext, emoji, frame: frameProp, fps: fpsProp }) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const emojiProgress = spring({ frame, fps, config: { damping: 8, stiffness: 180, mass: 0.7 } });
  const emojiScale = interpolate(emojiProgress, [0, 0.6, 1], [0, 1.2, 1], { extrapolateRight: 'clamp' });

  const headlineProgress = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 120 } });
  const headlineY = interpolate(headlineProgress, [0, 1], [30, 0]);
  const headlineOpacity = interpolate(headlineProgress, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

  const subtextOpacity = interpolate(frame, [18, 28], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0d1117 70%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      gap: 20,
    }}>
      {emoji && (
        <div style={{
          fontSize: 72,
          transform: `scale(${emojiScale})`,
          lineHeight: 1,
          marginBottom: 8,
        }}>
          {emoji}
        </div>
      )}

      <div style={{
        fontSize: 52,
        fontWeight: 800,
        color: '#ffffff',
        transform: `translateY(${headlineY}px)`,
        opacity: headlineOpacity,
        textAlign: 'center',
        maxWidth: 900,
        lineHeight: 1.2,
        letterSpacing: -1,
      }}>
        {headline}
      </div>

      <div style={{
        fontSize: 24,
        color: 'rgba(255,255,255,0.7)',
        opacity: subtextOpacity,
        textAlign: 'center',
        maxWidth: 700,
        lineHeight: 1.5,
      }}>
        {subtext}
      </div>
    </div>
  );
};
