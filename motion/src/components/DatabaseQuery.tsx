import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { DatabaseQueryScene } from '../types';

interface Props extends DatabaseQueryScene {
  frame?: number;
  fps?: number;
}

export const DatabaseQuery: React.FC<Props> = ({
  tableName, columns = [], rows = [], queryLabel = '', matchedRows = [], frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const headerOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const allRowsFrame = rows.length * 10 + 10;
  const queryBadgeProgress = spring({ frame: frame - allRowsFrame, fps, config: { damping: 14, stiffness: 140 } });
  const queryScale = interpolate(queryBadgeProgress, [0, 1], [0.6, 1]);
  const queryOp = interpolate(queryBadgeProgress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const filterActive = frame >= allRowsFrame + 10;
  const countOp = interpolate(frame, [allRowsFrame + 20, allRowsFrame + 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 48px', boxSizing: 'border-box', gap: 16,
    }}>
      {/* Table name */}
      <div style={{ fontSize: 20, fontWeight: 700, color: '#4a9eff', opacity: headerOp, letterSpacing: 1 }}>
        {tableName}
      </div>

      {/* Query badge */}
      <div style={{
        transform: `scale(${queryScale})`, opacity: queryOp,
        background: 'rgba(74,158,255,0.15)', border: '1px solid #4a9eff',
        borderRadius: 20, padding: '6px 18px',
        color: '#4a9eff', fontSize: 13, fontWeight: 700, letterSpacing: 1,
      }}>
        {queryLabel}
      </div>

      {/* Table */}
      <div style={{
        border: '1px solid #2a3a4a', borderRadius: 8, overflow: 'hidden',
        minWidth: 480,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', background: '#1a2a3a',
          borderBottom: '2px solid #4a9eff', opacity: headerOp,
        }}>
          {columns.map((col, i) => (
            <div key={i} style={{
              flex: 1, padding: '10px 14px',
              color: '#4a9eff', fontSize: 13, fontWeight: 700,
            }}>
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((row, ri) => {
          const p = spring({ frame: frame - (ri * 10 + 8), fps, config: { damping: 14, stiffness: 120 } });
          const ty = interpolate(p, [0, 1], [20, 0]);
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const isMatch = matchedRows.includes(ri);
          const dimmed = filterActive && !isMatch;

          return (
            <div key={ri} style={{
              display: 'flex',
              transform: `translateY(${ty}px)`, opacity: dimmed ? 0.2 : op,
              background: isMatch && filterActive ? 'rgba(34,197,94,0.08)' : 'transparent',
              borderLeft: isMatch && filterActive ? '3px solid #22c55e' : '3px solid transparent',
              borderBottom: '1px solid #1a2a3a',
              transition: 'opacity 0.3s, background 0.3s',
            }}>
              {row.map((cell, ci) => (
                <div key={ci} style={{
                  flex: 1, padding: '9px 14px',
                  color: '#e0e0e0', fontSize: 13,
                }}>
                  {cell}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Row count badge */}
      <div style={{ opacity: countOp, alignSelf: 'flex-end', marginRight: 0 }}>
        <span style={{
          background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e',
          borderRadius: 12, padding: '4px 14px',
          color: '#22c55e', fontSize: 13, fontWeight: 700,
        }}>
          {matchedRows.length} rows matched
        </span>
      </div>
    </div>
  );
};
