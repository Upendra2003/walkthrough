import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { EventEmitterScene } from '../types';

interface Props extends EventEmitterScene {
  frame?: number;
  fps?: number;
}

export const EventEmitter: React.FC<Props> = ({
  eventName = 'event', emitterLabel = 'Emitter', listeners = [], frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const CX = 540 / 2;
  const CY = 280 / 2;
  const RADIUS = 130;
  const N = listeners.length;
  const SVG_W = 540;
  const SVG_H = 280;

  const emitterP = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const emitterScale = interpolate(emitterP, [0, 1], [0.5, 1]);
  const emitterOp = interpolate(emitterP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const pulse = interpolate(
    frame % 40,
    [0, 20, 40],
    [1, 1.12, 1],
    { extrapolateRight: 'clamp' },
  );

  const labelOp = interpolate(frame, [N * 12 + 20, N * 12 + 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      padding: '24px', boxSizing: 'border-box', gap: 12,
    }}>
      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
        {listeners.map((listener, i) => {
          const angle = (2 * Math.PI * i) / N - Math.PI / 2;
          const lx = CX + RADIUS * Math.cos(angle);
          const ly = CY + RADIUS * Math.sin(angle);
          const dashLen = Math.sqrt((lx - CX) ** 2 + (ly - CY) ** 2);

          const lineStart = i * 12 + 14;
          const lineP = interpolate(frame, [lineStart, lineStart + 18], [0, 1], { extrapolateRight: 'clamp' });

          const dotStart = lineStart + 16;
          const dotFrac = interpolate(frame, [dotStart, dotStart + 20], [0, 1], { extrapolateRight: 'clamp' });
          const dotX = CX + dotFrac * (lx - CX);
          const dotY = CY + dotFrac * (ly - CY);
          const dotArrived = frame >= dotStart + 20;

          const nodeP = spring({ frame: frame - lineStart - 16, fps, config: { damping: 14, stiffness: 120 } });
          const nodeOp = interpolate(nodeP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const nodeScale = interpolate(nodeP, [0, 1], [0.5, 1]);
          const flashOp = dotArrived ? interpolate(frame, [dotStart + 20, dotStart + 30], [1, 0], { extrapolateRight: 'clamp' }) : 0;

          return (
            <g key={i}>
              {/* Line */}
              <line
                x1={CX} y1={CY} x2={lx} y2={ly}
                stroke="#4a9eff" strokeWidth={1.5}
                strokeDasharray={dashLen}
                strokeDashoffset={dashLen * (1 - lineP)}
                opacity={0.6}
              />
              {/* Traveling dot */}
              {dotFrac > 0 && dotFrac < 1 && (
                <circle cx={dotX} cy={dotY} r={5} fill="#FFD700" />
              )}
              {/* Listener box */}
              <g transform={`translate(${lx},${ly}) scale(${nodeScale})`} opacity={nodeOp}>
                <rect x={-44} y={-18} width={88} height={36} rx={6}
                  fill="#111" stroke="#4a9eff" strokeWidth={1.5}
                />
                {flashOp > 0 && (
                  <rect x={-44} y={-18} width={88} height={36} rx={6}
                    fill="#FFD700" opacity={flashOp * 0.4}
                  />
                )}
                <text x={0} y={5} textAnchor="middle" fill="#e0e0e0" fontSize={11} fontWeight={600} fontFamily="inherit">
                  {listener.length > 12 ? listener.slice(0, 10) + '…' : listener}
                </text>
              </g>
            </g>
          );
        })}

        {/* Emitter center */}
        <g transform={`translate(${CX},${CY}) scale(${emitterScale * pulse})`} opacity={emitterOp}>
          <circle r={38} fill="rgba(255,215,0,0.12)" stroke="#FFD700" strokeWidth={2} />
          <text x={0} y={-8} textAnchor="middle" fill="#FFD700" fontSize={11} fontWeight={700} fontFamily="inherit">
            {emitterLabel.length > 12 ? emitterLabel.slice(0, 10) + '…' : emitterLabel}
          </text>
          <text x={0} y={8} textAnchor="middle" fill="#f59e0b" fontSize={9} fontFamily="inherit">
            emit()
          </text>
        </g>

        {/* Event badge */}
        <g opacity={emitterOp}>
          <rect x={CX - 54} y={CY - 64} width={108} height={22} rx={11}
            fill="#FF4444" opacity={0.9}
          />
          <text x={CX} y={CY - 49} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700} fontFamily="inherit">
            {eventName}
          </text>
        </g>
      </svg>

      <div style={{ opacity: labelOp, color: '#9ca3af', fontSize: 13 }}>
        Event fired to <span style={{ color: '#FFD700', fontWeight: 700 }}>{N}</span> listeners
      </div>
    </div>
  );
};
