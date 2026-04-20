import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { LoopScene } from '../types';

const COLORS = {
  bg: '#0d1117',
  title: '#ffffff',
  iterates: '#9ca3af',
  counter: '#22c55e',
  step: '#1e3a5f',
  stepBorder: '#4a9eff',
  stepText: '#e0e0e0',
  arrow: '#FFD700',
};

const STAGGER = 12;

interface Props extends LoopScene {
  frame?: number;
  fps?: number;
}

export const LoopDiagram: React.FC<Props> = ({ title, iterates = '', body = [], frame: frameProp, fps: fpsProp }) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const iteratesOpacity = interpolate(frame, [5, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Spinning arrow rotation
  const rotation = interpolate(frame, [0, fps * 100], [0, 36000], { extrapolateRight: 'clamp' });

  // Counter — ticks up based on frame
  const counterMax = body.length;
  const counterFrame = Math.min(Math.floor(frame / 10), counterMax);

  return (
    <div style={{
      width: '100%', height: '100%', background: COLORS.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: '40px 80px', boxSizing: 'border-box',
    }}>
      {/* Title */}
      <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.title, opacity: titleOpacity, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 16, color: COLORS.iterates, opacity: iteratesOpacity, marginBottom: 40 }}>
        Iterating over: <span style={{ color: COLORS.counter }}>{iterates}</span>
      </div>

      <div style={{ display: 'flex', gap: 80, alignItems: 'center' }}>
        {/* Spinning arrow + counter */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontSize: 72, color: COLORS.arrow,
            transform: `rotate(${rotation}deg)`,
            display: 'inline-block',
            lineHeight: 1,
          }}>
            ↻
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.counter }}>
            {counterFrame}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>iterations</div>
        </div>

        {/* Loop body steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 260 }}>
          {body.map((step, i) => {
            const startFrame = 15 + i * STAGGER;
            const progress = spring({ frame: frame - startFrame, fps, config: { damping: 14, stiffness: 120 } });
            const tx = interpolate(progress, [0, 1], [40, 0]);
            const opacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={i} style={{
                transform: `translateX(${tx}px)`,
                opacity,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: COLORS.counter, flexShrink: 0,
                }} />
                <div style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  background: COLORS.step,
                  border: `1px solid ${COLORS.stepBorder}`,
                  color: COLORS.stepText,
                  fontSize: 14,
                  flex: 1,
                }}>
                  {step}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
