import React from 'react';
import {Img, staticFile} from 'remotion';
import {ArrowUp, Check, ChevronDown, ChevronRight, FileCode2, Folder, GitBranch, MessageSquare, MoreHorizontal, Plus, Search, ShieldCheck, Terminal, X} from 'lucide-react';
import {bound, linear, tween, typing} from './motion-state';

export const ui = {bg: '#10151e', raised: '#171e2a', panel: '#1d2635', line: '#2b3547', text: '#dce5f4', muted: '#8a9ab4', blue: '#789aff', green: '#77d7b0', amber: '#e7bd72', font: 'Nunito, sans-serif', mono: 'ui-monospace, Menlo, monospace'};
export const box: React.CSSProperties = {position: 'absolute', boxSizing: 'border-box'};

export const FileTree: React.FC<{f: number}> = ({f}) => {
  const files = ['demo-project', 'src', 'main.ts', 'app.tsx', 'styles.css', 'package.json', 'README.md'];
  return <div style={{...box, left: 58, top: 92, bottom: 30, width: 242, borderRight: `1px solid ${ui.line}`, padding: '24px 12px', overflow: 'hidden'}}>
    <div style={{fontSize: 17, fontWeight: 800, letterSpacing: '0.08em', color: ui.muted, display: 'flex', justifyContent: 'space-between', margin: '0 12px 22px'}}>EXPLORER<MoreHorizontal size={20} /></div>
    <div style={{height: 38, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', background: ui.raised, border: `1px solid ${f > 145 && f < 185 ? ui.blue : ui.line}`, borderRadius: 8, padding: '0 12px', fontSize: 18, color: ui.muted}}><Search size={17} />{f < 185 ? typing(f, 145, 173, 'main') : 'Tìm tệp…'}</div>
    {files.map((name, i) => <div key={name} style={{height: 38, paddingLeft: i > 1 && i < 5 ? 34 : i === 1 ? 18 : 8, display: 'flex', alignItems: 'center', gap: 9, color: i === 2 && f > 180 ? '#f1f4ff' : ui.muted, background: i === 2 && f > 180 ? '#263858' : 'transparent', borderRadius: 6, fontSize: 18, opacity: tween(f, 130 + i * 3, 145 + i * 3, 0, 1)}}>{i < 2 ? <><ChevronDown size={14} /><Folder size={18} color="#d3b47f" /></> : <FileCode2 size={17} color={i === 2 || i === 3 ? '#86b5eb' : '#b3bbcd'} />}{name}</div>)}
    <div style={{marginTop: 45, borderTop: `1px solid ${ui.line}`, padding: '20px 10px', fontSize: 17, color: ui.muted}}><div style={{display: 'flex', gap: 9, alignItems: 'center'}}><GitBranch size={18} />main</div><div style={{marginTop: 15, color: ui.green}}>Workspace đang mở</div></div>
  </div>;
};

const baseCode = [
  "import { createWorkspace } from './workspace';", "import { Policy } from './policy';", '',
  'const workspace = createWorkspace({', "  name: 'Demo project',", "  root: './demo-project',", '  policy: Policy.supervised(),', '});', '',
  'export async function start() {', '  const project = await workspace.open();', '',
  '  // Đọc ngữ cảnh trước khi hành động.', '  const context = await project.readContext();', '  const proposal = await project.plan(context);', '',
  '  if (proposal.needsApproval) {', '    await workspace.requestApproval(proposal);', '  }', '',
  '  return workspace.execute(proposal);', '}', '',
  '// Mỗi hành động đều có phạm vi riêng.', 'export const capabilities = [', "  'read_file',", "  'write_file',", "  'run_command',", '];', '',
  'export const settings = {', "  language: 'vi',", "  evidence: 'required',", '  keepHumanInControl: true,', '};',
];
function Syntax({line}: {line: string}) {
  const parts = line.split(/('.*?'|\b(?:import|from|const|export|async|function|await|if|return|true)\b|\/\/.*)/g);
  return <>{parts.map((part, i) => <span key={i} style={{color: part.startsWith('//') ? '#72839f' : part.startsWith("'") ? '#99c890' : /^(import|from|const|export|async|function|await|if|return|true)$/.test(part) ? '#bb9de2' : '#d5dfef'}}>{part}</span>)}</>;
}

export const CodePane: React.FC<{f: number}> = ({f}) => {
  if (f < 180) return <div style={{...box, left: 300, top: 92, width: 748, height: 698, borderRight: `1px solid ${ui.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: ui.muted}}><Folder size={80} strokeWidth={1} color="#536d9a" /><div style={{fontSize: 29, fontWeight: 800, marginTop: 28}}>Dự án đã ở đây.</div><div style={{fontSize: 21, marginTop: 14}}>Chọn main.ts để bắt đầu.</div></div>;
  const scroll = tween(f, 565, 635, 0, 235);
  const active = f < 475 ? 4 : f < 530 ? 13 : 17;
  return <div style={{...box, left: 300, top: 92, width: 748, height: 698, borderRight: `1px solid ${ui.line}`, overflow: 'hidden'}}>
    <div style={{height: 46, background: '#111721', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${ui.line}`}}><div style={{height: 46, display: 'flex', alignItems: 'center', gap: 12, padding: '0 25px', background: ui.raised, borderTop: `2px solid ${ui.blue}`, fontSize: 19}}><FileCode2 size={18} color={ui.blue} />main.ts<X size={16} color={ui.muted} /></div><div style={{fontSize: 18, color: ui.muted, marginLeft: 22}}>workspace.ts</div></div>
    <div style={{height: 35, padding: '8px 22px', fontSize: 16, color: ui.muted}}>demo-project <ChevronRight size={13} /> src <ChevronRight size={13} /> main.ts</div>
    <div style={{position: 'relative', overflow: 'hidden', height: 613}}>
      <div style={{transform: `translateY(${-scroll}px)`, paddingTop: 16}}>{baseCode.map((line, i) => <div key={i} style={{display: 'flex', height: 30, background: f > 455 && f < 645 && i === active ? '#283b604f' : 'transparent', fontFamily: ui.mono, fontSize: 17, lineHeight: '30px', whiteSpace: 'pre'}}><span style={{width: 55, textAlign: 'right', paddingRight: 20, flexShrink: 0, color: '#657691'}}>{i + 1}</span><span><Syntax line={line} /></span></div>)}</div>
      <div style={{...box, right: 7, top: scroll / 2, width: 4, height: 175, borderRadius: 4, background: '#5f718d'}} />
    </div>
    {f > 250 && f < 320 && <div style={{...box, right: 20, bottom: 24, padding: '12px 18px', borderRadius: 10, background: '#253d35', color: ui.green, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, opacity: tween(f, 250, 265)}}><Check size={18} />main.ts đã mở</div>}
  </div>;
};

const assistantText = 'Mình sẽ đọc cấu trúc dự án trước, rồi giải thích luồng xử lý.\n\n1. Mở workspace và đọc ngữ cảnh.\n2. Kiểm tra policy của hành động.\n3. Chờ bạn duyệt nếu cần quyền.\n4. Tiếp tục trong phạm vi cho phép.';
export const ChatPane: React.FC<{f: number}> = ({f}) => {
  const first = 'Giải thích luồng xử lý trong main.ts giúp tôi.';
  const second = 'Chạy bộ kiểm tra của dự án này.';
  const sent = f >= 425;
  const secondSent = f >= 748;
  const approved = f >= 900;
  const input = f >= 675 && !secondSent ? typing(f, 680, 735, second) : !sent ? typing(f, 340, 405, first) : '';
  const scroll = tween(f, 700, 770, 0, 220) + tween(f, 910, 940, 0, 60);
  return <div style={{...box, left: 1048, top: 92, width: 552, height: 698, background: '#141b27', overflow: 'hidden'}}>
    <div style={{height: 56, borderBottom: `1px solid ${ui.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px'}}><div style={{display: 'flex', gap: 11, alignItems: 'center', fontSize: 21, fontWeight: 800}}><Img src={staticFile('branding/yana-mark.svg')} style={{width: 27, height: 27}} />Yana AI</div><div style={{color: ui.green, fontSize: 16}}>● SUPERVISED</div></div>
    <div style={{...box, left: 22, right: 22, top: 76, height: 500, overflow: 'hidden'}}>
      <div style={{transform: `translateY(${-scroll}px)`}}>
        <div style={{height: 98, opacity: tween(f, 425, 435), transform: `translateY(${tween(f, 425, 440, 12, 0)}px)`}}><div style={{background: '#26334e', borderRadius: '14px 14px 3px 14px', padding: '18px 20px', fontSize: 21, lineHeight: 1.5}}>{first}</div></div>
        <div style={{height: 48, display: 'flex', gap: 9, alignItems: 'center', fontSize: 18, color: ui.green, opacity: tween(f, 440, 450)}}><Check size={18} /><span style={{fontFamily: ui.mono}}>read_file</span><span style={{color: ui.muted}}>src/main.ts</span><span style={{marginLeft: 'auto', fontSize: 15}}>ALLOW</span></div>
        <div style={{height: 218, fontSize: 20, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: '#d9e3f2'}}>{typing(f, 455, 550, assistantText)}{f > 455 && f < 550 && <span style={{color: ui.blue, opacity: Math.floor(f / 8) % 2 ? 0 : 1}}>▌</span>}</div>
        <div style={{height: 96, opacity: tween(f, 748, 760), paddingTop: 16}}><div style={{background: '#26334e', borderRadius: '14px 14px 3px 14px', padding: '16px 20px', fontSize: 21, lineHeight: 1.5}}>{second}</div></div>
        <div style={{height: 228, border: `1px solid ${approved ? '#4b9a78' : '#9f7d44'}`, borderRadius: 16, background: approved ? '#20372e' : '#302b21', padding: '18px 20px', opacity: tween(f, 775, 792), transform: `translateY(${tween(f, 775, 795, 18, 0)}px)`}}>
          <div style={{fontSize: 21, fontWeight: 800, color: approved ? ui.green : ui.amber, display: 'flex', alignItems: 'center', gap: 9}}><ShieldCheck size={23} />{approved ? 'Bạn đã cho phép' : 'Yana cần bạn phê duyệt'}</div>
          <div style={{marginTop: 15, background: '#11161d', padding: '15px 17px', borderRadius: 9, fontFamily: ui.mono, fontSize: 24}}><span style={{color: ui.muted}}>$ </span>npm test</div>
          <div style={{fontSize: 17, color: '#c8bd9f', marginTop: 12}}>Phạm vi: ./demo-project</div>
          <div style={{display: 'flex', gap: 12, marginTop: 16}}><div style={{flex: 1, background: approved ? '#4d9c77' : '#416d59', textAlign: 'center', borderRadius: 9, padding: '11px 0', fontSize: 20, fontWeight: 800, transform: `scale(${1 - Math.sin(bound((f - 895) / 12) * Math.PI) * 0.04})`}}>{approved ? '✓ Đã cho phép' : 'Cho phép'}</div><div style={{flex: 1, textAlign: 'center', borderRadius: 9, border: '1px solid #725b5c', padding: '11px 0', color: '#e4c1bd', fontSize: 20}}>Từ chối</div></div>
        </div>
        <div style={{marginTop: 16, opacity: tween(f, 920, 935), color: ui.green, fontSize: 20, display: 'flex', gap: 9}}><Check size={21} />Tiếp tục theo quyết định của bạn.</div>
      </div>
    </div>
    <div style={{...box, left: 18, right: 18, bottom: 15, height: 94, border: `1px solid ${input ? '#6989d2' : '#39465b'}`, background: '#192334', borderRadius: 15, padding: '16px 50px 12px 17px', fontSize: 20, lineHeight: 1.45, color: input ? '#ecf1fb' : ui.muted}}>{input || 'Giao việc cho Yana…'}{input && <span style={{opacity: Math.floor(f / 8) % 2 ? 0 : 1}}>▌</span>}<div style={{...box, right: 12, bottom: 12, borderRadius: 10, padding: 9, background: input ? '#6287ee' : '#344767'}}><ArrowUp size={23} color="white" /></div></div>
  </div>;
};
