import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { BoxScene } from '../types';

const COLORS = {
  bg: '#0d1117',
  titleBar: '#1a1a2e',
  titleText: '#FF4444',
  border: '#333',
  label: '#9ca3af',
  value: '#FFD700',
  highlightValue: '#22c55e',
  highlightBg: 'rgba(34,197,94,0.08)',
  rowBg: '#111827',
};

const STAGGER = 8;

interface Props extends BoxScene {
  frame?: number;
  fps?: number;
}

export const BoxDiagram: React.FC<Props> = ({ title, items = [], frame: frameProp, fps: fpsProp }) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const containerProgress = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const containerOpacity = interpolate(containerProgress, [0, 1], [0, 1]);

  return (
    <div style={{
      width: '100%', height: '100%', background: COLORS.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    }}>
      <div style={{
        width: 560,
        opacity: containerOpacity,
        borderRadius: 10,
        overflow: 'hidden',
        border: `1px solid ${COLORS.border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Title bar */}
        <div style={{
          background: COLORS.titleBar,
          padding: '12px 20px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840' }} />
          <span style={{ marginLeft: 12, color: COLORS.titleText, fontSize: 14, fontWeight: 700 }}>
            {title}
          </span>
        </div>

        {/* Rows */}
        {items.map((item, i) => {
          const startFrame = 5 + i * STAGGER;
          const progress = spring({ frame: frame - startFrame, fps, config: { damping: 14, stiffness: 140 } });
          const ty = interpolate(progress, [0, 1], [20, 0]);
          const opacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

          return (
            <div key={i} style={{
              transform: `translateY(${ty}px)`,
              opacity,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '13px 20px',
              background: item.highlight ? COLORS.highlightBg : COLORS.rowBg,
              borderBottom: i < items.length - 1 ? `1px solid ${COLORS.border}` : 'none',
              boxShadow: item.highlight ? 'inset 0 0 0 1px rgba(34,197,94,0.3)' : 'none',
            }}>
              <span style={{ color: COLORS.label, fontSize: 14 }}>{item.label}</span>
              {item.value !== undefined && (
                <span style={{
                  color: item.highlight ? COLORS.highlightValue : COLORS.value,
                  fontSize: 14,
                  fontWeight: item.highlight ? 700 : 400,
                  maxWidth: 280,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
