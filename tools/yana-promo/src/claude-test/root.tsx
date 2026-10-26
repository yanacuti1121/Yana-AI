import React from 'react';
import {Composition, Still} from 'remotion';
import {Film} from './film';

export const Root: React.FC = () => (
  <>
    <Composition id="YanaClaudeTest" component={Film} durationInFrames={600} fps={60} width={1920} height={1080} />
    <Still id="YanaClaudePoster" component={Film} width={1920} height={1080} defaultProps={{frameOverride: 450}} />
  </>
);
