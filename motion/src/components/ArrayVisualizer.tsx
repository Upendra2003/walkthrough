import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { ArrayVisualizerScene } from '../types';

interface Props extends ArrayVisualizerScene {
  frame?: number;
  fps?: number;
}

export const ArrayVisualizer: React.FC<Props> = ({
  title, items = [], highlightIndex, operation, operationLabel,
  frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const opLabelOp = interpolate(frame, [items.length * 8 + 20, items.length * 8 + 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '32px 48px', boxSizing: 'border-box', gap: 20,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      {/* Operation label */}
      {operation && operation !== 'none' && (
        <div style={{
          opacity: opLabelOp,
          background: 'rgba(74,158,255,0.12)', border: '1px solid #4a9eff',
          borderRadius: 16, padding: '5px 16px',
          color: '#4a9eff', fontSize: 13, fontWeight: 700,
        }}>
          {operation.toUpperCase()}{operationLabel ? `: ${operationLabel}` : ''}
        </div>
      )}

      {/* Array row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {items.map((item, i) => {
          const p = spring({ frame: frame - i * 8, fps, config: { damping: 12, stiffness: 140, mass: 0.7 } });
          const ty = interpolate(p, [0, 1], [40, 0]);
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

          const isHighlighted = highlightIndex === i;
          const isFiltered = operation === 'filter' && !isHighlighted;
          const isPopped = operation === 'pop' && i === items.length - 1;

          const popP = isPopped ? spring({ frame: frame - items.length * 8 - 10, fps, config: { damping: 8, stiffness: 200 } }) : 0;
          const popScale = isPopped ? interpolate(popP, [0, 1], [1, 0]) : 1;

          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transform: `translateY(${ty}px) scale(${popScale})`,
              opacity: isFiltered ? interpolate(frame, [items.length * 8 + 20, items.length * 8 + 35], [1, 0.15], { extrapolateRight: 'clamp' }) : op,
            }}>
              <div style={{
                width: 64, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${isHighlighted ? '#FFD700' : '#2a3a5a'}`,
                borderRadius: 8, background: isHighlighted ? 'rgba(255,215,0,0.12)' : '#111',
                boxShadow: isHighlighted ? '0 0 14px 3px rgba(255,215,0,0.4)' : 'none',
                color: '#e0e0e0', fontSize: 14, fontWeight: 600,
              }}>
                {item}
              </div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>[{i}]</div>
            </div>
          );
        })}

        {/* Push: new box slides from right */}
        {operation === 'push' && (
          (() => {
            const pushP = spring({ frame: frame - items.length * 8 - 5, fps, config: { damping: 12, stiffness: 130 } });
            const pushX = interpolate(pushP, [0, 1], [80, 0]);
            const pushOp = interpolate(pushP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                transform: `translateX(${pushX}px)`, opacity: pushOp,
              }}>
                <div style={{
                  width: 64, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #22c55e', borderRadius: 8,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#22c55e', fontSize: 14, fontWeight: 700,
                }}>
                  {operationLabel ?? 'new'}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>[{items.length}]</div>
              </div>
            );
          })()
        )}
      </div>

      {/* Map arrow */}
      {operation === 'map' && (
        <div style={{
          opacity: opLabelOp, display: 'flex', alignItems: 'center', gap: 12,
          color: '#f59e0b', fontSize: 14,
        }}>
          <span>{operationLabel ?? 'transform'}</span>
          <span>→</span>
          <span style={{ color: '#22c55e' }}>mapped[]</span>
        </div>
      )}
    </div>
  );
};
