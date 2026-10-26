import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ArrowRight, Check, CheckCheck, FileCode2, FolderOpen, MessageCircle, Pause, Play, ShieldCheck, Terminal, X, Eye} from 'lucide-react';
import {Background, Brand, Chrome, Cursor, Heading, IllustrationLabel, Note, Pill, Reveal, Screenshot, pop, ramp} from '../components';
import {theme as t} from '../theme';

export const Context: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  const active = Math.min(2, Math.floor(f / 100));
  return <AbsoluteFill><Background /><Chrome section="Làm việc cùng ngữ cảnh" />
    <Reveal style={{position: 'absolute', left: 100, top: 160}}><Heading size={80}>Hiểu code.<span style={{color: t.blue}}> Hiểu ngữ cảnh.</span></Heading></Reveal>
    <div style={{position: 'absolute', left: 100, top: 320, width: 1080, height: 670, overflow: 'hidden', borderRadius: 22, boxShadow: t.shadow, background: t.dark, transform: `translateY(${(1 - pop(f, 10)) * 30}px)`}}>
      <Screenshot style={{width: 1420, border: 0, boxShadow: 'none', borderRadius: 0, transform: `translate(${-105 - ramp(f, 20, 300) * 30}px, -15px)`}} />
      <div style={{position: 'absolute', inset: 0, border: '2px solid #ffffff25', borderRadius: 22}} />
    </div>
    <div style={{position: 'absolute', left: 1260, top: 340, width: 570}}>
      {[
        {Icon: FolderOpen, title: 'Mở dự án của bạn', text: 'Code và tệp ở cùng một nơi.'},
        {Icon: FileCode2, title: 'Đọc đúng ngữ cảnh', text: 'Theo sát file đang làm việc.'},
        {Icon: MessageCircle, title: 'Trao đổi với Yana', text: 'Ngay bên cạnh editor.'},
      ].map(({Icon, title, text}, i) => <div key={title} style={{display: 'flex', alignItems: 'flex-start', gap: 22, marginBottom: 50, opacity: f > 20 + i * 65 ? (active === i ? 1 : 0.6) : 0, transform: `translateX(${(1 - pop(f, 20 + i * 65)) * 40}px)`}}>
        <div style={{padding: 18, borderRadius: 20, background: active === i ? '#e7edff' : '#edf0f6', color: active === i ? t.blue : t.muted}}><Icon size={32} strokeWidth={1.8} /></div>
        <div><div style={{fontSize: 32, fontWeight: 900, color: t.ink}}>{title}</div><div style={{fontSize: 25, color: t.muted, marginTop: 12}}>{text}</div></div>
      </div>)}
      <Note style={{marginTop: 20, transform: 'rotate(-4deg)'}}>Không rời mạch suy nghĩ.</Note>
    </div>
    <div style={{position: 'absolute', left: 124, bottom: 104, padding: '12px 22px', borderRadius: 14, background: '#242c3e', color: '#d5ddef', fontSize: 23}}>Ảnh giao diện từ dự án · phóng gần để minh họa</div>
  </AbsoluteFill>;
};

export const Approval: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  const approved = f >= 285;
  const asking = f >= 80;
  const click = ramp(f, 280, 300);
  const text = 'Chạy bộ kiểm tra của dự án này.';
  return <AbsoluteFill><Background /><Chrome section="Bạn nắm quyền quyết định" />
    <Reveal style={{position: 'absolute', left: 100, top: 230, width: 570}}>
      <Pill color={approved ? t.mint : '#9c6925'} bg={approved ? '#eaf6ef' : '#fff3db'}>{approved ? <ShieldCheck size={25} /> : <Pause size={25} />}{approved ? 'Bạn đã quyết định' : 'Có bước cần bạn duyệt'}</Pill>
      <Heading size={89} style={{marginTop: 32}}>Cần quyền?<br /><span style={{color: t.blue}}>Yana chờ bạn.</span></Heading>
      <div style={{fontSize: 30, lineHeight: 1.6, color: t.muted, marginTop: 35}}>Xem yêu cầu.<br />Chọn cho phép hoặc từ chối.<br />Rồi mới tiếp tục.</div>
      <Note style={{marginTop: 38, transform: 'rotate(-4deg)'}}>Một cú bấm. Một quyết định. ↗</Note>
    </Reveal>
    <div style={{position: 'absolute', top: 180, left: 790, width: 1020, height: 740, borderRadius: 32, background: t.dark, boxShadow: '0 35px 90px #24305c2b', color: '#e9edf6', overflow: 'hidden', transform: `translateY(${(1 - pop(f, 8)) * 45}px)`}}>
      <div style={{height: 92, borderBottom: '1px solid #ffffff12', padding: '22px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}><Brand size={42} light /><Pill color="#9cdbbe" bg="#243d36" style={{fontSize: 21, padding: '8px 18px', border: 0}}>SUPERVISED</Pill></div>
      <div style={{padding: '30px 38px'}}>
        <div style={{fontSize: 21, color: '#a0acc2', marginBottom: 14}}>YÊU CẦU CỦA BẠN</div>
        <div style={{height: 70, fontSize: 29, fontWeight: 700}}>{text.slice(0, Math.floor(ramp(f, 22, 65) * text.length))}{f < 65 && <span style={{opacity: f % 24 < 12 ? 1 : 0}}>|</span>}</div>
        <div style={{display: 'flex', gap: 14, fontSize: 23, color: '#92d1b4', opacity: ramp(f, 62, 78)}}><Check size={25} />Đọc cấu hình dự án <span style={{marginLeft: 'auto'}}>ALLOW</span></div>
        <div style={{marginTop: 30, background: approved ? '#1d3430' : '#2a2821', border: `1px solid ${approved ? '#4d9475' : '#9b7a3b'}`, borderRadius: 22, padding: 28, opacity: ramp(f, 80, 95), transform: `translateY(${(1 - pop(f, 80)) * 20}px)`}}>
          <div style={{fontWeight: 800, fontSize: 27, color: approved ? '#99e0b9' : '#f0cb80', display: 'flex', gap: 12, alignItems: 'center'}}>{approved ? <CheckCheck size={28} /> : <ShieldCheck size={28} />}{approved ? 'Quyết định: cho phép' : 'Yana muốn dùng run_command'}</div>
          <div style={{fontFamily: 'monospace', padding: '22px 24px', borderRadius: 12, background: '#10151d', fontSize: 34, marginTop: 22, color: '#f5f7fa'}}><span style={{color: '#8da5ce'}}>$ </span>npm test</div>
          <div style={{fontSize: 23, color: '#bec7d6', marginTop: 18}}>Phạm vi: thư mục dự án hiện tại</div>
          {!approved ? <div style={{display: 'flex', gap: 18, marginTop: 26}}>
            <div style={{flex: 1, background: '#477c64', padding: '16px', borderRadius: 12, textAlign: 'center', fontSize: 27, fontWeight: 800, transform: `scale(${f >= 280 && f < 287 ? 0.98 : 1})`}}>Cho phép</div>
            <div style={{flex: 1, background: '#3a2c30', border: '1px solid #81505a', padding: '16px', borderRadius: 12, textAlign: 'center', fontSize: 27, fontWeight: 800, color: '#edb7bf'}}>Từ chối</div>
          </div> : <div style={{marginTop: 26, fontSize: 26, color: '#99e0b9', display: 'flex', alignItems: 'center', gap: 12}}><ArrowRight size={25} />Yêu cầu được tiếp tục theo chính sách.</div>}
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 24, left: 40, fontSize: 22, color: '#aeb9cc'}}>Đề xuất từ AI ≠ quyền tự động thực thi</div>
    </div>
    {asking && <Cursor x={790 + ramp(f, 185, 265, 960, 285)} y={180 + ramp(f, 185, 265, 675, 570)} click={click} />}
    <IllustrationLabel text="Minh họa luồng phê duyệt · không chạy lệnh" />
  </AbsoluteFill>;
};

export const Evidence: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  const steps = ['Đề xuất', 'Kiểm tra quyền', 'Bạn duyệt', 'Thực thi', 'Dấu vết'];
  const active = Math.min(4, Math.floor(Math.max(0, f - 25) / 35));
  return <AbsoluteFill><Background dark /><Chrome dark section="Quyết định có thể xem lại" />
    <Reveal style={{position: 'absolute', left: 110, top: 180}}><Heading size={90} style={{color: 'white'}}>Mỗi quyết định.<br /><span style={{color: '#93afff'}}>Một dấu vết.</span></Heading></Reveal>
    <div style={{position: 'absolute', left: 115, top: 470, display: 'flex', alignItems: 'center', gap: 22}}>
      {steps.map((s, i) => <React.Fragment key={s}><div style={{width: i === 1 ? 320 : 260, height: 150, background: i <= active ? '#25354f' : '#1e2633', border: `1px solid ${i <= active ? '#6c91dc' : '#394252'}`, borderRadius: 24, padding: '22px 24px', opacity: ramp(f, 15 + i * 12, 30 + i * 12), transform: `translateY(${(1 - pop(f, 15 + i * 12)) * 25}px)`}}><div style={{fontSize: 22, color: i <= active ? '#9cbbff' : '#8593a8', marginBottom: 15}}>{i <= active ? <Check size={26} /> : <Eye size={26} />}</div><div style={{fontSize: 29, fontWeight: 800, color: '#f4f6fc'}}>{s}</div></div>{i < 4 && <ArrowRight size={28} color={i < active ? '#96b3fb' : '#4d596e'} />}</React.Fragment>)}
    </div>
    <div style={{position: 'absolute', left: 115, top: 724, right: 115, borderTop: '1px solid #354155', paddingTop: 36, display: 'flex', justifyContent: 'space-between', opacity: ramp(f, 180, 205)}}>
      <div><div style={{fontSize: 26, color: '#afc0dd'}}>TỪ Ý ĐỊNH ĐẾN HÀNH ĐỘNG</div><div style={{fontSize: 34, color: '#f1f4fb', fontWeight: 700, marginTop: 15}}>Không chỉ biết kết quả. Còn hiểu vì sao.</div></div>
      <Note style={{fontSize: 38, color: '#b1c6fb', transform: 'rotate(-5deg)', marginRight: 25}}>Có thể lần theo. Có thể kiểm tra.</Note>
    </div>
    <IllustrationLabel dark text="Sơ đồ minh họa cơ chế · không phải nhật ký của một phiên chạy" />
  </AbsoluteFill>;
};

export const Montage: React.FC<{offset?: number}> = ({offset = 0}) => {
  const f = useCurrentFrame() + offset;
  const phase = Math.min(2, Math.floor(f / 100));
  const items = [
    {Icon: FileCode2, name: 'Editor', line: 'Code ở trước mắt.', zoom: 1.18, origin: '36% 25%'},
    {Icon: MessageCircle, name: 'Hội thoại', line: 'Yana ở bên cạnh.', zoom: 1.8, origin: '100% 20%'},
    {Icon: FolderOpen, name: 'Dự án', line: 'Ngữ cảnh không rời đi.', zoom: 1.55, origin: '0% 15%'},
  ];
  return <AbsoluteFill><Background /><Chrome section="Tập trung vào công việc" />
    <Reveal style={{position: 'absolute', top: 160, left: 100}}><Heading size={80}>Tập trung vào <span style={{color: t.blue}}>việc của bạn.</span></Heading></Reveal>
    <div style={{position: 'absolute', top: 325, left: 110, width: 1110, height: 650, overflow: 'hidden', borderRadius: 24, boxShadow: t.shadow}}>
      <Screenshot zoom={items[phase].zoom} origin={items[phase].origin} style={{border: 0, borderRadius: 0, boxShadow: 'none', height: 740}} />
    </div>
    <div style={{position: 'absolute', top: 365, left: 1310, width: 460}}>
      {items.map(({Icon, name}, i) => <div key={name} style={{display: 'flex', alignItems: 'center', gap: 22, fontSize: 34, color: i === phase ? t.ink : '#95a0b5', fontWeight: 800, marginBottom: 43}}><div style={{borderRadius: 20, padding: 20, background: i === phase ? '#e8edfc' : '#f0f2f7'}}><Icon size={36} color={i === phase ? t.blue : '#95a0b5'} /></div>{name}{i === phase && <Check size={30} color={t.mint} />}</div>)}
      <Note style={{fontSize: 39, marginTop: 60, color: t.blue, transform: 'rotate(-4deg)'}}>{items[phase].line}</Note>
    </div>
    <div style={{position: 'absolute', bottom: 50, left: 120, fontSize: 22, color: t.muted}}>Các góc nhìn từ ảnh giao diện Studio của dự án</div>
  </AbsoluteFill>;
};
