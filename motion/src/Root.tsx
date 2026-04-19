import React from 'react';
import { Composition } from 'remotion';
import { CodeExplainer } from './compositions/CodeExplainer';
import { sampleBlueprint } from './sampleBlueprint';
import { AnimationBlueprint } from './types';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  const defaultProps: { blueprint: AnimationBlueprint } = { blueprint: sampleBlueprint };
  const durationInFrames = Math.ceil((sampleBlueprint.audioDurationMs / 1000) * FPS);

  return (
    <Composition
      id="CodeExplainer"
      component={CodeExplainer as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={durationInFrames}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={defaultProps}
    />
  );
};
