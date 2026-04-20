import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { FlowScene } from '../types';

const COLORS = {
  bg: '#0d1117',
  defaultBox: '#1e3a5f',
  border: '#4a9eff',
  arrow: '#ffffff',
  title: '#ffffff',
  text: '#e0e0e0',
};

const STAGGER = 12;

interface Props extends FlowScene {
  frame?: number;
  fps?: number;
}

export const FlowDiagram: React.FC<Props> = ({ steps = [], title, frame: frameProp, fps: fpsProp }) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: COLORS.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: '40px 60px', boxSizing: 'border-box',
    }}>
      <div style={{
        fontSize: 28, fontWeight: 700, color: COLORS.title,
        marginBottom: 48, opacity: titleOpacity, letterSpacing: 1,
      }}>
        {title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
        {steps.map((step, i) => {
          const startFrame = i * STAGGER;
          const progress = spring({ frame: frame - startFrame, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
          const tx = interpolate(progress, [0, 1], [-60, 0]);
          const opacity = interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const isCurrent = frame >= startFrame + STAGGER * 0.5 && (i === steps.length - 1 || frame < (i + 1) * STAGGER + STAGGER * 0.5);
          const boxColor = step.color ?? COLORS.defaultBox;

          return (
            <React.Fragment key={i}>
              <div style={{
                transform: `translateX(${tx}px)`,
                opacity,
                display: 'flex',
                alignItems: 'center',
              }}>
                <div style={{
                  padding: '14px 24px',
                  borderRadius: 10,
                  background: boxColor,
                  border: `2px solid ${isCurrent ? '#FFD700' : COLORS.border}`,
                  boxShadow: isCurrent
                    ? '0 0 18px 4px rgba(74,158,255,0.6)'
                    : '0 0 6px rgba(74,158,255,0.2)',
                  color: COLORS.text,
                  fontSize: 16,
                  fontWeight: 600,
                  minWidth: 120,
                  textAlign: 'center',
                  transition: 'box-shadow 0.2s',
                  whiteSpace: 'nowrap',
                }}>
                  {step.label}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  color: COLORS.arrow, fontSize: 28, margin: '0 12px',
                  opacity: interpolate(frame, [startFrame + STAGGER, startFrame + STAGGER + 6], [0, 1], { extrapolateRight: 'clamp' }),
                }}>
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
