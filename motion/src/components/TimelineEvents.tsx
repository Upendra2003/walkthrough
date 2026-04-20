import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { TimelineEventsScene } from '../types';

interface Props extends TimelineEventsScene {
  frame?: number;
  fps?: number;
}

export const TimelineEvents: React.FC<Props> = ({
  title, events = [], frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const N = events.length;
  const SVG_W = 700;
  const SVG_H = 260;
  const LINE_Y = SVG_H / 2;
  const MARGIN = 60;
  const STEP = N > 1 ? (SVG_W - MARGIN * 2) / (N - 1) : 0;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  // Horizontal line draws progressively
  const lastDotFrame = (N - 1) * 14 + 8;
  const lineP = interpolate(frame, [4, lastDotFrame + 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '24px 40px', boxSizing: 'border-box', gap: 12,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
        {/* Base timeline line */}
        <line
          x1={MARGIN} y1={LINE_Y} x2={MARGIN + (SVG_W - MARGIN * 2) * lineP} y2={LINE_Y}
          stroke="#2a3a5a" strokeWidth={3}
        />

        {events.map((evt, i) => {
          const x = N === 1 ? SVG_W / 2 : MARGIN + i * STEP;
          const dotStart = i * 14 + 8;
          const p = spring({ frame: frame - dotStart, fps, config: { damping: 12, stiffness: 150, mass: 0.6 } });
          const dotOp = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const dotScale = interpolate(p, [0, 1], [0.3, 1]);

          // Alternate label above/below
          const goUp = i % 2 === 0;
          const lineLen = 55;
          const labelY = goUp ? LINE_Y - lineLen - 16 : LINE_Y + lineLen + 16;
          const lineY2 = goUp ? LINE_Y - lineLen : LINE_Y + lineLen;
          const lineP2 = interpolate(frame, [dotStart + 6, dotStart + 18], [0, 1], { extrapolateRight: 'clamp' });

          const isLast = i === N - 1;
          const color = evt.color ?? (isLast ? '#FFD700' : '#4a9eff');

          const pulse = isLast
            ? interpolate(frame % 36, [0, 18, 36], [1, 1.35, 1], { extrapolateRight: 'clamp' })
            : 1;

          return (
            <g key={i}>
              {/* Vertical line */}
              <line
                x1={x} y1={LINE_Y}
                x2={x} y2={LINE_Y + (goUp ? -lineLen : lineLen) * lineP2}
                stroke={color} strokeWidth={1.5} opacity={0.7 * dotOp}
              />

              {/* Dot */}
              <circle
                cx={x} cy={LINE_Y}
                r={8 * dotScale * pulse}
                fill={color}
                opacity={dotOp}
              />
              {isLast && (
                <circle cx={x} cy={LINE_Y} r={14 * pulse} fill={color} opacity={dotOp * 0.2} />
              )}

              {/* Label */}
              <text
                x={x} y={labelY}
                textAnchor="middle" fill="#e0e0e0" fontSize={14} fontWeight={700}
                fontFamily="inherit"
                opacity={lineP2 * dotOp}
              >
                {evt.label.length > 16 ? evt.label.slice(0, 14) + '…' : evt.label}
              </text>

              {/* Time */}
              <text
                x={x} y={LINE_Y + (goUp ? 22 : -10)}
                textAnchor="middle" fill="#6b7280" fontSize={12}
                fontFamily="'JetBrains Mono','Fira Code',monospace"
                opacity={dotOp}
              >
                {evt.time}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
