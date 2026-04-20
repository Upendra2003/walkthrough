import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { TreeScene } from '../types';

const COLORS = {
  bg: '#0d1117',
  line: '#4a9eff',
  root: '#1e3a5f',
  child: '#1e5f3a',
  grandchild: '#5f3a1e',
  border: '#4a9eff',
  text: '#e0e0e0',
};

const truncate = (s: string, n = 20) => s.length > n ? s.slice(0, n - 1) + '…' : s;

interface NodeProps {
  label: string;
  frame: number;
  fps: number;
  startFrame: number;
  color: string;
  borderColor?: string;
}

const Node: React.FC<NodeProps> = ({ label, frame, fps, startFrame, color, borderColor }) => {
  const progress = spring({ frame: frame - startFrame, fps, config: { damping: 14, stiffness: 100 } });
  const scale = interpolate(progress, [0, 1], [0.4, 1], { extrapolateRight: 'clamp' });
  const opacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      transform: `scale(${scale})`,
      opacity,
      padding: '10px 22px',
      borderRadius: 24,
      background: color,
      border: `2px solid ${borderColor ?? COLORS.border}`,
      color: COLORS.text,
      fontSize: 14,
      fontWeight: 600,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 12px rgba(74,158,255,0.2)',
    }}>
      {truncate(label)}
    </div>
  );
};

interface Props extends TreeScene {
  frame?: number;
  fps?: number;
}

export const TreeDiagram: React.FC<Props> = ({ root, children = [], frame: frameProp, fps: fpsProp }) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  // Line draw progress per level
  const line1Progress = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: 'clamp' });
  const line2Progress = interpolate(frame, [28, 42], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: COLORS.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      gap: 0, paddingTop: 20,
    }}>
      {/* Root */}
      <Node label={root} frame={frame} fps={fps} startFrame={0} color={COLORS.root} />

      {/* SVG connector root → children */}
      <svg width={Math.max(children.length * 180, 300)} height={40} style={{ overflow: 'visible' }}>
        {children.map((_, i) => {
          const totalW = Math.max(children.length * 180, 300);
          const slotW = totalW / children.length;
          const cx = slotW * i + slotW / 2;
          return (
            <line key={i}
              x1={totalW / 2} y1={0}
              x2={cx} y2={40}
              stroke={COLORS.line} strokeWidth={2}
              strokeDasharray={60}
              strokeDashoffset={60 * (1 - line1Progress)}
            />
          );
        })}
      </svg>

      {/* Children row */}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'flex-start' }}>
        {children.map((child, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <Node label={child.label} frame={frame} fps={fps} startFrame={10 + ci * 6} color={COLORS.child} />

            {child.children && child.children.length > 0 && (
              <>
                <svg width={Math.max(child.children.length * 140, 120)} height={36} style={{ overflow: 'visible' }}>
                  {child.children.map((_, gi) => {
                    const totalW = Math.max(child.children!.length * 140, 120);
                    const slotW = totalW / child.children!.length;
                    const cx = slotW * gi + slotW / 2;
                    return (
                      <line key={gi}
                        x1={totalW / 2} y1={0}
                        x2={cx} y2={36}
                        stroke={COLORS.line} strokeWidth={1.5}
                        strokeDasharray={50}
                        strokeDashoffset={50 * (1 - line2Progress)}
                      />
                    );
                  })}
                </svg>
                <div style={{ display: 'flex', gap: 16 }}>
                  {child.children.map((gc, gi) => (
                    <Node key={gi} label={gc.label} frame={frame} fps={fps}
                      startFrame={24 + ci * 4 + gi * 4} color={COLORS.grandchild}
                      borderColor="#FF9955"
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
