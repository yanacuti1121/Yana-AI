import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame} from 'remotion';
import {ArrowUpRight, Check, ChevronDown, Code2, FileCode2, FolderOpen, GitBranch, LayoutDashboard, ListChecks, LockKeyhole, MessageSquare, MoreHorizontal, Search, ShieldCheck, Sparkles, Terminal} from 'lucide-react';
import {cameraAt, captions, clicks, panelEnteredAt, pointerAt, tabAt, teaserTime, tween, typing} from './motion-state';
import {ChatPane, CodePane, FileTree, box, ui} from './studio-workspace';
import {AuditPanel, ModelsPanel, TasksPanel, TerminalPanel} from './studio-panels';
import {theme} from './theme';
import {designFrameAt} from './playback';
import {RealAppStage, realCaptionAt, realCameraAt} from './real-app-stage';

const nav = [{id: 'code', label: 'Workspace', Icon: Code2}, {id: 'terminal', label: 'Terminal', Icon: Terminal}, {id: 'audit', label: 'Audit', Icon: ShieldCheck}, {id: 'models', label: 'Models', Icon: Sparkles}, {id: 'tasks', label: 'Tasks', Icon: ListChecks}];

const MotionCursor: React.FC<{f: number}> = ({f}) => {
  const p = pointerAt(f);
  const event = clicks.find(c => f >= c - 4 && f < c + 18);
  const squash = f >= 1790 && f < 1835 ? 0.88 : event === undefined ? 1 : 1 - Math.sin(tween(f, event - 4, event + 8) * Math.PI) * 0.2;
  const ripple = event === undefined ? 0 : tween(f, event, event + 18);
  return <div style={{...box, left: p.x, top: p.y, zIndex: 30, transform: `scale(${squash})`, opacity: tween(f, 125, 145) * tween(f, 1905, 1915, 1, 0)}}>
    {ripple > 0 && ripple < 1 && <div style={{...box, width: 90 * ripple, height: 90 * ripple, border: '2px solid #b2c8ff', borderRadius: '50%', left: -45 * ripple + 8, top: -45 * ripple + 8, opacity: 1 - ripple}} />}
    <svg width="34" height="42" viewBox="0 0 32 40" style={{filter: 'drop-shadow(0 3px 4px #0008)'}}><path d="M3 2 L27 24 L17 25 L13 36 Z" fill="#eaf0ff" stroke="#142033" strokeWidth="2" strokeLinejoin="round" /></svg>
  </div>;
};

const AppShell: React.FC<{f: number}> = ({f}) => {
  const active = tabAt(f);
  const entered = panelEnteredAt(f);
  return <div style={{...box, width: 1600, height: 820, color: ui.text, background: ui.bg, border: '1px solid #43516b', borderRadius: 22, overflow: 'hidden', boxShadow: '0 38px 100px #24365a44, 0 3px 12px #1c2b4530', fontFamily: ui.font}}>
    <div style={{...box, left: 0, top: 0, width: 1600, height: 42, background: '#1c2534', borderBottom: `1px solid ${ui.line}`, display: 'flex', alignItems: 'center', padding: '0 18px'}}>
      <div style={{display: 'flex', gap: 9}}>{['#fa6c66', '#efc252', '#63c985'].map(c => <div key={c} style={{width: 12, height: 12, borderRadius: '50%', background: c}} />)}</div>
      <div style={{position: 'absolute', width: '100%', left: 0, textAlign: 'center', fontSize: 16, color: '#a7b6d0'}}>Yana Studio — demo-project</div><div style={{marginLeft: 'auto', display: 'flex', gap: 18, color: ui.muted}}><LayoutDashboard size={19} /><MoreHorizontal size={21} /></div>
    </div>
    <div style={{...box, left: 0, top: 42, width: 1600, height: 50, borderBottom: `1px solid ${ui.line}`, display: 'flex', alignItems: 'center', background: '#121a27'}}><div style={{width: 300, paddingLeft: 19, display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, fontSize: 19}}><Img src={staticFile('branding/yana-mark.svg')} style={{width: 29, height: 29}} />Yana Studio</div>{nav.map(({id, label, Icon}) => <div key={id} style={{width: 150, height: 50, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 9, color: active === id ? '#d7e4ff' : ui.muted, background: active === id ? '#253b61' : 'transparent', fontSize: 18, fontWeight: active === id ? 800 : 700}}><Icon size={19} />{label}{active === id && <div style={{position: 'absolute', bottom: 0, height: 2, background: ui.blue, width: 100}} />}</div>)}<div style={{marginLeft: 'auto', marginRight: 22, color: ui.green, fontSize: 16, display: 'flex', alignItems: 'center', gap: 7}}><ShieldCheck size={18} />SUPERVISED</div></div>
    <div style={{...box, left: 0, width: 58, top: 92, bottom: 30, borderRight: `1px solid ${ui.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, paddingTop: 24, color: ui.muted}}><FileCode2 size={25} color={ui.blue} /><Search size={24} /><GitBranch size={25} /><MessageSquare size={24} /><ListChecks size={24} /><div style={{marginTop: 'auto', marginBottom: 18}}><LockKeyhole size={23} /></div></div>
    <FileTree f={f} />
    {active === 'code' ? <><CodePane f={f} /><ChatPane f={f} /></> : <div style={{...box, left: 300, top: 92, width: 1300, height: 698, overflow: 'hidden'}}><div style={{...box, inset: 0, opacity: tween(f, entered, entered + 10, 0.3, 1), transform: `translateX(${tween(f, entered, entered + 16, 42, 0)}px)`}}>{active === 'audit' ? <AuditPanel f={f} /> : active === 'models' ? <ModelsPanel f={f} /> : active === 'terminal' ? <TerminalPanel f={f} /> : <TasksPanel f={f} />}</div></div>}
    <div style={{...box, left: 0, bottom: 0, width: 1600, height: 30, background: '#1e304d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', fontSize: 14, color: '#b7c8e6'}}><div style={{display: 'flex', alignItems: 'center', gap: 12}}><GitBranch size={15} />main<span style={{marginLeft: 12}}>Yana Runtime</span><span style={{color: '#a5d8c1'}}>● Quyền do bạn kiểm soát</span></div><div>UTF-8 · TypeScript · ./demo-project</div></div>
    <MotionCursor f={f} />
  </div>;
};

const Intro: React.FC<{f: number}> = ({f}) => {
  const exit = tween(f, 93, 125);
  const cards = [{name: 'Code', Icon: Code2, x: 400, y: 275, c: '#698df0'}, {name: 'Chat', Icon: MessageSquare, x: 1370, y: 280, c: '#d780b5'}, {name: 'Terminal', Icon: Terminal, x: 360, y: 715, c: '#69ad99'}, {name: 'Quyền duyệt', Icon: ShieldCheck, x: 1340, y: 720, c: '#e5aa4c'}];
  return <div style={{...box, inset: 0, opacity: 1 - exit, transform: `translateY(${-exit * 130}px) scale(${1 - exit * 0.3})`}}>
    {cards.map(({name, Icon, x, y, c}, i) => {const entry = tween(f, 4 + i * 7, 38 + i * 7);const angle = (i % 2 ? 1 : -1) * (10 - entry * 5);return <div key={name} style={{...box, left: x, top: y, transform: `translate(${(1 - entry) * (i % 2 ? 350 : -350)}px, ${(1 - entry) * 120}px) rotate(${angle}deg) scale(${0.5 + entry * 0.5})`, opacity: entry, width: 190, height: 145, border: '1px solid #e2e8f3', borderRadius: 29, background: 'white', boxShadow: '0 22px 42px #3c4e7b17', padding: '25px 27px'}}><Icon size={37} strokeWidth={1.7} color={c} /><div style={{fontSize: 24, fontWeight: 800, marginTop: 13, color: theme.ink}}>{name}</div></div>;})}
    <div style={{...box, top: 295, left: 570, width: 780, textAlign: 'center'}}><div style={{display: 'flex', justifyContent: 'center', transform: `scale(${tween(f, 5, 32, 0.3, 1)}) rotate(${tween(f, 5, 32, -12, 0)}deg)`}}><Img src={staticFile('branding/yana-mark.svg')} style={{width: 140, height: 140, filter: 'drop-shadow(0 12px 20px #4a60852a)'}} /></div><div style={{fontSize: 100, fontWeight: 900, color: theme.ink, letterSpacing: '-0.04em', marginTop: 32}}>{typing(f, 18, 43, 'Gặp Yana.')}<span style={{opacity: f < 52 && Math.floor(f / 7) % 2 === 0 ? 1 : 0, fontWeight: 400, color: theme.blue}}>|</span></div><div style={{fontSize: 34, color: '#67738d', transform: `translateY(${tween(f, 48, 68, 24, 0)}px)`, opacity: tween(f, 48, 68)}}>AI làm việc. <span style={{color: theme.blue, fontWeight: 800}}>Bạn giữ quyền.</span></div></div>
  </div>;
};

const EndCard: React.FC<{f: number}> = ({f}) => {
  const enter = tween(f, 2048, 2080);
  return <div style={{...box, inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 45}px)`}}>
    <div style={{...box, left: 270, top: 260, display: 'flex', alignItems: 'center', gap: 26}}><Img src={staticFile('branding/yana-mark.svg')} style={{width: 116, height: 116}} /><div style={{fontSize: 80, fontWeight: 900, letterSpacing: '-0.04em', color: theme.ink}}>Yana</div></div>
    <div style={{...box, left: 270, top: 420, fontSize: 103, lineHeight: 1.15, fontWeight: 900, color: theme.ink, letterSpacing: '-0.035em'}}>AI làm việc.<br /><span style={{color: theme.blue}}>Bạn giữ quyền.</span></div>
    <div style={{...box, left: 275, top: 735, display: 'flex', alignItems: 'center', gap: 28, opacity: tween(f, 2080, 2100), transform: `translateY(${tween(f, 2080, 2100, 22, 0)}px)`}}><div style={{padding: '20px 29px', borderRadius: 40, color: 'white', background: theme.ink, fontSize: 29, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 16}}>Khám phá Yana<ArrowUpRight size={30} /></div><span style={{fontSize: 34, fontWeight: 800, color: theme.ink}}>yana.vutam.link</span></div>
    <div style={{...box, right: 280, top: 330, width: 330, height: 390, background: '#e7edfc', borderRadius: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${tween(f, 2048, 2090, -20, 8)}deg) scale(${0.7 + enter * 0.3})`}}><ShieldCheck size={170} strokeWidth={1.3} color={theme.blue} /></div>
  </div>;
};

export const KineticFrame: React.FC<{f: number; hideFootnote?: boolean; actual?: boolean}> = ({f, hideFootnote = false, actual = false}) => {
  const pose = actual ? realCameraAt(f) : cameraAt(f);
  const caption = actual ? realCaptionAt(f) : captions.find(c => f >= c[0] && f < c[1]);
  return <AbsoluteFill style={{fontFamily: theme.font, background: '#f4f6fc', overflow: 'hidden'}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 18% 75%, #f8e8e6 0, transparent 55%), radial-gradient(ellipse at 82% 20%, #dce7ff 0, transparent 60%), #f5f7fc'}} />
    <div style={{...box, left: 65, top: 36, display: 'flex', alignItems: 'center', gap: 12, opacity: tween(f, 2020, 2070, 1, 0)}}><Img src={staticFile('branding/yana-mark.svg')} style={{width: 37, height: 37}} /><span style={{fontSize: 27, fontWeight: 900, color: theme.ink}}>Yana</span></div>
    {f < 130 && <Intro f={f} />}
    {f >= 95 && f < 2080 && <div style={{...box, left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${pose.x}px, ${pose.y}px) perspective(2200px) rotateY(${pose.tilt}deg) scale(${pose.scale})`, opacity: tween(f, 95, 125) * tween(f, 2040, 2075, 1, 0)}}>{actual ? <RealAppStage f={f} /> : <AppShell f={f} />}</div>}
    {caption && <div style={{...box, left: 280, right: 280, top: 33, display: 'flex', justifyContent: 'center', opacity: Math.min(tween(f, caption[0], caption[0] + 10), tween(f, caption[1] - 8, caption[1], 1, 0)), transform: `translateY(${tween(f, caption[0], caption[0] + 12, 16, 0)}px)`}}><div style={{padding: '12px 25px', background: '#ffffffee', border: '1px solid #e1e6f0', borderRadius: 40, boxShadow: '0 9px 22px #283a5812', color: theme.ink, fontSize: 34, fontWeight: 900, whiteSpace: 'nowrap'}}>{caption[2]}</div></div>}
    {!hideFootnote && f >= 95 && f < 2080 && <div style={{...box, left: 50, bottom: 20, padding: '8px 16px', borderRadius: 11, background: '#f5f7fce8', color: '#59677f', fontSize: 32, fontWeight: 700}}>Demo dựng lại · thao tác và dữ liệu minh họa</div>}
    {f >= 2048 && <EndCard f={f} />}
  </AbsoluteFill>;
};

export const KineticVideo: React.FC<{teaser?: boolean; fast?: boolean; mute?: boolean}> = ({teaser = false, fast = false, mute = false}) => {
  const frame = useCurrentFrame();
  const seconds = frame / 60;
  const f = fast ? designFrameAt(frame, teaser) : (teaser ? teaserTime(seconds) : seconds) * 30;
  return <AbsoluteFill><KineticFrame f={f} hideFootnote={fast} actual={fast} />{!mute && <Audio src={staticFile(`audio/${teaser ? 'teaser' : 'main'}-v2.mp3`)} />}</AbsoluteFill>;
};
