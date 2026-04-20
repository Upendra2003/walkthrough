import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { MiddlewareChainScene } from '../types';

interface Props extends MiddlewareChainScene {
  frame?: number;
  fps?: number;
}

export const MiddlewareChain: React.FC<Props> = ({
  title, request = '', middlewares = [], finalHandler = 'Handler', frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const reqP = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const reqOp = interpolate(reqP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const firstBlock = middlewares.findIndex(m => !m.passes);
  const allPass = firstBlock === -1;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 40px', boxSizing: 'border-box', gap: 20,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      {/* Request badge */}
      <div style={{
        opacity: reqOp,
        background: 'rgba(74,158,255,0.12)', border: '1px solid #4a9eff',
        borderRadius: 20, padding: '6px 18px',
        color: '#4a9eff', fontSize: 13, fontWeight: 700,
      }}>
        {request}
      </div>

      {/* Chain */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {middlewares.map((mw, i) => {
          const boxStart = i * 14 + 12;
          const p = spring({ frame: frame - boxStart, fps, config: { damping: 14, stiffness: 120 } });
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const ty = interpolate(p, [0, 1], [20, 0]);
          const blocked = !mw.passes;
          const borderColor = blocked ? '#FF4444' : '#22c55e';

          const arrowP = interpolate(frame, [boxStart + 10, boxStart + 20], [0, 1], { extrapolateRight: 'clamp' });

          return (
            <React.Fragment key={i}>
              <div style={{
                transform: `translateY(${ty}px)`, opacity: op,
                border: `2px solid ${borderColor}`,
                borderRadius: 8, padding: '12px 14px', minWidth: 110,
                background: `${borderColor}10`,
                textAlign: 'center',
              }}>
                <div style={{ color: borderColor, fontSize: 18, marginBottom: 4 }}>
                  {blocked ? '✗' : '✓'}
                </div>
                <div style={{ color: '#e0e0e0', fontSize: 12, fontWeight: 700 }}>{mw.name}</div>
                <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4 }}>{mw.action}</div>
              </div>

              {i < middlewares.length - 1 && (
                <svg width={32} height={20} viewBox="0 0 32 20" style={{ flexShrink: 0 }}>
                  <line x1={0} y1={10} x2={20} y2={10}
                    stroke={blocked ? '#FF4444' : '#4a9eff'} strokeWidth={2}
                    strokeDasharray={32}
                    strokeDashoffset={blocked ? 0 : 32 * (1 - arrowP)}
                  />
                  {!blocked && (
                    <polygon points="18,5 30,10 18,15" fill="#4a9eff" opacity={arrowP} />
                  )}
                  {blocked && (
                    <text x={12} y={8} fill="#FF4444" fontSize={10} fontFamily="inherit">✗</text>
                  )}
                </svg>
              )}
            </React.Fragment>
          );
        })}

        {/* Final arrow + handler */}
        {allPass && (() => {
          const handlerStart = middlewares.length * 14 + 12;
          const arrowP = interpolate(frame, [handlerStart, handlerStart + 14], [0, 1], { extrapolateRight: 'clamp' });
          const hp = spring({ frame: frame - handlerStart - 12, fps, config: { damping: 14, stiffness: 120 } });
          const hOp = interpolate(hp, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <>
              <svg width={32} height={20} viewBox="0 0 32 20" style={{ flexShrink: 0 }}>
                <line x1={0} y1={10} x2={20} y2={10}
                  stroke="#22c55e" strokeWidth={2}
                  strokeDasharray={32} strokeDashoffset={32 * (1 - arrowP)}
                />
                <polygon points="18,5 30,10 18,15" fill="#22c55e" opacity={arrowP} />
              </svg>
              <div style={{
                opacity: hOp, border: '2px solid #FFD700',
                borderRadius: 8, padding: '12px 14px', minWidth: 110,
                background: 'rgba(255,215,0,0.08)', textAlign: 'center',
              }}>
                <div style={{ color: '#FFD700', fontSize: 12, fontWeight: 700 }}>{finalHandler}</div>
                <div style={{ color: '#22c55e', fontSize: 10, marginTop: 4 }}>Response sent</div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
};
