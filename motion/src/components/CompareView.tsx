import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { CompareViewScene } from '../types';

interface Props extends CompareViewScene {
  frame?: number;
  fps?: number;
}

export const CompareView: React.FC<Props> = ({
  title, leftLabel = 'Before', rightLabel = 'After', leftItems = [], rightItems = [],
  leftColor, rightColor, frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const lColor = leftColor ?? '#FF4444';
  const rColor = rightColor ?? '#22c55e';

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  // Divider draws top to bottom
  const dividerH = interpolate(frame, [6, 28], [0, 1], { extrapolateRight: 'clamp' });

  const leftP = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 110 } });
  const leftX = interpolate(leftP, [0, 1], [-60, 0]);
  const leftOp = interpolate(leftP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const rightP = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 110 } });
  const rightX = interpolate(rightP, [0, 1], [60, 0]);
  const rightOp = interpolate(rightP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const maxLen = Math.max(leftItems.length, rightItems.length);
  const badgeOp = interpolate(frame, [maxLen * 10 + 24, maxLen * 10 + 34], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 40px', boxSizing: 'border-box', gap: 16,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, minWidth: 560 }}>
        {/* Left panel */}
        <div style={{
          flex: 1, transform: `translateX(${leftX}px)`, opacity: leftOp,
          border: `2px solid ${lColor}33`, borderRight: 'none',
          borderRadius: '10px 0 0 10px', padding: '16px 20px',
          background: `${lColor}08`,
        }}>
          <div style={{ color: lColor, fontSize: 14, fontWeight: 700, marginBottom: 14, letterSpacing: 1 }}>
            {leftLabel}
          </div>
          {leftItems.map((item, i) => {
            const p = spring({ frame: frame - (i * 10 + 14), fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={i} style={{
                transform: `translateX(${interpolate(p, [0, 1], [-18, 0])}px)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                padding: '7px 12px', marginBottom: 6,
                background: '#111', borderRadius: 6,
                borderLeft: `3px solid ${lColor}`,
                color: '#e0e0e0', fontSize: 13,
              }}>
                {item}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{
          width: 3, background: '#333', position: 'relative', flexShrink: 0,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: `${dividerH * 100}%`,
            background: 'linear-gradient(to bottom, #4a9eff, #22c55e)',
          }} />
        </div>

        {/* Right panel */}
        <div style={{
          flex: 1, transform: `translateX(${rightX}px)`, opacity: rightOp,
          border: `2px solid ${rColor}33`, borderLeft: 'none',
          borderRadius: '0 10px 10px 0', padding: '16px 20px',
          background: `${rColor}08`,
        }}>
          <div style={{ color: rColor, fontSize: 14, fontWeight: 700, marginBottom: 14, letterSpacing: 1 }}>
            {rightLabel}
          </div>
          {rightItems.map((item, i) => {
            const p = spring({ frame: frame - (i * 10 + 14), fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={i} style={{
                transform: `translateX(${interpolate(p, [0, 1], [18, 0])}px)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                padding: '7px 12px', marginBottom: 6,
                background: '#111', borderRadius: 6,
                borderLeft: `3px solid ${rColor}`,
                color: '#e0e0e0', fontSize: 13,
              }}>
                {item}
              </div>
            );
          })}
        </div>
      </div>

      {/* Improvement badge */}
      <div style={{ opacity: badgeOp }}>
        <span style={{
          background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e',
          borderRadius: 16, padding: '5px 18px',
          color: '#22c55e', fontSize: 13, fontWeight: 700,
        }}>
          {rightLabel} wins ✓
        </span>
      </div>
    </div>
  );
};
