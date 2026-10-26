import React from 'react';
import {Composition, Still} from 'remotion';
import {Film} from './film';

export const Root: React.FC = () => (
  <>
    <Composition id="YanaClaudeFilm" component={Film} durationInFrames={2520} fps={60} width={1920} height={1080} />
    <Still id="YanaClaudeFilmPoster" component={Film} width={1920} height={1080} defaultProps={{frameOverride: 2460}} />
  </>
);
