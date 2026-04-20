import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { AuthFlowScene } from '../types';

interface Props extends AuthFlowScene {
  frame?: number;
  fps?: number;
}

const NodeIcon: React.FC<{ icon: AuthFlowScene['steps'][0]['icon']; size?: number }> = ({ icon, size = 36 }) => {
  const s = size;
  switch (icon) {
    case 'user':
      return (
        <svg width={s} height={s} viewBox="0 0 36 36">
          <circle cx={18} cy={12} r={7} stroke="#fff" strokeWidth={2} fill="none" />
          <path d="M4 34 Q4 24 18 24 Q32 24 32 34" stroke="#fff" strokeWidth={2} fill="none" />
        </svg>
      );
    case 'token':
      return (
        <svg width={s} height={s} viewBox="0 0 36 36">
          <rect x={4} y={10} width={28} height={16} rx={4} stroke="#fff" strokeWidth={2} fill="none" />
          <circle cx={13} cy={18} r={4} stroke="#fff" strokeWidth={2} fill="none" />
          <line x1={20} y1={14} x2={30} y2={14} stroke="#fff" strokeWidth={2} />
          <line x1={20} y1={18} x2={26} y2={18} stroke="#fff" strokeWidth={2} />
        </svg>
      );
    case 'server':
      return (
        <svg width={s} height={s} viewBox="0 0 36 36">
          {[0, 1, 2].map(i => (
            <rect key={i} x={4} y={4 + i * 10} width={28} height={8} rx={2} stroke="#fff" strokeWidth={2} fill="none" />
          ))}
        </svg>
      );
    case 'check':
      return (
        <svg width={s} height={s} viewBox="0 0 36 36">
          <circle cx={18} cy={18} r={14} stroke="#22c55e" strokeWidth={2} fill="none" />
          <polyline points="10,18 16,24 26,12" stroke="#22c55e" strokeWidth={3} fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'lock':
      return (
        <svg width={s} height={s} viewBox="0 0 36 36">
          <rect x={7} y={16} width={22} height={16} rx={3} stroke="#fff" strokeWidth={2} fill="none" />
          <path d="M11 16 v-5 a7 7 0 0 1 14 0 v5" stroke="#fff" strokeWidth={2} fill="none" />
          <circle cx={18} cy={24} r={2.5} fill="#fff" />
        </svg>
      );
  }
};

export const AuthFlow: React.FC<Props> = ({ title, steps = [], frame: frameProp, fps: fpsProp }) => {
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
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      padding: '32px 48px', boxSizing: 'border-box', gap: 32,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((step, i) => {
          const nodeStart = i * 16;
          const nodeP = spring({ frame: frame - nodeStart, fps, config: { damping: 14, stiffness: 120 } });
          const nodeScale = interpolate(nodeP, [0, 1], [0.5, 1]);
          const nodeOp = interpolate(nodeP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

          const isActive = i === steps.length - 1;
          const isDone = frame >= nodeStart + 10;
          const nodeColor = step.color ?? (isDone ? '#22c55e' : '#f59e0b');
          const glowColor = isActive ? '#f59e0b' : isDone ? '#22c55e' : '#4a9eff';

          const arrowStart = nodeStart + 12;
          const arrowP = interpolate(frame, [arrowStart, arrowStart + 12], [0, 1], { extrapolateRight: 'clamp' });

          return (
            <React.Fragment key={i}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                transform: `scale(${nodeScale})`, opacity: nodeOp,
              }}>
                <div style={{
                  width: 68, height: 68, borderRadius: '50%',
                  border: `2px solid ${nodeColor}`,
                  background: `${nodeColor}18`,
                  boxShadow: `0 0 ${isActive ? '20px 4px' : '10px 2px'} ${glowColor}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <NodeIcon icon={step.icon} size={32} />
                </div>
                <div style={{
                  color: isDone ? '#22c55e' : '#e0e0e0',
                  fontSize: 13, fontWeight: 600,
                  textAlign: 'center', maxWidth: 80,
                }}>
                  {step.label}
                </div>
              </div>

              {i < steps.length - 1 && (
                <svg width={60} height={20} viewBox="0 0 60 20" style={{ flexShrink: 0 }}>
                  <line x1={0} y1={10} x2={48} y2={10}
                    stroke="#4a9eff" strokeWidth={2}
                    strokeDasharray={60}
                    strokeDashoffset={60 * (1 - arrowP)}
                  />
                  <polygon points="44,5 58,10 44,15" fill="#4a9eff" opacity={arrowP} />
                </svg>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
