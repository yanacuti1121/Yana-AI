import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Code2, MessageCircle, Terminal, ShieldCheck, FolderOpen, ArrowUpRight, Check} from 'lucide-react';
import {Background, Brand, Chrome, Heading, Note, Pill, Reveal, Screenshot, pop, ramp} from '../components';
import {theme as t} from '../theme';

const orbitItems = [
  {label: 'Dự án', Icon: FolderOpen, color: '#487be8', x: 270, y: 240, angle: -8},
  {label: 'Hội thoại', Icon: MessageCircle, color: '#dd78a5', x: 1360, y: 240, angle: 7},
  {label: 'Terminal', Icon: Terminal, color: '#408e79', x: 215, y: 700, angle: -5},
  {label: 'Quyền duyệt', Icon: ShieldCheck, color: '#e4a241', x: 1350, y: 690, angle: 6},
];

export const Intro: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  return <AbsoluteFill><Background /><Chrome />
    {orbitItems.map(({label, Icon, color, x, y, angle}, i) => {
      const a = pop(f, 8 + i * 5);
      return <div key={label} style={{position: 'absolute', left: x, top: y + Math.sin(f / 28 + i) * 6, opacity: ramp(f, 8 + i * 5, 24 + i * 5), transform: `translateY(${(1 - a) * 45}px) rotate(${angle}deg) scale(${0.85 + 0.15 * a})`, background: 'white', border: `1px solid ${t.line}`, borderRadius: 30, width: 250, padding: '26px 28px', boxShadow: '0 12px 35px #293d6410'}}>
        <Icon color={color} size={38} strokeWidth={1.8} /><div style={{fontSize: 29, fontWeight: 800, color: t.ink, marginTop: 12}}>{label}</div>
      </div>;
    })}
    <div style={{position: 'absolute', left: 430, top: 205, width: 1060, textAlign: 'center'}}>
      <div style={{display: 'flex', justifyContent: 'center', transform: `translateY(${(1 - pop(f)) * 40}px) scale(${0.85 + pop(f) * 0.15})`}}><Brand size={142} text={false} /></div>
      <div style={{opacity: ramp(f, 12, 28), transform: `translateY(${(1 - pop(f, 12)) * 30}px)`, marginTop: 38}}>
        <Heading size={105}>AI làm việc.<br /><span style={{background: 'linear-gradient(100deg,#ec9b40,#e66c70,#ca50b8)', WebkitBackgroundClip: 'text', color: 'transparent'}}>Bạn giữ quyền.</span></Heading>
        <svg width="760" height="32" style={{marginTop: 4}}><path d="M18 18 Q350 1 740 19" fill="none" stroke={t.blue} strokeWidth="5" strokeLinecap="round" strokeDasharray="740" strokeDashoffset={740 * (1 - ramp(f, 38, 65))} /></svg>
      </div>
      <div style={{fontSize: 29, color: t.muted, marginTop: 30, opacity: ramp(f, 55, 72)}}>Không gian làm việc AI, dưới sự kiểm soát của bạn.</div>
    </div>
  </AbsoluteFill>;
};

export const Workspace: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  return <AbsoluteFill><Background /><Chrome section="Yana Studio" />
    <Reveal style={{position: 'absolute', left: 100, top: 240, width: 500}}>
      <Pill color={t.blue} bg="#eff3ff"><Code2 size={25} />Không gian làm việc</Pill>
      <Heading style={{marginTop: 32}} size={78}>Mọi thứ.<br />Cùng một nơi.</Heading>
      <div style={{fontSize: 30, color: t.muted, marginTop: 30, lineHeight: 1.6}}>Code đang mở.<br />Ngữ cảnh đang có.<br />Yana ở ngay bên cạnh.</div>
      <Note style={{marginTop: 36, transform: 'rotate(-4deg)'}}>Ít chuyển cửa sổ hơn ↗</Note>
    </Reveal>
    <div style={{position: 'absolute', left: 650, top: 175, width: 1190, transform: `perspective(1800px) rotateY(${-7 + ramp(f, 0, 190) * 5}deg) rotateX(2deg) translateY(${(1 - pop(f, 10)) * 60}px)`}}>
      <Screenshot />
      <div style={{display: 'flex', gap: 16, marginTop: 24, justifyContent: 'center'}}>{['Editor', 'Dự án', 'Yana AI'].map((s, i) => <div key={s} style={{opacity: ramp(f, 25 + i * 12, 40 + i * 12)}}><Pill><Check size={22} color={t.mint} />{s}</Pill></div>)}</div>
    </div>
    <div style={{position: 'absolute', left: 104, bottom: 58, fontSize: 22, color: t.muted}}>Ảnh giao diện Studio từ mã nguồn dự án</div>
  </AbsoluteFill>;
};

export const Outro: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  return <AbsoluteFill><Background />
    <div style={{position: 'absolute', left: 135, top: 125, transform: `translateY(${(1 - pop(f)) * 50}px)`, opacity: ramp(f, 0, 18)}}><Brand size={116} /></div>
    <div style={{position: 'absolute', left: 140, top: 300, width: 1200, opacity: ramp(f, 10, 30), transform: `translateY(${(1 - pop(f, 10)) * 36}px)`}}>
      <Heading size={116}>AI làm việc.<br /><span style={{color: t.blue}}>Bạn giữ quyền.</span></Heading>
      <div style={{marginTop: 40, fontSize: 34, color: t.muted}}>Cùng Yana, làm việc với AI theo cách của bạn.</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 28, marginTop: 58, opacity: ramp(f, 35, 55)}}>
        <div style={{background: t.ink, color: 'white', padding: '22px 32px', borderRadius: 44, fontSize: 30, fontWeight: 800, display: 'flex', gap: 20, alignItems: 'center'}}>Khám phá Yana <ArrowUpRight size={30} /></div>
        <div style={{fontSize: 36, fontWeight: 800, color: t.ink}}>yana.vutam.link</div>
      </div>
    </div>
    <div style={{position: 'absolute', right: 145, top: 250, width: 300, height: 440, borderRadius: 160, background: '#eaf0ff', transform: `rotate(13deg) translateY(${Math.sin(f / 45) * 8}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><ShieldCheck size={155} color={t.blue} strokeWidth={1.3} /></div>
    <Note style={{position: 'absolute', right: 140, top: 750, transform: 'rotate(-6deg)', fontSize: 38}}>Quyết định vẫn là của bạn.</Note>
    <div style={{position: 'absolute', left: 140, bottom: 75, color: t.muted, fontSize: 24}}>Yana Studio · Yana Runtime · Mã nguồn có thể khám phá</div>
  </AbsoluteFill>;
};
