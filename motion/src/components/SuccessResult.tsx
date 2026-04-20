import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { SuccessResultScene } from '../types';

interface Props extends SuccessResultScene {
  frame?: number;
  fps?: number;
}

export const SuccessResult: React.FC<Props> = ({
  title, returnType = 'Result', fields = [], executionTime, frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const DASH = 100;
  const checkP = interpolate(frame, [4, 28], [0, 1], { extrapolateRight: 'clamp' });
  const successP = spring({ frame: frame - 26, fps, config: { damping: 12, stiffness: 130 } });
  const successOp = interpolate(successP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const successScale = interpolate(successP, [0, 1], [0.7, 1]);

  const boxP = spring({ frame: frame - 38, fps, config: { damping: 14, stiffness: 110 } });
  const boxTy = interpolate(boxP, [0, 1], [30, 0]);
  const boxOp = interpolate(boxP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const timeOp = interpolate(frame, [50 + fields.length * 8, 60 + fields.length * 8], [0, 1], { extrapolateRight: 'clamp' });

  // Particle burst
  const PARTICLES = 6;
  const particleP = spring({ frame: frame - 24, fps, config: { damping: 8, stiffness: 200, mass: 0.5 } });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 60px', boxSizing: 'border-box', gap: 16,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }) }}>
        {title}
      </div>

      {/* Checkmark + particles */}
      <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={80} height={80} viewBox="0 0 80 80">
          <circle cx={40} cy={40} r={32} stroke="#22c55e" strokeWidth={3} fill="none" />
          <polyline
            points="22,40 35,54 58,26"
            stroke="#22c55e" strokeWidth={4} fill="none"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={DASH}
            strokeDashoffset={DASH * (1 - checkP)}
          />
        </svg>

        {/* Particles */}
        {Array.from({ length: PARTICLES }).map((_, i) => {
          const angle = (2 * Math.PI * i) / PARTICLES;
          const dist = interpolate(particleP, [0, 1], [0, 44]);
          const px = 40 + dist * Math.cos(angle);
          const py = 40 + dist * Math.sin(angle);
          const pOp = interpolate(particleP, [0.3, 1], [1, 0], { extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{
              position: 'absolute',
              left: px, top: py,
              width: 7, height: 7, borderRadius: '50%',
              background: '#22c55e',
              opacity: pOp,
              transform: 'translate(-50%,-50%)',
            }} />
          );
        })}
      </div>

      {/* Success text */}
      <div style={{
        transform: `scale(${successScale})`, opacity: successOp,
        color: '#22c55e', fontSize: 22, fontWeight: 800, letterSpacing: 2,
      }}>
        Success
      </div>

      {/* Return box */}
      <div style={{
        transform: `translateY(${boxTy}px)`, opacity: boxOp,
        border: '1px solid #22c55e33', borderRadius: 10, overflow: 'hidden',
        minWidth: 320,
      }}>
        <div style={{
          background: 'rgba(34,197,94,0.15)', padding: '8px 16px',
          color: '#22c55e', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #22c55e33',
        }}>
          {returnType}
        </div>
        {fields.map((f, i) => {
          const p = spring({ frame: frame - (42 + i * 8), fps, config: { damping: 14, stiffness: 120 } });
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '7px 16px',
              transform: `translateX(${interpolate(p, [0, 1], [-20, 0])}px)`,
              opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
              borderBottom: i < fields.length - 1 ? '1px solid #1a2a1a' : 'none',
            }}>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>{f.key}</span>
              <span style={{ color: '#22c55e', fontSize: 13 }}>{f.value}</span>
            </div>
          );
        })}
      </div>

      {executionTime && (
        <div style={{ opacity: timeOp, color: '#6b7280', fontSize: 12 }}>
          ⏱ {executionTime}
        </div>
      )}
    </div>
  );
};
