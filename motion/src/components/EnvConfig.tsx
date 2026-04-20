import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { EnvConfigScene } from '../types';

interface Props extends EnvConfigScene {
  frame?: number;
  fps?: number;
}

export const EnvConfig: React.FC<Props> = ({
  title, envVars = [], appName = 'App', frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const fileP = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const fileOp = interpolate(fileP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const allVarsFrame = envVars.length * 10 + 12;
  const arrowP = interpolate(frame, [allVarsFrame, allVarsFrame + 18], [0, 1], { extrapolateRight: 'clamp' });
  const appP = spring({ frame: frame - (allVarsFrame + 16), fps, config: { damping: 14, stiffness: 120 } });
  const appOp = interpolate(appP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const appScale = interpolate(appP, [0, 1], [0.8, 1]);

  const doneOp = interpolate(frame, [allVarsFrame + 32, allVarsFrame + 42], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 48px', boxSizing: 'border-box', gap: 20,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: fileOp }}>{title}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {/* .env file */}
        <div style={{
          opacity: fileOp, border: '2px solid #f59e0b',
          borderRadius: 10, padding: '16px 20px', minWidth: 240,
          background: 'rgba(245,158,11,0.06)',
        }}>
          <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, marginBottom: 10, letterSpacing: 2 }}>
            📄 .env
          </div>
          {envVars.map((ev, i) => {
            const p = spring({ frame: frame - (i * 10 + 8), fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={i} style={{
                transform: `translateX(${interpolate(p, [0, 1], [-20, 0])}px)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                fontSize: 13, marginBottom: 6, display: 'flex', gap: 4,
              }}>
                <span style={{ color: '#FFD700', fontWeight: 700 }}>{ev.key}</span>
                <span style={{ color: '#fff' }}>=</span>
                <span style={{ color: ev.secret ? '#FF4444' : '#22c55e' }}>
                  {ev.secret ? '•••••••' : ev.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Arrow */}
        <svg width={60} height={24} viewBox="0 0 60 24">
          <line x1={0} y1={12} x2={48} y2={12}
            stroke="#4a9eff" strokeWidth={3}
            strokeDasharray={60}
            strokeDashoffset={60 * (1 - arrowP)}
          />
          <polygon points="44,6 58,12 44,18" fill="#4a9eff" opacity={arrowP} />
        </svg>

        {/* App box */}
        <div style={{
          transform: `scale(${appScale})`, opacity: appOp,
          border: '2px solid #4a9eff', borderRadius: 10,
          padding: '16px 20px', minWidth: 160,
          background: 'rgba(74,158,255,0.06)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 28 }}>⚙️</div>
          <div style={{ color: '#4a9eff', fontSize: 14, fontWeight: 700 }}>{appName}</div>
          <div style={{ color: '#22c55e', fontSize: 11 }}>vars loaded</div>
        </div>
      </div>

      <div style={{ opacity: doneOp, color: '#22c55e', fontSize: 15, fontWeight: 600 }}>
        Config loaded ✅
      </div>
    </div>
  );
};
