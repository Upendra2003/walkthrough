import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { HashMapVisualizerScene } from '../types';

interface Props extends HashMapVisualizerScene {
  frame?: number;
  fps?: number;
}

export const HashMapVisualizer: React.FC<Props> = ({
  title, pairs = [], showBuckets, frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const badgeOp = interpolate(frame, [pairs.length * 10 + 20, pairs.length * 10 + 30], [0, 1], { extrapolateRight: 'clamp' });

  const buckets = Array.from(new Set(pairs.map((p, i) => p.bucket ?? i % 4))).sort((a, b) => a - b);

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 48px', boxSizing: 'border-box', gap: 16,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      {showBuckets ? (
        /* Bucket view */
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Bucket array */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 50 }}>
            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4, textAlign: 'center' }}>buckets</div>
            {buckets.map(b => (
              <div key={b} style={{
                width: 48, height: 34,
                border: '1px solid #2a3a5a', borderRadius: 4,
                background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6b7280', fontSize: 13,
              }}>
                [{b}]
              </div>
            ))}
          </div>

          {/* SVG lines + chain */}
          <div style={{ position: 'relative', minWidth: 300 }}>
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              viewBox="0 0 300 200" preserveAspectRatio="none">
              {pairs.map((pair, i) => {
                const bucketIdx = buckets.indexOf(pair.bucket ?? i % 4);
                const fromY = bucketIdx * 38 + 36 + 17;
                const toY = i * 38 + 36 + 17;
                const dashLen = 80;
                const lineP = interpolate(frame, [i * 10 + 12, i * 10 + 28], [0, 1], { extrapolateRight: 'clamp' });
                return (
                  <line key={i}
                    x1={0} y1={fromY} x2={120} y2={toY}
                    stroke="#FFD700" strokeWidth={1.5} opacity={0.5}
                    strokeDasharray={dashLen}
                    strokeDashoffset={dashLen * (1 - lineP)}
                  />
                );
              })}
            </svg>

            {/* Pair boxes */}
            <div style={{ marginLeft: 130, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pairs.map((pair, i) => {
                const p = spring({ frame: frame - (i * 10 + 8), fps, config: { damping: 14, stiffness: 120 } });
                const tx = interpolate(p, [0, 1], [30, 0]);
                const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
                return (
                  <div key={i} style={{
                    transform: `translateX(${tx}px)`, opacity: op,
                    display: 'flex', gap: 6,
                    padding: '6px 12px', borderRadius: 6,
                    background: '#111', border: '1px solid #2a3a5a',
                  }}>
                    <span style={{ color: '#FFD700', fontSize: 12 }}>{pair.key}</span>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>→</span>
                    <span style={{ color: '#22c55e', fontSize: 12 }}>{pair.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Simple table view */
        <div style={{ border: '1px solid #2a3a5a', borderRadius: 8, overflow: 'hidden', minWidth: 320 }}>
          <div style={{
            display: 'flex', background: '#1a2a3a',
            borderBottom: '2px solid #4a9eff',
            padding: '8px 16px',
            opacity: titleOp,
          }}>
            <span style={{ flex: 1, color: '#FFD700', fontSize: 12, fontWeight: 700 }}>KEY</span>
            <span style={{ flex: 1, color: '#22c55e', fontSize: 12, fontWeight: 700 }}>VALUE</span>
          </div>
          {pairs.map((pair, i) => {
            const p = spring({ frame: frame - (i * 10 + 8), fps, config: { damping: 14, stiffness: 120 } });
            const ty = interpolate(p, [0, 1], [16, 0]);
            const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={i} style={{
                display: 'flex', padding: '9px 16px',
                transform: `translateY(${ty}px)`, opacity: op,
                borderBottom: i < pairs.length - 1 ? '1px solid #1a2a2a' : 'none',
              }}>
                <span style={{ flex: 1, color: '#FFD700', fontSize: 13 }}>{pair.key}</span>
                <span style={{ flex: 1, color: '#22c55e', fontSize: 13 }}>{pair.value}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ opacity: badgeOp }}>
        <span style={{
          background: 'rgba(74,158,255,0.12)', border: '1px solid #4a9eff',
          borderRadius: 12, padding: '4px 14px',
          color: '#4a9eff', fontSize: 12, fontWeight: 700,
        }}>
          O(1) lookup
        </span>
      </div>
    </div>
  );
};
