import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { WordTiming } from '../types';

interface Props {
  wordTimings: WordTiming[];
}

export const SubtitleBar: React.FC<Props> = ({ wordTimings }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  let activeIndex = -1;
  for (let i = 0; i < wordTimings.length; i++) {
    if (wordTimings[i].startMs <= currentMs) activeIndex = i;
  }

  const windowStart = Math.max(0, activeIndex - 4);
  const windowEnd = Math.min(wordTimings.length, windowStart + 10);
  const visibleWords = wordTimings.slice(windowStart, windowEnd);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: 0,
        right: 0,
        padding: '12px 40px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.6))',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '8px',
        minHeight: '60px',
        zIndex: 100
      }}
    >
      {visibleWords.map((w, i) => {
        const globalIndex = windowStart + i;
        const isActive = globalIndex === activeIndex;
        const isPast = globalIndex < activeIndex;

        return (
          <span
            key={`${w.word}-${globalIndex}`}
            style={{
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              fontSize: 22,
              fontWeight: isActive ? 700 : 400,
              color: isActive
                ? '#FFD700'
                : isPast
                ? 'rgba(255,255,255,0.35)'
                : 'rgba(255,255,255,0.85)',
              textShadow: isActive ? '0 0 20px rgba(255,215,0,0.6)' : 'none',
              transition: 'color 0.1s ease',
              letterSpacing: '0.02em',
              transform: isActive ? 'scale(1.08)' : 'scale(1)',
              display: 'inline-block'
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
