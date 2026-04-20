import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { StackVisualizerScene } from '../types';

interface Props extends StackVisualizerScene {
  frame?: number;
  fps?: number;
}

export const StackVisualizer: React.FC<Props> = ({
  title, items = [], activeIndex, frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const depthOp = interpolate(frame, [8, 18], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '32px 80px', boxSizing: 'border-box',
    }}>
      {/* Title + depth row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        width: '100%', maxWidth: 480, marginBottom: 24, opacity: titleOp,
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{title}</div>
        <div style={{ opacity: depthOp, color: '#6b7280', fontSize: 13, alignSelf: 'center' }}>
          depth: {items.length}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
        {/* Rotated label */}
        <div style={{
          color: '#6b7280', fontSize: 11, fontWeight: 700, letterSpacing: 3,
          transform: 'rotate(-90deg)', whiteSpace: 'nowrap',
          opacity: titleOp, marginRight: -8,
        }}>
          CALL STACK
        </div>

        {/* Stack items — bottom to top rendered top to bottom in reversed order */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 320 }}>
          {[...items].reverse().map((item, revI) => {
            const i = items.length - 1 - revI;
            const p = spring({ frame: frame - i * 10, fps, config: { damping: 12, stiffness: 130, mass: 0.8 } });
            const ty = interpolate(p, [0, 1], [-36, 0]);
            const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
            const isActive = activeIndex === i;

            return (
              <div key={i} style={{
                transform: `translateY(${ty}px)`, opacity: op,
                padding: '13px 20px',
                border: `2px solid ${isActive ? '#FFD700' : '#2a3a5a'}`,
                borderLeft: `4px solid ${isActive ? '#FFD700' : '#2a3a5a'}`,
                borderRadius: 6, background: isActive ? 'rgba(255,215,0,0.08)' : '#111',
                boxShadow: isActive ? '0 0 16px 3px rgba(255,215,0,0.35)' : 'none',
                color: isActive ? '#FFD700' : '#e0e0e0',
                fontSize: 14, fontWeight: isActive ? 700 : 400,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{item}</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>frame {i}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
