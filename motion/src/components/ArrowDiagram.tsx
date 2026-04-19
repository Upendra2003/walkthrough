import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { ArrowScene } from '../types';

const COLORS = {
  bg: '#0d1117',
  from: '#1a3a2a',
  to: '#3a1a2a',
  fromBorder: '#22c55e',
  toBorder: '#FF4444',
  arrow: '#FFD700',
  returnArrow: '#a78bfa',
  label: '#ffffff',
};

interface Props extends ArrowScene {
  frame?: number;
  fps?: number;
}

export const ArrowDiagram: React.FC<Props> = ({
  from, to, label, returnLabel, frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const fromProgress = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const toProgress = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 100 } });

  const fromX = interpolate(fromProgress, [0, 1], [-200, 0]);
  const toX = interpolate(toProgress, [0, 1], [200, 0]);

  // Arrow: draws from left box right edge to right box left edge
  // We'll use SVG viewBox covering the gap
  const arrowProgress = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [30, 40], [0, 1], { extrapolateRight: 'clamp' });

  const returnStart = 45;
  const returnProgress = interpolate(frame, [returnStart, returnStart + 15], [0, 1], { extrapolateRight: 'clamp' });
  const returnLabelOpacity = interpolate(frame, [returnStart + 15, returnStart + 25], [0, 1], { extrapolateRight: 'clamp' });

  const ARROW_W = 300;
  const ARROW_H = 60;
  const dashLen = ARROW_W;

  return (
    <div style={{
      width: '100%', height: '100%', background: COLORS.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    }}>
      {/* From box */}
      <div style={{
        transform: `translateX(${fromX}px)`,
        padding: '22px 32px',
        borderRadius: 12,
        background: COLORS.from,
        border: `2px solid ${COLORS.fromBorder}`,
        boxShadow: '0 0 16px rgba(34,197,94,0.3)',
        color: '#fff',
        fontSize: 20,
        fontWeight: 700,
        minWidth: 160,
        textAlign: 'center',
      }}>
        {from}
      </div>

      {/* Arrow SVG area */}
      <div style={{ position: 'relative', width: ARROW_W, flexShrink: 0 }}>
        {/* Label above arrow */}
        <div style={{
          position: 'absolute', top: -34, left: 0, right: 0,
          textAlign: 'center', color: COLORS.arrow, fontSize: 14,
          fontWeight: 600, opacity: labelOpacity,
        }}>
          {label}
        </div>

        <svg width={ARROW_W} height={ARROW_H} viewBox={`0 0 ${ARROW_W} ${ARROW_H}`}>
          {/* Forward arrow */}
          <line
            x1={0} y1={20} x2={ARROW_W - 12} y2={20}
            stroke={COLORS.arrow} strokeWidth={3}
            strokeDasharray={dashLen}
            strokeDashoffset={dashLen * (1 - arrowProgress)}
          />
          <polygon
            points={`${ARROW_W - 12},13 ${ARROW_W},20 ${ARROW_W - 12},27`}
            fill={COLORS.arrow}
            opacity={arrowProgress}
          />

          {/* Return arrow (dashed) */}
          {returnLabel && (
            <>
              <line
                x1={ARROW_W} y1={40} x2={12} y2={40}
                stroke={COLORS.returnArrow} strokeWidth={2}
                strokeDasharray="8 5"
                strokeDashoffset={dashLen * (1 - returnProgress)}
                opacity={returnProgress}
              />
              <polygon
                points={`12,33 0,40 12,47`}
                fill={COLORS.returnArrow}
                opacity={returnProgress}
              />
            </>
          )}
        </svg>

        {/* Return label below */}
        {returnLabel && (
          <div style={{
            position: 'absolute', bottom: -8, left: 0, right: 0,
            textAlign: 'center', color: COLORS.returnArrow, fontSize: 13,
            opacity: returnLabelOpacity,
          }}>
            {returnLabel}
          </div>
        )}
      </div>

      {/* To box */}
      <div style={{
        transform: `translateX(${toX}px)`,
        padding: '22px 32px',
        borderRadius: 12,
        background: COLORS.to,
        border: `2px solid ${COLORS.toBorder}`,
        boxShadow: '0 0 16px rgba(255,68,68,0.3)',
        color: '#fff',
        fontSize: 20,
        fontWeight: 700,
        minWidth: 160,
        textAlign: 'center',
      }}>
        {to}
      </div>
    </div>
  );
};
