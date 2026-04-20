import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { JSONViewerScene } from '../types';

interface Props extends JSONViewerScene {
  frame?: number;
  fps?: number;
}

const valueColor = (v: unknown): string => {
  if (typeof v === 'string') return '#22c55e';
  if (typeof v === 'number') return '#4a9eff';
  if (typeof v === 'boolean') return '#FFD700';
  return '#e0e0e0';
};

const renderValue = (v: unknown): string => {
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
};

export const JSONViewer: React.FC<Props> = ({
  title, json = {}, highlightKeys, frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const keys = Object.keys(json);
  const highlighted = new Set(highlightKeys ?? []);

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const braceOp = interpolate(frame, [5, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 60px', boxSizing: 'border-box',
    }}>
      {/* Tab */}
      <div style={{
        alignSelf: 'flex-start', background: '#1a2a3a',
        borderRadius: '8px 8px 0 0', padding: '8px 20px',
        color: '#4a9eff', fontSize: 14, fontWeight: 700,
        opacity: titleOp, border: '1px solid #2a3a4a', borderBottom: 'none',
      }}>
        {title}
      </div>

      <div style={{
        background: '#111', border: '1px solid #2a3a4a', borderRadius: '0 8px 8px 8px',
        padding: '20px 28px', minWidth: 380, alignSelf: 'flex-start',
      }}>
        <div style={{ color: '#e0e0e0', fontSize: 16, opacity: braceOp, marginBottom: 8 }}>{'{'}</div>

        {keys.map((key, i) => {
          const val = json[key];
          const isObj = typeof val === 'object' && val !== null;
          const isHighlighted = highlighted.has(key);
          const p = spring({ frame: frame - (i * 8 + 14), fps, config: { damping: 14, stiffness: 120 } });
          const tx = interpolate(p, [0, 1], [-30, 0]);
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

          return (
            <div key={key} style={{
              transform: `translateX(${tx}px)`, opacity: op,
              display: 'flex', flexDirection: 'column',
              marginLeft: 24, marginBottom: 6,
              boxShadow: isHighlighted ? '0 0 0 1px #FFD70055' : 'none',
              borderRadius: 4, padding: isHighlighted ? '2px 6px' : '0',
            }}>
              {isObj ? (
                <>
                  <div>
                    <span style={{ color: '#9ca3af', fontWeight: isHighlighted ? 700 : 400 }}>"{key}"</span>
                    <span style={{ color: '#fff' }}>: {'{'}</span>
                  </div>
                  {Object.entries(val as Record<string, unknown>).map(([k2, v2]) => (
                    <div key={k2} style={{ marginLeft: 24, display: 'flex', gap: 4 }}>
                      <span style={{ color: '#9ca3af' }}>"{k2}"</span>
                      <span style={{ color: '#fff' }}>:</span>
                      <span style={{ color: valueColor(v2) }}>{renderValue(v2)}</span>
                    </div>
                  ))}
                  <div><span style={{ color: '#fff' }}>{'}'}</span><span style={{ color: '#6b7280' }}>,</span></div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <span style={{
                    color: isHighlighted ? '#FFD700' : '#9ca3af',
                    fontWeight: isHighlighted ? 700 : 400,
                    textShadow: isHighlighted ? '0 0 8px #FFD70088' : 'none',
                  }}>"{key}"</span>
                  <span style={{ color: '#fff' }}>:</span>
                  <span style={{ color: valueColor(val) }}>{renderValue(val)}</span>
                  <span style={{ color: '#6b7280' }}>,</span>
                </div>
              )}
            </div>
          );
        })}

        <div style={{
          color: '#e0e0e0', fontSize: 16,
          opacity: interpolate(frame, [keys.length * 8 + 20, keys.length * 8 + 28], [0, 1], { extrapolateRight: 'clamp' }),
        }}>{'}'}</div>
      </div>
    </div>
  );
};
