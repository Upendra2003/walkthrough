import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { GraphNodesScene } from '../types';

interface Props extends GraphNodesScene {
  frame?: number;
  fps?: number;
}

const DEFAULT_COLORS = ['#4a9eff', '#22c55e', '#FFD700', '#f59e0b', '#a78bfa', '#FF4444', '#34d399', '#60a5fa'];

export const GraphNodes: React.FC<Props> = ({
  title, nodes = [], edges = [], frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const SVG_W = 620;
  const SVG_H = 320;
  const CX = SVG_W / 2;
  const CY = SVG_H / 2;
  const RADIUS = Math.min(CX, CY) - 60;
  const N = nodes.length;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  // Compute node positions
  const positions = nodes.map((_, i) => ({
    x: N === 1 ? CX : CX + RADIUS * Math.cos((2 * Math.PI * i) / N - Math.PI / 2),
    y: N === 1 ? CY : CY + RADIUS * Math.sin((2 * Math.PI * i) / N - Math.PI / 2),
  }));

  const nodeIdxMap: Record<string, number> = {};
  nodes.forEach((n, i) => { nodeIdxMap[n.id] = i; });

  const edgesStart = N * 10 + 8;
  const lastNodeIsActive = frame >= (N - 1) * 10 + 8;
  const pulse = lastNodeIsActive
    ? interpolate(frame % 36, [0, 18, 36], [1, 1.2, 1], { extrapolateRight: 'clamp' })
    : 1;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '24px 40px', boxSizing: 'border-box', gap: 8,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
        {/* Edges */}
        {edges.map((edge, ei) => {
          const fromIdx = nodeIdxMap[edge.from];
          const toIdx = nodeIdxMap[edge.to];
          if (fromIdx === undefined || toIdx === undefined) return null;
          const from = positions[fromIdx];
          const to = positions[toIdx];

          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          const edgeStart = edgesStart + ei * 10;
          const edgeP = interpolate(frame, [edgeStart, edgeStart + 18], [0, 1], { extrapolateRight: 'clamp' });
          const labelOp = interpolate(frame, [edgeStart + 16, edgeStart + 24], [0, 1], { extrapolateRight: 'clamp' });

          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;

          return (
            <g key={ei}>
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="#4a9eff" strokeWidth={1.5} opacity={0.6}
                strokeDasharray={len}
                strokeDashoffset={len * (1 - edgeP)}
              />
              {/* Arrowhead */}
              {edgeP > 0.8 && (
                <polygon
                  points={`${to.x - (dx / len) * 10 + (dy / len) * 5},${to.y - (dy / len) * 10 - (dx / len) * 5} ${to.x},${to.y} ${to.x - (dx / len) * 10 - (dy / len) * 5},${to.y - (dy / len) * 10 + (dx / len) * 5}`}
                  fill="#4a9eff" opacity={edgeP}
                />
              )}
              {edge.label && (
                <text x={mx} y={my - 6} textAnchor="middle"
                  fill="#9ca3af" fontSize={12} fontFamily="inherit"
                  opacity={labelOp}>
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const pos = positions[i];
          const p = spring({ frame: frame - i * 10, fps, config: { damping: 12, stiffness: 130, mass: 0.7 } });
          const nodeScale = interpolate(p, [0, 1], [0.3, 1]);
          const nodeOp = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const color = node.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
          const isLast = i === N - 1;
          const r = 30 * (isLast ? pulse : 1);

          return (
            <g key={node.id} transform={`translate(${pos.x},${pos.y}) scale(${nodeScale})`} opacity={nodeOp}>
              <circle r={r} fill={`${color}22`} stroke={color} strokeWidth={2}
                style={{ filter: isLast ? `drop-shadow(0 0 8px ${color})` : 'none' }}
              />
              <text y={5} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="inherit">
                {node.label.length > 10 ? node.label.slice(0, 8) + '…' : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
