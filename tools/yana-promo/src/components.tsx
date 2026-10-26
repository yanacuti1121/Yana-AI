import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme as t} from './theme';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const ramp = (f: number, start: number, end: number, a = 0, b = 1) => interpolate(f, [start, end], [a, b], clamp);
export const pop = (f: number, delay = 0) => spring({frame: f - delay, fps: 30, config: {damping: 19, stiffness: 105, mass: 0.8}});

export const Background: React.FC<{dark?: boolean}> = ({dark = false}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background: dark ? t.dark : t.paper, overflow: 'hidden'}}>
    <AbsoluteFill style={{opacity: dark ? 0.12 : 0.5, backgroundImage: `radial-gradient(${dark ? '#6c7d9c' : '#d9dfeb'} 1px, transparent 1px)`, backgroundSize: '32px 32px', backgroundPosition: `${Math.sin(f / 160) * 8}px ${f / 55}px`}} />
    {!dark && <>
      <div style={{position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: '#edf1fd', right: -330, top: -280}} />
      <div style={{position: 'absolute', width: 440, height: 440, borderRadius: '50%', border: '1px solid #e5eafb', left: -220, bottom: -200}} />
    </>}
  </AbsoluteFill>;
};

export const Brand: React.FC<{size?: number; text?: boolean; light?: boolean}> = ({size = 48, text = true, light = false}) => <div style={{display: 'flex', alignItems: 'center', gap: size * 0.24}}>
  <Img src={staticFile('branding/yana-mark.svg')} style={{width: size, height: size}} />
  {text && <span style={{fontSize: size * 0.7, fontWeight: 900, color: light ? t.white : t.ink, letterSpacing: '-0.035em'}}>Yana</span>}
</div>;

export const Chrome: React.FC<{dark?: boolean; section?: string}> = ({dark, section}) => <>
  <div style={{position: 'absolute', top: 44, left: 68}}><Brand light={dark} /></div>
  <div style={{position: 'absolute', right: 72, top: 59, color: dark ? '#aebcd2' : t.muted, fontSize: 23, fontWeight: 700}}>{section ?? 'AI do con người kiểm soát'}</div>
</>;

export const Reveal: React.FC<React.PropsWithChildren<{delay?: number; style?: React.CSSProperties}>> = ({children, delay = 0, style}) => {
  const f = useCurrentFrame();
  const v = pop(f, delay);
  return <div style={{opacity: ramp(f, delay, delay + 12), transform: `translateY(${(1 - v) * 40}px)`, ...style}}>{children}</div>;
};

export const Heading: React.FC<{children: React.ReactNode; style?: React.CSSProperties; size?: number}> = ({children, style, size = 84}) => <div style={{color: t.ink, fontWeight: 900, fontSize: size, lineHeight: 1.13, letterSpacing: '-0.035em', ...style}}>{children}</div>;

export const Note: React.FC<React.PropsWithChildren<{style?: React.CSSProperties}>> = ({children, style}) => <div style={{fontFamily: t.hand, fontSize: 34, color: t.muted, ...style}}>{children}</div>;

export const Pill: React.FC<React.PropsWithChildren<{color?: string; bg?: string; style?: React.CSSProperties}>> = ({children, color = t.ink, bg = t.white, style}) => <div style={{display: 'inline-flex', alignItems: 'center', gap: 12, background: bg, color, padding: '14px 24px', border: `1px solid ${t.line}`, borderRadius: 40, fontSize: 25, fontWeight: 700, ...style}}>{children}</div>;

export const IllustrationLabel: React.FC<{text?: string; dark?: boolean}> = ({text = 'Minh họa luồng hoạt động', dark}) => <div style={{position: 'absolute', left: 72, bottom: 38, fontSize: 32, color: dark ? '#e2e8f2' : '#53617b', background: dark ? '#283243' : '#edf1f8', borderRadius: 10, padding: '8px 16px', fontWeight: 700}}>{text}</div>;

export const Screenshot: React.FC<{home?: boolean; style?: React.CSSProperties; zoom?: number; origin?: string}> = ({home, style, zoom = 1, origin = 'center'}) => <div style={{borderRadius: 18, overflow: 'hidden', boxShadow: t.shadow, border: '1px solid #cbd4e5', background: t.dark, ...style}}>
  <Img src={staticFile(`stills/studio-${home ? 'home' : 'workspace'}.png`)} style={{display: 'block', width: '100%', transform: `scale(${zoom})`, transformOrigin: origin}} />
</div>;

export const Cursor: React.FC<{x: number; y: number; click?: number}> = ({x, y, click = 0}) => <div style={{position: 'absolute', left: x, top: y, transform: `scale(${1 - Math.min(click, 1) * 0.15})`, filter: 'drop-shadow(0 3px 5px #0003)', zIndex: 10}}>
  {click > 0 && click < 1 && <div style={{position: 'absolute', width: click * 100, height: click * 100, left: -click * 50 + 10, top: -click * 50 + 10, border: '3px solid #557bed', borderRadius: '50%', opacity: 1 - click}} />}
  <svg width="46" height="54" viewBox="0 0 32 38"><path d="M3 2 L27 23 L17 24 L13 34 L3 2Z" fill="#263253" stroke="white" strokeWidth="2.5" strokeLinejoin="round" /></svg>
</div>;

export const SceneWrap: React.FC<React.PropsWithChildren<{duration: number; offset?: number}>> = ({children, duration, offset = 0}) => {
  // Keep a visible background/brand at cuts; each scene animates its own content.
  return <AbsoluteFill style={{overflow: 'hidden', fontFamily: t.font}} data-duration={duration} data-source-offset={offset}>{children}</AbsoluteFill>;
};

export const ProgressLine: React.FC = () => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <div style={{position: 'absolute', bottom: 0, left: 0, height: 3, width: `${f / (durationInFrames - 1) * 100}%`, background: t.blue, opacity: 0.4}} />;
};
