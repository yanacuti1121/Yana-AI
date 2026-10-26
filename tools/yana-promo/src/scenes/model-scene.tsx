import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Cloud, Cpu, ShieldCheck} from 'lucide-react';
import {Background, Brand, Chrome, Heading, IllustrationLabel, Note, Pill, Reveal, pop, ramp} from '../components';
import {theme as t} from '../theme';

export const Models: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  return <AbsoluteFill><Background /><Chrome section="Model cloud và local" />
    <Reveal style={{position: 'absolute', left: 110, top: 165}}><Heading size={88}>Đổi model.<span style={{color: t.blue}}> Giữ quyền.</span></Heading><div style={{fontSize: 31, color: t.muted, marginTop: 24}}>Chọn nguồn trí tuệ phù hợp với cách bạn làm việc.</div></Reveal>
    <svg width="1920" height="1080" style={{position: 'absolute', inset: 0}}>
      {[500, 730].map((y, i) => <path key={y} d={`M670 ${y} C790 ${y} 800 635 940 635 M980 635 C1110 635 1120 ${y} 1250 ${y}`} fill="none" stroke={i ? '#d3b5dc' : '#b7c9ef'} strokeWidth="3" strokeDasharray="8 12" strokeDashoffset={-f * 1.2} opacity={ramp(f, 20, 45)} />)}
    </svg>
    {[{x: 160, title: 'Cloud', Icon: Cloud, color: t.blue, names: ['Claude', 'GPT', 'Gemini'], caption: 'Kết nối qua provider được hỗ trợ'}, {x: 1260, title: 'Local', Icon: Cpu, color: t.mint, names: ['Ollama', 'LM Studio', 'llama.cpp'], caption: 'Model chạy ngay trên máy'}].map(({x, title, Icon, color, names, caption}, j) => <div key={title} style={{position: 'absolute', left: x, top: 435, width: 500, background: 'white', border: `1px solid ${t.line}`, borderRadius: 30, padding: 34, boxShadow: t.shadow, opacity: ramp(f, 18 + j * 12, 38 + j * 12), transform: `translateY(${(1 - pop(f, 18 + j * 12)) * 40}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 20, color, fontSize: 38, fontWeight: 900}}><Icon size={43} strokeWidth={1.6} />{title}</div>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28}}>{names.map((s, i) => <Pill key={s} style={{fontSize: 25, padding: '10px 20px', opacity: ramp(f, 40 + i * 15, 57 + i * 15)}}>{s}</Pill>)}</div>
      <div style={{marginTop: 28, fontSize: 23, color: t.muted}}>{caption}</div>
    </div>)}
    <div style={{position: 'absolute', left: 844, top: 518, width: 232, height: 232, background: '#eef2fe', border: '1px solid #dce4fb', borderRadius: 65, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pop(f, 5)})`, boxShadow: '0 18px 50px #344b7e14'}}><Brand size={145} text={false} /></div>
    <div style={{position: 'absolute', top: 840, left: 565, opacity: ramp(f, 135, 158)}}><Pill color={t.ink} bg="#f0f3fb" style={{fontSize: 30, padding: '18px 30px'}}><ShieldCheck size={32} color={t.blue} />Quyền thực thi vẫn đi qua Yana.</Pill></div>
    <IllustrationLabel text="Minh họa kết nối model · không phải thao tác chuyển model trực tiếp" />
  </AbsoluteFill>;
};
