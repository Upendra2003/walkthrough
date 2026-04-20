import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { ErrorFlowScene } from '../types';

interface Props extends ErrorFlowScene {
  frame?: number;
  fps?: number;
}

export const ErrorFlow: React.FC<Props> = ({
  title, trySteps = [], errorType = 'Error', catchAction = '', frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  const boltStart = trySteps.length * 12 + 8;
  const boltProgress = spring({ frame: frame - boltStart, fps, config: { damping: 12, stiffness: 180, mass: 0.6 } });
  const boltX = interpolate(boltProgress, [0, 1], [-80, 0]);
  const boltOp = interpolate(boltProgress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const catchStart = boltStart + 14;
  const catchProgress = spring({ frame: frame - catchStart, fps, config: { damping: 14, stiffness: 120 } });
  const catchX = interpolate(catchProgress, [0, 1], [80, 0]);
  const catchOp = interpolate(catchProgress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const doneStart = catchStart + 18;
  const doneOp = interpolate(frame, [doneStart, doneStart + 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '32px 48px', boxSizing: 'border-box', gap: 24,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', opacity: titleOp, letterSpacing: 1 }}>
        {title}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28 }}>
        {/* TRY block */}
        <div style={{
          border: '2px solid #22c55e', borderRadius: 10,
          padding: '16px 20px', minWidth: 220,
          background: 'rgba(34,197,94,0.06)',
        }}>
          <div style={{ color: '#22c55e', fontSize: 13, fontWeight: 700, marginBottom: 12, letterSpacing: 2 }}>
            TRY
          </div>
          {trySteps.map((step, i) => {
            const p = spring({ frame: frame - i * 12, fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={i} style={{
                transform: `translateY(${interpolate(p, [0, 1], [20, 0])}px)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                padding: '8px 14px', marginBottom: 8,
                background: '#1a3a2a', borderRadius: 6,
                color: '#e0e0e0', fontSize: 14,
                borderLeft: '3px solid #22c55e',
              }}>
                {step}
              </div>
            );
          })}
        </div>

        {/* Lightning bolt */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6, paddingTop: 48,
          transform: `translateX(${boltX}px)`, opacity: boltOp,
        }}>
          <svg width={48} height={72} viewBox="0 0 48 72">
            <polygon points="28,0 12,36 22,36 18,72 38,28 26,28" fill="#FF4444" />
          </svg>
          <div style={{
            background: '#FF4444', color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 12, whiteSpace: 'nowrap',
          }}>
            {errorType}
          </div>
        </div>

        {/* CATCH block */}
        <div style={{
          border: '2px solid #FF4444', borderRadius: 10,
          padding: '16px 20px', minWidth: 220,
          background: 'rgba(255,68,68,0.06)',
          transform: `translateX(${catchX}px)`, opacity: catchOp,
        }}>
          <div style={{ color: '#FF4444', fontSize: 13, fontWeight: 700, marginBottom: 12, letterSpacing: 2 }}>
            CATCH
          </div>
          <div style={{
            padding: '10px 14px', background: '#3a1a1a', borderRadius: 6,
            color: '#e0e0e0', fontSize: 14, borderLeft: '3px solid #FF4444',
          }}>
            {catchAction}
          </div>
        </div>
      </div>

      <div style={{
        opacity: doneOp, fontSize: 16, fontWeight: 600,
        color: '#22c55e', letterSpacing: 1,
      }}>
        Error handled ✅
      </div>
    </div>
  );
};
