import React from 'react';
import {interpolate, interpolateColors} from 'remotion';
import {BIG_H, CARD_H, CL, COLS, DROP, SEARCH, WIN, green, lerp, mkSpring, purple} from './shared';

const gray = '#8c8c95';
const Check: React.FC<{size?: number; color?: string}> = ({size = 18, color = '#fff'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);

// ---------- Mini website preview (light → dark) ----------
export const SitePreview: React.FC<{dark: number; style?: React.CSSProperties}> = ({dark, style}) => {
  const bg = interpolateColors(dark, [0, 1], ['#ffffff', '#111114']);
  const fg = interpolateColors(dark, [0, 1], ['#17171c', '#f4f1ea']);
  const panel = interpolateColors(dark, [0, 1], ['#f1efe8', '#1b1b20']);
  const line = interpolateColors(dark, [0, 1], ['#dcd9d0', '#3a3a44']);
  return (
    <div style={{borderRadius: 14, overflow: 'hidden', background: bg, color: fg, boxShadow: '0 20px 50px rgba(0,0,0,0.45)', ...style}}>
      <div style={{height: 46, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, borderBottom: `1px solid ${line}`}}>
        <div style={{width: 16, height: 16, borderRadius: 5, background: purple}} />
        <div style={{fontWeight: 900, fontSize: 15}}>Trang chủ</div>
        {[52, 40, 46].map((w, i) => <div key={i} style={{marginLeft: i === 0 ? 'auto' : 0, width: w, height: 8, borderRadius: 4, background: line}} />)}
        <div style={{width: 40, height: 22, borderRadius: 11, background: interpolateColors(dark, [0, 1], ['#dcd9d0', purple]), position: 'relative', marginLeft: 10}}>
          <div style={{position: 'absolute', top: 3, left: 3 + dark * 18, width: 16, height: 16, borderRadius: 8, background: '#fff'}} />
        </div>
      </div>
      <div style={{padding: '26px 24px 0'}}>
        <div style={{fontSize: 30, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1}}>Xin chào, đây là<br />trang của bạn.</div>
        <div style={{marginTop: 14, width: 260, height: 9, borderRadius: 5, background: line}} />
        <div style={{marginTop: 8, width: 190, height: 9, borderRadius: 5, background: line}} />
        <div style={{display: 'flex', gap: 14, marginTop: 24}}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{flex: 1, height: 110, borderRadius: 12, background: panel, padding: 14}}>
              <div style={{width: 30, height: 30, borderRadius: 8, background: purple, opacity: 0.85}} />
              <div style={{marginTop: 14, width: '80%', height: 8, borderRadius: 4, background: line}} />
              <div style={{marginTop: 8, width: '55%', height: 8, borderRadius: 4, background: line}} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------- Models view (15–23s) ----------
const PROVIDERS: Array<[string, string]> = [['Claude', '#d97757'], ['GPT', '#10a37f'], ['Gemini', '#4e8df5'], ['Ollama', '#ecebe6']];
const OX = WIN.side;
const OY = WIN.bar;

export const ModelsView: React.FC<{f: number; fps: number; cur: [number, number]}> = ({f, fps, cur}) => {
  const sp = mkSpring(f, fps);
  const openP = sp(1050, 16, 140) * (1 - lerp(f, 1190, 1212, 0, 1));
  const selIdx = interpolate(sp(1145, 14, 120), [0, 1], [0, 3]);
  const selected = f >= 1145 ? 3 : 0;
  const swap = lerp(f, 1145, 1162, 0, 1);
  const saved = sp(1212, 14, 120);
  const inList = openP > 0.3 && cur[0] > DROP.x && cur[0] < DROP.x + DROP.w && cur[1] > DROP.listTop + DROP.pad;
  const hoverIdx = inList ? Math.floor((cur[1] - DROP.listTop - DROP.pad) / DROP.item) : -1;
  const Name: React.FC<{size: number}> = ({size}) => (
    <div style={{position: 'relative', height: size * 1.2, display: 'flex', alignItems: 'center', gap: 14}}>
      <span style={{width: size * 0.42, height: size * 0.42, borderRadius: size, background: interpolateColors(swap, [0, 1], [PROVIDERS[0][1], PROVIDERS[3][1]]), flexShrink: 0}} />
      <span style={{position: 'relative', fontSize: size, fontWeight: 900, lineHeight: 1}}>
        <span style={{opacity: 1 - swap, display: 'inline-block', transform: `translateY(${-swap * 14}px)`}}>{PROVIDERS[0][0]}</span>
        <span style={{position: 'absolute', left: 0, top: 0, opacity: swap, display: 'inline-block', transform: `translateY(${(1 - swap) * 14}px)`}}>{PROVIDERS[3][0]}</span>
      </span>
    </div>
  );
  return (
    <>
      <div style={{position: 'absolute', left: 40, top: 40, fontSize: 34, fontWeight: 900}}>Mô hình</div>
      <div style={{position: 'absolute', left: 40, top: 88, fontSize: 20, color: gray, fontWeight: 700}}>Chọn nhà cung cấp cho dự án này.</div>
      <div style={{position: 'absolute', left: 40, top: DROP.y - OY - 30, fontSize: 17, color: gray, fontWeight: 700}}>Nhà cung cấp</div>
      {/* dropdown button */}
      <div style={{position: 'absolute', left: DROP.x - OX, top: DROP.y - OY, width: DROP.w, height: DROP.h, borderRadius: 16, background: '#26262c', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 20px', boxSizing: 'border-box', boxShadow: `0 0 0 ${2 * openP}px rgba(107,92,255,${0.9 * openP})`}}>
        <Name size={26} />
        <svg style={{marginLeft: 'auto', transform: `rotate(${180 * openP}deg)`}} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9c9d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {/* saved chip */}
      <div style={{position: 'absolute', left: DROP.x - OX, top: DROP.listTop - OY + 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700, color: green, opacity: saved, transform: `translateY(${(1 - saved) * -10}px)`}}>
        <Check size={16} color={green} /> Đã lưu lựa chọn cho dự án
      </div>
      <div style={{position: 'absolute', left: 40, top: 420, fontSize: 18, color: gray, fontWeight: 700, opacity: 1 - openP}}>Bạn có thể đổi bất cứ lúc nào.</div>
      {/* info card */}
      <div style={{position: 'absolute', left: 600, top: DROP.y - OY, width: 408, height: 220, borderRadius: 18, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: 26, boxSizing: 'border-box'}}>
        <div style={{fontSize: 17, color: gray, fontWeight: 700}}>Đang dùng</div>
        <div style={{marginTop: 14}}><Name size={44} /></div>
        <div style={{marginTop: 22, fontSize: 18, color: gray, fontWeight: 700}}>Local trên máy. Giữ nguyên phạm vi quyền của dự án.</div>
      </div>
      {/* list */}
      {openP > 0.01 && (
        <div style={{position: 'absolute', left: DROP.x - OX, top: DROP.listTop - OY, width: DROP.w, padding: DROP.pad, boxSizing: 'border-box', borderRadius: 16, background: '#2b2b32', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', opacity: openP, transform: `translateY(${(1 - openP) * -12}px) scale(${0.96 + 0.04 * openP})`, transformOrigin: '50% 0%'}}>
          <div style={{position: 'absolute', left: DROP.pad, right: DROP.pad, top: DROP.pad + selIdx * DROP.item, height: DROP.item, borderRadius: 12, background: 'rgba(107,92,255,0.24)', border: '1px solid rgba(107,92,255,0.6)', boxSizing: 'border-box'}} />
          {PROVIDERS.map(([name, color], i) => (
            <div key={name} style={{position: 'relative', height: DROP.item, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', borderRadius: 12, background: hoverIdx === i && i !== selected ? 'rgba(255,255,255,0.06)' : 'transparent'}}>
              <span style={{width: 12, height: 12, borderRadius: 6, background: color}} />
              <span style={{fontSize: 26, fontWeight: 700}}>{name}</span>
              <span style={{marginLeft: 'auto', opacity: Math.max(0, 1 - Math.abs(selIdx - i) * 1.5), display: 'flex'}}><Check size={20} color="#c7c0ff" /></span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ---------- Tasks view (23–32s) ----------
type Card = {t: string; tag: string; big?: boolean};
const COLUMNS: {name: string; cards: Card[]}[] = [
  {name: 'Cần làm', cards: [{t: 'Trang liên hệ', tag: 'Nội dung'}, {t: 'Tối ưu ảnh', tag: 'Hiệu năng'}, {t: 'Banner mùa lễ', tag: 'Giao diện'}]},
  {name: 'Đang làm', cards: [{t: 'Chế độ tối', tag: 'Giao diện', big: true}, {t: 'Menu di động', tag: 'Giao diện'}]},
  {name: 'Hoàn tất', cards: [{t: 'Font chữ mới', tag: 'Giao diện'}, {t: 'Sửa lỗi form', tag: 'Lỗi'}]},
];
const QUERY = 'giao diện';
const Tag: React.FC<{t: string}> = ({t}) => (
  <span style={{padding: '4px 10px', borderRadius: 8, background: 'rgba(107,92,255,0.22)', color: '#c7c0ff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap'}}>{t}</span>
);

export const TasksView: React.FC<{f: number; fps: number; cur: [number, number]}> = ({f, fps, cur}) => {
  const sp = mkSpring(f, fps);
  const typedN = Math.floor(interpolate(f, [1480, 1570], [0, QUERY.length], CL));
  const typed = QUERY.slice(0, typedN);
  const collapse = lerp(f, 1484, 1522, 0, 1);
  const removed = lerp(f, 1690, 1720, 0, 1);
  const grabbed = f >= 1636;
  const dropped = f >= 1745;
  const settle = sp(1745, 10, 150);
  const lift = lerp(f, 1636, 1652, 0, 1) * (1 - settle);
  const badge = sp(1752, 12, 130);
  const pulse = f >= 2160 && f < 2220 ? 0.5 + 0.5 * Math.sin((f - 2160) / 5) : 0;
  const focusP = lerp(f, 1472, 1486, 0, 1);
  const caretOn = Math.floor(f / 30) % 2 === 0;
  const match = (c: Card) => c.tag.toLowerCase().startsWith(typed);

  const columns = COLUMNS.map((col, ci) => {
    let y = COLS.top + COLS.head;
    const items = col.cards.map((c) => {
      const keep = (match(c) ? 1 : 1 - collapse) * (c.big ? 1 - removed : 1);
      const h = c.big ? BIG_H : CARD_H;
      const top = y;
      y += (h + COLS.gap) * keep;
      return {c, top, keep, h};
    });
    const ph = ci === 2 ? {top: y, keep: removed} : null;
    const count = col.cards.filter(match).length + (ci === 1 && dropped ? -1 : 0) + (ci === 2 && dropped ? 1 : 0);
    return {col, items, ph, count};
  });
  const home = columns[1].items[0];
  const target = columns[2].ph!;
  const big = dropped ? {x: COLS.xs[2], y: target.top} : grabbed ? {x: cur[0] - COLS.w / 2, y: cur[1] - BIG_H / 2} : {x: COLS.xs[1], y: home.top};

  return (
    <>
      <div style={{position: 'absolute', left: 40, top: 40, fontSize: 34, fontWeight: 900}}>Công việc</div>
      <div style={{position: 'absolute', left: 40, top: 88, fontSize: 18, color: gray, fontWeight: 700}}>Dự án Landing page</div>
      {/* search */}
      <div style={{position: 'absolute', left: SEARCH.x - OX, top: SEARCH.y - OY, width: SEARCH.w, height: SEARCH.h, borderRadius: 14, background: '#26262c', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', boxShadow: `0 0 0 ${2 * focusP}px rgba(107,92,255,${0.9 * focusP})`}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gray} strokeWidth="3" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span style={{fontSize: 22, fontWeight: 700, color: typedN ? '#ecebe6' : gray, whiteSpace: 'nowrap'}}>{typedN ? typed : 'Tìm việc'}</span>
        {focusP > 0.5 && f < 1600 && <span style={{width: 2, height: 26, background: '#ecebe6', marginLeft: -6, opacity: caretOn ? 1 : 0}} />}
      </div>
      {/* columns */}
      {columns.map(({col, items, ph, count}, ci) => (
        <div key={col.name} style={{position: 'absolute', left: COLS.xs[ci] - OX - 10, top: COLS.top - OY, width: COLS.w + 20, height: COLS.h, borderRadius: 16, background: 'rgba(255,255,255,0.04)'}}>
          <div style={{height: COLS.head, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', fontSize: 18, fontWeight: 900, color: '#c9c9d0'}}>
            {col.name}
            <span style={{minWidth: 26, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', fontSize: 14, padding: '0 8px'}}>{count}</span>
          </div>
          {items.map(({c, top, keep, h}) =>
            c.big ? null : (
              <div key={c.t} style={{position: 'absolute', left: 10, top: top - COLS.top, width: COLS.w, height: h * keep, opacity: keep, overflow: 'hidden', borderRadius: 14, background: '#26262c', boxSizing: 'border-box', padding: 16}}>
                <div style={{fontSize: 20, fontWeight: 900, whiteSpace: 'nowrap'}}>{c.t}</div>
                <div style={{marginTop: 12}}><Tag t={c.tag} /></div>
              </div>
            ),
          )}
          {ph && !dropped && (
            <div style={{position: 'absolute', left: 10, top: ph.top - COLS.top, width: COLS.w, height: BIG_H * ph.keep, opacity: ph.keep, borderRadius: 14, border: '2px dashed rgba(199,192,255,0.5)', background: 'rgba(107,92,255,0.08)', boxSizing: 'border-box'}} />
          )}
        </div>
      ))}
      {/* the dragged card: Chế độ tối */}
      <div style={{position: 'absolute', left: big.x - OX, top: big.y - OY, width: COLS.w, height: BIG_H, borderRadius: 14, background: '#2b2b32', boxSizing: 'border-box', padding: 16, zIndex: 5, transform: `scale(${1 + 0.05 * lift}) rotate(${2.5 * lift}deg)`, boxShadow: `0 ${24 * lift}px ${50 * lift}px rgba(0,0,0,${0.55 * lift}), 0 0 0 ${2 * lift}px rgba(107,92,255,${0.8 * lift})`, display: 'flex', gap: 14}}>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 22, fontWeight: 900, whiteSpace: 'nowrap'}}>Chế độ tối</div>
          <div style={{marginTop: 12}}><Tag t="Giao diện" /></div>
          <div style={{marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8, background: 'rgba(61,220,132,0.15)', color: '#9ff0c2', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap'}}>
            <span style={{width: 8, height: 8, borderRadius: 4, background: green}} /> Thay đổi đã duyệt
          </div>
        </div>
        <div style={{width: 92, height: 64, borderRadius: 8, background: '#111114', border: '1px solid rgba(255,255,255,0.14)', padding: 8, boxSizing: 'border-box', alignSelf: 'center'}}>
          <div style={{width: 40, height: 6, borderRadius: 3, background: '#f4f1ea'}} />
          <div style={{marginTop: 6, width: 60, height: 4, borderRadius: 2, background: '#3a3a44'}} />
          <div style={{marginTop: 8, display: 'flex', gap: 4}}>{[0, 1, 2].map((i) => <div key={i} style={{flex: 1, height: 18, borderRadius: 3, background: '#1b1b20'}} />)}</div>
        </div>
        <div style={{position: 'absolute', right: -10, top: -10, width: 34, height: 34, borderRadius: 17, background: green, display: 'grid', placeItems: 'center', transform: `scale(${badge * (1 + 0.15 * pulse)})`, boxShadow: `0 0 ${16 + 20 * pulse}px rgba(61,220,132,${0.4 + 0.4 * pulse})`}}>
          <Check size={18} color="#0d2a1a" />
        </div>
      </div>
    </>
  );
};
