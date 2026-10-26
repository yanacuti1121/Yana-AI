import React from 'react';
import {Composition, Still, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {Video} from './video';
import {Outro} from './scenes/brand-scenes';
import {FPS, HEIGHT, TOTAL_FRAMES, WIDTH} from './content';
import {theme} from './theme';
import {KineticFrame, KineticVideo} from './kinetic-video';
import {Root as ClaudeTestRoot} from './claude-test/root';
import {Root as ClaudeFilmRoot} from './claude-film/root';
import {SiteRoot} from './site-film/story';
import {MAIN_DURATION_IN_FRAMES, TEASER_DURATION_IN_FRAMES, OUTPUT_FPS} from './playback';

for (const weight of ['400', '700', '900']) {
  loadFont({family: 'Nunito', url: staticFile(`fonts/nunito-${weight}.ttf`), weight, display: 'block'});
}
loadFont({family: 'Patrick Hand', url: staticFile('fonts/patrick-hand.ttf'), weight: '400', display: 'block'});

export const Root: React.FC = () => <>
  <ClaudeTestRoot />
  <ClaudeFilmRoot />
  <SiteRoot />
  <Composition id="YanaFast" component={KineticVideo} defaultProps={{fast: true, mute: true}} width={WIDTH} height={HEIGHT} fps={OUTPUT_FPS} durationInFrames={MAIN_DURATION_IN_FRAMES} />
  <Composition id="YanaFastTeaser" component={KineticVideo} defaultProps={{fast: true, mute: true, teaser: true}} width={WIDTH} height={HEIGHT} fps={OUTPUT_FPS} durationInFrames={TEASER_DURATION_IN_FRAMES} />
  <Composition id="YanaDemoV2" component={KineticVideo} width={WIDTH} height={HEIGHT} fps={60} durationInFrames={4500} />
  <Composition id="YanaTeaserV2" component={KineticVideo} defaultProps={{teaser: true}} width={WIDTH} height={HEIGHT} fps={60} durationInFrames={1500} />
  <Still id="YanaPosterV2" component={() => <KineticFrame f={2160} />} width={WIDTH} height={HEIGHT} />
  <Composition id="YanaDemo" component={Video} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={TOTAL_FRAMES} />
  <Composition id="YanaTeaser" component={Video} defaultProps={{teaser: true}} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={750} />
  <Still id="YanaPoster" component={() => <div style={{fontFamily: theme.font}}><Outro offset={100} /></div>} width={WIDTH} height={HEIGHT} />
</>;
