import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { APIRequestScene } from '../types';

const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e', POST: '#4a9eff', PUT: '#f59e0b',
  DELETE: '#FF4444', PATCH: '#FFD700',
};

interface Props extends APIRequestScene {
  frame?: number;
  fps?: number;
}

export const APIRequest: React.FC<Props> = ({
  method, endpoint, requestBody, statusCode, responseBody,
  frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const headerP = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const headerOp = interpolate(headerP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const arrowDownP = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' });
  const serverP = spring({ frame: frame - 28, fps, config: { damping: 14, stiffness: 120 } });
  const serverOp = interpolate(serverP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const serverScale = interpolate(serverP, [0, 1], [0.8, 1]);

  const arrowUpP = interpolate(frame, [42, 58], [0, 1], { extrapolateRight: 'clamp' });
  const respP = spring({ frame: frame - 58, fps, config: { damping: 14, stiffness: 120 } });
  const respOp = interpolate(respP, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const mColor = METHOD_COLORS[method] ?? '#4a9eff';
  const statusColor = statusCode < 300 ? '#22c55e' : statusCode < 500 ? '#f59e0b' : '#FF4444';

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '28px 60px', boxSizing: 'border-box', gap: 12,
    }}>
      {/* Request line */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, opacity: headerOp,
      }}>
        <span style={{
          background: mColor, color: '#000', fontWeight: 800, fontSize: 14,
          padding: '5px 14px', borderRadius: 6,
        }}>
          {method}
        </span>
        <span style={{ color: '#e0e0e0', fontSize: 16, letterSpacing: 0.5 }}>{endpoint}</span>
      </div>

      {/* Down arrow */}
      <svg width={32} height={48} viewBox="0 0 32 48">
        <line x1={16} y1={0} x2={16} y2={36}
          stroke="#4a9eff" strokeWidth={3}
          strokeDasharray={48}
          strokeDashoffset={48 * (1 - arrowDownP)}
        />
        <polygon points="8,30 16,44 24,30" fill="#4a9eff" opacity={arrowDownP} />
      </svg>

      {/* Server */}
      <div style={{
        transform: `scale(${serverScale})`, opacity: serverOp,
        border: '2px solid #4a9eff', borderRadius: 8,
        padding: '14px 28px', background: '#0f1e2e',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        minWidth: 160,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 80, height: 8, background: '#1e3a5f', borderRadius: 3,
          }} />
        ))}
        <div style={{ color: '#4a9eff', fontSize: 11, fontWeight: 600, marginTop: 6 }}>SERVER</div>
      </div>

      {/* Up arrow */}
      <svg width={32} height={48} viewBox="0 0 32 48">
        <line x1={16} y1={48} x2={16} y2={12}
          stroke={statusColor} strokeWidth={3}
          strokeDasharray={48}
          strokeDashoffset={48 * (1 - arrowUpP)}
        />
        <polygon points="8,18 16,4 24,18" fill={statusColor} opacity={arrowUpP} />
      </svg>

      {/* Response */}
      <div style={{ opacity: respOp, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <span style={{
          background: statusColor, color: '#000', fontWeight: 800, fontSize: 15,
          padding: '5px 18px', borderRadius: 8,
        }}>
          {statusCode}
        </span>
        <div style={{
          background: '#111', border: `1px solid ${statusColor}33`,
          borderRadius: 8, padding: '10px 18px',
          color: '#22c55e', fontSize: 13,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          maxWidth: 400, wordBreak: 'break-all',
        }}>
          {responseBody}
        </div>
      </div>
    </div>
  );
};
