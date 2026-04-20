import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { StatsCounterScene } from '../types';

interface Props extends StatsCounterScene {
  frame?: number;
  fps?: number;
}

export const StatsCounter: React.FC<Props> = ({
  title, stats = [], frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 48px', boxSizing: 'border-box', gap: 20,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: stats.length === 1 ? '1fr' : 'repeat(2, 1fr)',
        gap: 16,
        width: '100%', maxWidth: 520,
      }}>
        {stats.map((stat, i) => {
          const cardStart = i * 10 + 8;
          const cardP = spring({ frame: frame - cardStart, fps, config: { damping: 12, stiffness: 120 } });
          const cardScale = interpolate(cardP, [0, 1], [0.8, 1]);
          const cardOp = interpolate(cardP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

          // Count-up: over 60 frames with easeOut
          const countFrame = Math.max(0, frame - cardStart);
          const countP = interpolate(countFrame, [0, 60], [0, 1], { extrapolateRight: 'clamp' });
          // easeOut: 1 - (1 - t)^2
          const eased = 1 - Math.pow(1 - countP, 2);
          const displayVal = Math.round(eased * stat.value);

          const color = stat.color ?? (stat.good ? '#22c55e' : stat.good === false ? '#FF4444' : '#4a9eff');
          const borderColor = `${color}44`;

          return (
            <div key={i} style={{
              transform: `scale(${cardScale})`, opacity: cardOp,
              border: `2px solid ${borderColor}`,
              borderRadius: 12,
              background: `${color}08`,
              padding: '20px 16px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 6,
            }}>
              {/* Arrow icon */}
              {stat.good !== undefined && (
                <div style={{ fontSize: 18, color }}>
                  {stat.good ? '↑' : '↓'}
                </div>
              )}

              {/* Value */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{
                  fontSize: 38, fontWeight: 800, color,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {displayVal.toLocaleString()}
                </span>
                <span style={{ color, fontSize: 16, fontWeight: 600 }}>{stat.unit}</span>
              </div>

              {/* Label */}
              <div style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
