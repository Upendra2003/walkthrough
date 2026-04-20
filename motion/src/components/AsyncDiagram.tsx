import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { AsyncScene } from '../types';

const COLORS = {
  bg: '#0d1117',
  axis: '#ffffff',
  await: '#FFD700',
  normal: '#4a9eff',
  duration: '#6b7280',
  text: '#e0e0e0',
  title: '#ffffff',
};

const STAGGER = 20;

interface Props extends AsyncScene {
  frame?: number;
  fps?: number;
}

export const AsyncDiagram: React.FC<Props> = ({ title, steps = [], frame: frameProp, fps: fpsProp }) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const axisProgress = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp' });

  const totalHeight = steps.length * 72;

  return (
    <div style={{
      width: '100%', height: '100%', background: COLORS.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: '40px 80px', boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.title, opacity: titleOpacity, marginBottom: 40 }}>
        {title}
      </div>

      <div style={{ position: 'relative', width: 520 }}>
        {/* Vertical time axis */}
        <svg
          width={40} height={totalHeight + 20}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <line
            x1={20} y1={0} x2={20} y2={(totalHeight + 20) * axisProgress}
            stroke={COLORS.axis} strokeWidth={2}
          />
        </svg>

        {/* Steps */}
        <div style={{ paddingLeft: 60, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {steps.map((step, i) => {
            const startFrame = 15 + i * STAGGER;
            const progress = spring({ frame: frame - startFrame, fps, config: { damping: 14, stiffness: 100 } });
            const dotScale = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: 'clamp' });
            const labelX = interpolate(progress, [0, 1], [30, 0]);
            const opacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

            const dotSize = step.isAwait ? 14 : 10;
            const dotColor = step.isAwait ? COLORS.await : COLORS.normal;

            return (
              <div key={i} style={{
                height: 72, display: 'flex', alignItems: 'center',
                position: 'relative',
              }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute',
                  left: -52,
                  width: dotSize,
                  height: dotSize,
                  borderRadius: '50%',
                  background: dotColor,
                  transform: `scale(${dotScale})`,
                  boxShadow: step.isAwait ? `0 0 12px ${COLORS.await}` : 'none',
                  marginLeft: (14 - dotSize) / 2,
                }} />

                {/* Label + duration */}
                <div style={{
                  transform: `translateX(${labelX}px)`,
                  opacity,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  <span style={{
                    color: COLORS.text,
                    fontSize: step.isAwait ? 16 : 14,
                    fontWeight: step.isAwait ? 700 : 400,
                  }}>
                    {step.isAwait && (
                      <span style={{ color: COLORS.await, marginRight: 8 }}>await</span>
                    )}
                    {step.label}
                  </span>
                  <span style={{
                    color: COLORS.duration, fontSize: 12,
                    transform: `translateX(${interpolate(progress, [0, 1], [20, 0])}px)`,
                  }}>
                    {step.duration}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
