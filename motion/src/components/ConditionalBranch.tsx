import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { ConditionalBranchScene } from '../types';

interface Props extends ConditionalBranchScene {
  frame?: number;
  fps?: number;
}

export const ConditionalBranch: React.FC<Props> = ({
  condition = '?', truePath = [], falsePath = [], trueLabel, falseLabel, result,
  frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const DIAMOND_W = 160;
  const DIAMOND_H = 70;
  const dashLen = 320;

  const diamondP = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const diamondScale = interpolate(diamondP, [0, 1], [0.6, 1]);
  const diamondOp = interpolate(diamondP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const forkP = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: 'clamp' });

  const maxLen = Math.max(truePath.length, falsePath.length);
  const resultStart = 40 + maxLen * 12;
  const resultP = spring({ frame: frame - resultStart, fps, config: { damping: 14, stiffness: 120 } });
  const resultOp = interpolate(resultP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '24px 40px', boxSizing: 'border-box', gap: 12,
    }}>
      {/* Diamond */}
      <div style={{ transform: `scale(${diamondScale})`, opacity: diamondOp }}>
        <svg width={DIAMOND_W} height={DIAMOND_H} viewBox={`0 0 ${DIAMOND_W} ${DIAMOND_H}`}>
          <polygon
            points={`${DIAMOND_W / 2},4 ${DIAMOND_W - 4},${DIAMOND_H / 2} ${DIAMOND_W / 2},${DIAMOND_H - 4} 4,${DIAMOND_H / 2}`}
            fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth={2}
          />
          <text x={DIAMOND_W / 2} y={DIAMOND_H / 2 + 5} textAnchor="middle"
            fill="#f59e0b" fontSize={11} fontWeight={700} fontFamily="inherit">
            {condition.length > 18 ? condition.slice(0, 16) + '…' : condition}
          </text>
        </svg>
      </div>

      {/* Fork lines */}
      <svg width={340} height={40} viewBox="0 0 340 40" style={{ flexShrink: 0 }}>
        {/* Left line (false) */}
        <line x1={170} y1={0} x2={40} y2={40}
          stroke="#4a9eff" strokeWidth={2}
          strokeDasharray={dashLen}
          strokeDashoffset={dashLen * (1 - forkP)}
        />
        {/* Right line (true) */}
        <line x1={170} y1={0} x2={300} y2={40}
          stroke="#22c55e" strokeWidth={2}
          strokeDasharray={dashLen}
          strokeDashoffset={dashLen * (1 - forkP)}
        />
        <text x={80} y={36} fill="#4a9eff" fontSize={11} fontWeight={700} fontFamily="inherit" opacity={forkP}>
          {falseLabel ?? 'false'}
        </text>
        <text x={270} y={36} fill="#22c55e" fontSize={11} fontWeight={700} fontFamily="inherit" opacity={forkP}>
          {trueLabel ?? 'true'}
        </text>
      </svg>

      {/* Two columns */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        {/* False (left) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
          {falsePath.map((step, i) => {
            const p = spring({ frame: frame - (24 + i * 12), fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={i} style={{
                transform: `translateX(${interpolate(p, [0, 1], [-30, 0])}px)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                padding: '8px 14px', borderRadius: 6,
                background: 'rgba(74,158,255,0.08)', border: '1px solid #4a9eff',
                color: '#e0e0e0', fontSize: 13, textAlign: 'center',
              }}>
                {step}
              </div>
            );
          })}
        </div>

        {/* True (right) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
          {truePath.map((step, i) => {
            const p = spring({ frame: frame - (24 + i * 12), fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={i} style={{
                transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                padding: '8px 14px', borderRadius: 6,
                background: 'rgba(34,197,94,0.08)', border: '1px solid #22c55e',
                color: '#e0e0e0', fontSize: 13, textAlign: 'center',
              }}>
                {step}
              </div>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={{
          opacity: resultOp,
          background: 'rgba(245,158,11,0.12)', border: '2px solid #f59e0b',
          borderRadius: 10, padding: '10px 24px',
          color: '#f59e0b', fontSize: 15, fontWeight: 700,
        }}>
          {result}
        </div>
      )}
    </div>
  );
};
