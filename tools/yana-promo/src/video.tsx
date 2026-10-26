import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {Intro, Outro, Workspace} from './scenes/brand-scenes';
import {Approval, Context, Evidence, Montage} from './scenes/work-scenes';
import {Models} from './scenes/model-scene';
import {SceneWrap, ProgressLine} from './components';
import {teaserTimeline, timeline, type SceneId} from './content';
import {theme} from './theme';

const scenes: Record<SceneId, React.FC<{offset?: number}>> = {intro: Intro, workspace: Workspace, context: Context, approval: Approval, evidence: Evidence, models: Models, montage: Montage, outro: Outro};

export const Video: React.FC<{teaser?: boolean}> = ({teaser = false}) => {
  const cuts = teaser ? teaserTimeline : timeline.map(s => ({...s, offset: 0}));
  return <AbsoluteFill style={{background: theme.paper, fontFamily: theme.font}}>
    {cuts.map(cut => {
      const Scene = scenes[cut.id];
      return <Sequence key={cut.id} from={cut.from} durationInFrames={cut.duration}><SceneWrap duration={cut.duration}><Scene offset={cut.offset} /></SceneWrap></Sequence>;
    })}
    <Audio src={staticFile(`audio/${teaser ? 'teaser' : 'main'}.mp3`)} />
    <ProgressLine />
  </AbsoluteFill>;
};
