import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { PipelineFlowScene } from '../types';

interface Props extends PipelineFlowScene {
  frame?: number;
  fps?: number;
}

export const PipelineFlow: React.FC<Props> = ({
  title, input = '', stages = [], output = '', frame: frameProp, fps: fpsProp,
}) => {
  const frameCtx = useCurrentFrame();
  const { fps: ctxFps } = useVideoConfig();
  const frame = frameProp ?? frameCtx;
  const fps = fpsProp ?? ctxFps;

  const titleOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const TOTAL = stages.length + 2; // input + stages + output
  const BOX_W = 100;
  const GAP = 48;
  const totalW = TOTAL * BOX_W + (TOTAL - 1) * GAP;
  const dotCycleFrames = 40;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0d1117',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      padding: '32px 40px', boxSizing: 'border-box', gap: 24,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', opacity: titleOp }}>{title}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {/* Input */}
        {(() => {
          const p = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <div style={{
              opacity: op, transform: `scale(${interpolate(p, [0, 1], [0.8, 1])})`,
              width: BOX_W, padding: '12px 8px', borderRadius: 8,
              border: '2px solid #4a9eff', background: 'rgba(74,158,255,0.1)',
              textAlign: 'center', color: '#4a9eff', fontSize: 12, fontWeight: 700,
            }}>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>INPUT</div>
              {input}
            </div>
          );
        })()}

        {stages.map((stage, i) => {
          const boxStart = i * 10 + 8;
          const p = spring({ frame: frame - boxStart, fps, config: { damping: 14, stiffness: 120 } });
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          const stageColor = stage.color ?? '#4a9eff';

          // Dot traveling: animate through entire pipeline continually
          const dotX = interpolate(
            frame % dotCycleFrames,
            [0, dotCycleFrames],
            [0, totalW],
            { extrapolateRight: 'clamp' },
          );
          const dotInStage = dotX >= (i + 1) * (BOX_W + GAP) && dotX < (i + 2) * (BOX_W + GAP);

          const arrowP = interpolate(frame, [boxStart, boxStart + 12], [0, 1], { extrapolateRight: 'clamp' });

          return (
            <React.Fragment key={i}>
              {/* Arrow between boxes */}
              <svg width={GAP} height={20} viewBox={`0 0 ${GAP} 20`} style={{ flexShrink: 0 }}>
                <line x1={0} y1={10} x2={GAP - 10} y2={10}
                  stroke="#4a9eff" strokeWidth={2}
                  strokeDasharray={GAP}
                  strokeDashoffset={GAP * (1 - arrowP)}
                />
                <polygon points={`${GAP - 12},5 ${GAP},10 ${GAP - 12},15`} fill="#4a9eff" opacity={arrowP} />
              </svg>

              <div style={{
                opacity: op, transform: `scale(${interpolate(p, [0, 1], [0.8, 1])})`,
                width: BOX_W, padding: '10px 6px', borderRadius: 8,
                border: `2px solid ${dotInStage ? '#FFD700' : stageColor}`,
                background: dotInStage ? 'rgba(255,215,0,0.12)' : `${stageColor}18`,
                textAlign: 'center',
                boxShadow: dotInStage ? '0 0 14px 3px rgba(255,215,0,0.4)' : 'none',
              }}>
                <div style={{ color: stageColor, fontSize: 12, fontWeight: 700 }}>{stage.label}</div>
                <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4 }}>{stage.description}</div>
              </div>
            </React.Fragment>
          );
        })}

        {/* Arrow before output */}
        {(() => {
          const arrowP = interpolate(frame, [stages.length * 10 + 8, stages.length * 10 + 20], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <svg width={GAP} height={20} viewBox={`0 0 ${GAP} 20`} style={{ flexShrink: 0 }}>
              <line x1={0} y1={10} x2={GAP - 10} y2={10}
                stroke="#22c55e" strokeWidth={2}
                strokeDasharray={GAP}
                strokeDashoffset={GAP * (1 - arrowP)}
              />
              <polygon points={`${GAP - 12},5 ${GAP},10 ${GAP - 12},15`} fill="#22c55e" opacity={arrowP} />
            </svg>
          );
        })()}

        {/* Output */}
        {(() => {
          const p = spring({ frame: frame - stages.length * 10 - 18, fps, config: { damping: 14, stiffness: 120 } });
          const op = interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <div style={{
              opacity: op, transform: `scale(${interpolate(p, [0, 1], [0.8, 1])})`,
              width: BOX_W, padding: '12px 8px', borderRadius: 8,
              border: '2px solid #22c55e', background: 'rgba(34,197,94,0.1)',
              textAlign: 'center', color: '#22c55e', fontSize: 12, fontWeight: 700,
            }}>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>OUTPUT</div>
              {output}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
