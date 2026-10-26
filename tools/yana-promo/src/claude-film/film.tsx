import React from 'react';
import {AbsoluteFill, Img, interpolate, interpolateColors, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {APPLY, APPLY_CENTER, BIG_DROP, BIG_HOME, CL, DROP_CENTER, FAMILY, SEARCH_CENTER, WIN, app, dropItemCenter, ease, green, ink, lerp, mkSpring, purple} from './shared';
import {ModelsView, SitePreview, TasksView} from './journey';

[400, 700, 900].forEach((w) =>
  loadFont({family: FAMILY, url: staticFile(`fonts/nunito-${w}.ttf`), weight: String(w)}),
);

const PROMPT = 'Thêm chế độ tối cho trang này';
const REPLY = 'Mình sẽ thêm chế độ tối, giữ nguyên bố cục.';
const CODE: Array<[string, string]> = [
  [' ', ':root {'], [' ', '  --bg: #ffffff;'], [' ', '  --fg: #17171c;'], [' ', '}'],
  ['+', '@media (prefers-color-scheme: dark) {'], ['+', '  :root {'], ['+', '    --bg: #111114;'], ['+', '    --fg: #f4f1ea;'],
  ['+', '    --panel: #1b1b20;'], ['+', '  }'], ['+', '}'],
  ['-', '.page { background: #fff; }'], ['+', '.page { background: var(--bg); }'], ['+', '.page { color: var(--fg); }'],
];
const NAV = ['Trò chuyện', 'Mô hình', 'Công việc', 'Lịch sử'];

// ---------- global timeline (60fps) ----------
// camera: 510–575 zoom to diff · 900–960 recenter · 1000–1060 nudge to dropdown · 1320–1380 back
// recap 1920–2220 (chat → diff → models → tasks) · 2220–2300 morph into end card
const CAM_F = [510, 575, 900, 960, 1000, 1060, 1320, 1380, 1920, 1995, 2070, 2145, 2220, 2300];
const CAM_S = [1, 1.14, 1.14, 1, 1, 1.05, 1.05, 1, 1, 1.1, 1.14, 1, 1.05, 0.12];
const CAM_X = [0, -210, -210, 0, 0, 60, 60, 0, 0, 150, -210, 0, 0, 0];
const CAM_Y = [0, -40, -40, 0, 0, 40, 40, 0, 0, -30, -40, 0, 20, -151];
const NAV_F = [920, 960, 1370, 1410, 1920, 1960, 2070, 2110, 2145, 2185];
const NAV_I = [0, 1, 1, 2, 2, 0, 0, 1, 1, 2];

// cursor path in scene px; later targets derive from the same constants as the UI
const A = app(...APPLY_CENTER);
const D = app(...DROP_CENTER);
const G = app(...dropItemCenter(2));
const S = app(...SEARCH_CENTER);
const H = app(...BIG_HOME);
const T = app(...BIG_DROP);
const CUR: Array<[number, number, number]> = [
  [180, 1700, 1060], [212, 1080, 912], [312, 1080, 912], [328, 1533, 945], [360, 1533, 945],
  [599, 1620, 1040], [650, A[0], A[1]], [740, A[0], A[1]],
  [741, 1300, 980], [985, 1300, 980], [1040, D[0], D[1]], [1085, D[0], D[1]], [1130, G[0], G[1]], [1200, G[0], G[1]], [1250, 980, 720],
  [1251, 1500, 1000], [1440, 1500, 1000], [1470, S[0], S[1]], [1580, S[0], S[1]], [1630, H[0], H[1]], [1645, H[0], H[1]],
  [1740, T[0], T[1]], [1790, T[0], T[1]], [1830, 1300, 760],
];
const CUR_OP_F = [180, 195, 345, 360, 600, 615, 720, 740, 985, 1000, 1230, 1250, 1440, 1455, 1800, 1820];
const CUR_OP_V = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
const CLICKS: Array<[number, number]> = [[330, 340], [652, 662], [1046, 1056], [1142, 1152], [1472, 1482]];

type Range = [number, number, number]; // [in, out, duration]
const viewState = (f: number, ranges: Range[]) => {
  let a = 0;
  let tx = 0;
  for (const [i, o, d] of ranges) {
    const inP = lerp(f, i, i + d, 0, 1);
    const outP = lerp(f, o, o + d, 0, 1);
    const v = inP * (1 - outP);
    if (v > a) {
      a = v;
      tx = (1 - inP) * 240 - outP * 160;
    }
  }
  return {a, tx};
};

const Headline: React.FC<{enter: number; exit: number; size?: number; children: React.ReactNode}> = ({enter, exit, size = 84, children}) => (
  <div style={{position: 'absolute', whiteSpace: 'nowrap', fontSize: size, opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 50 - exit * 40}px)`}}>{children}</div>
);
const Accent: React.FC<{children: React.ReactNode}> = ({children}) => <span style={{color: purple}}>{children}</span>;

export const Film: React.FC<{frameOverride?: number}> = ({frameOverride}) => {
  const real = useCurrentFrame();
  const f = frameOverride ?? real;
  const {fps} = useVideoConfig();
  const sp = mkSpring(f, fps);

  // ---------- Beat 1: hero type (approved; exits upward, never becomes a placeholder) ----------
  const words = ['Có', 'ý', 'tưởng?'];
  const caretOn = Math.floor(f / 30) % 2 === 0;
  const heroSize = 112;
  const heroY = 540 - lerp(f, 80, 110, 0, 32);
  const heroGone = f >= 110;
  const heroOpacity = 1 - lerp(f, 80, 110, 0, 1);

  // ---------- Beat 2: window ----------
  const win = sp(95, 13, 90);
  const winScale = interpolate(win, [0, 1], [0.72, 1]);
  const winRot = interpolate(win, [0, 1], [10, 0]);
  const winOpacity = interpolate(f, [95, 115], [0, 1], CL) * (1 - lerp(f, 2265, 2300, 0, 1));
  const head2 = sp(130, 16, 100);

  // ---------- Beat 3: typing + send ----------
  const focus = lerp(f, 206, 222, 0, 1);
  const typed = Math.floor(interpolate(f, [218, 318], [0, PROMPT.length], CL));
  const composerText = f >= 332 ? '' : PROMPT.slice(0, typed);
  const sendClick = f >= 330 && f < 340 ? 0.82 : 1;
  const ripple = lerp(f, 330, 372, 0, 1);
  const bubble = sp(334, 15, 110);

  // ---------- Beat 5: streaming + code ----------
  const replyChars = Math.floor(interpolate(f, [366, 426], [0, REPLY.length], CL));
  const fileChip = sp(432, 15, 120);
  const panel = sp(442, 15, 85);
  const codeScroll = lerp(f, 462, 520, 0, -118);

  // ---------- Beat 6: reframe to diff ----------
  const re = lerp(f, 510, 575, 0, 1);
  const panelW = interpolate(re, [0, 1], [520, 700]);
  const head3 = sp(528, 16, 100);
  const approve = sp(548, 12, 120);

  // ---------- Beat 7 (10–15s): apply + preview light → dark ----------
  const applied = sp(660, 14, 140);
  const appliedOn = f >= 660;
  const ripple2 = lerp(f, 655, 700, 0, 1);
  const sysLine = sp(690, 15, 120);
  const preview = sp(700, 15, 90);
  const dark = lerp(f, 745, 805, 0, 1);
  const recapPulse = f >= 2000 && f < 2070 ? 0.5 + 0.5 * Math.sin((f - 2000) / 6) : 0;
  const glow = (0.5 + 0.5 * Math.sin((f - 548) / 9)) * (1 - applied) + recapPulse;

  // ---------- camera / views / nav ----------
  const camScale = interpolate(f, CAM_F, CAM_S, {...CL, easing: ease});
  const camX = interpolate(f, CAM_F, CAM_X, {...CL, easing: ease});
  const camY = interpolate(f, CAM_F, CAM_Y, {...CL, easing: ease});
  const chatV = viewState(f, [[-100, 920, 60], [1920, 2070, 40]]);
  const modelsV = viewState(f, [[920, 1370, 60], [2070, 2145, 40]]);
  const tasksV = viewState(f, [[1370, 1920, 60], [2145, 9000, 40]]);
  const navIdx = interpolate(f, NAV_F, NAV_I, {...CL, easing: ease});

  // ---------- cursor ----------
  const dragP = lerp(f, 1645, 1740, 0, 1);
  const cx = interpolate(f, CUR.map((k) => k[0]), CUR.map((k) => k[1]), {...CL, easing: ease});
  const cy = interpolate(f, CUR.map((k) => k[0]), CUR.map((k) => k[2]), {...CL, easing: ease}) - Math.sin(dragP * Math.PI) * 36;
  const curOpacity = interpolate(f, CUR_OP_F, CUR_OP_V, CL);
  const click = CLICKS.some(([a, b]) => f >= a && f < b) ? 0.82 : f >= 1636 && f < 1745 ? 0.9 : 1;
  const curApp: [number, number] = [cx - WIN.x, cy - WIN.y];

  // ---------- end card ----------
  const endGlow = lerp(f, 2240, 2330, 0, 1);
  const logo = sp(2282, 13, 110);
  const endTitle = sp(2312, 15, 100);
  const cta = sp(2345, 14, 120);
  const url = lerp(f, 2372, 2402, 0, 1);

  const mono = {fontFamily: 'SF Mono, Menlo, monospace'};
  const applyBg = interpolateColors(applied, [0, 1], [purple, '#2fb36b']);

  return (
    <AbsoluteFill style={{background: 'radial-gradient(120% 90% at 50% 30%, #fbfaf6 0%, #f1efe8 100%)', fontFamily: FAMILY, color: ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 460, top: 60, width: 1000, height: 760, borderRadius: 500, background: 'radial-gradient(closest-side, rgba(107,92,255,0.22), rgba(107,92,255,0))', opacity: endGlow, transform: `scale(${0.6 + 0.4 * endGlow})`}} />

      {/* headlines — outside the camera, viewport-safe */}
      <div style={{position: 'absolute', left: 120, top: 120 + Math.min(0, camY) * 1.5, fontSize: 84, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1}}>
        <Headline enter={head2} exit={re}>Bắt đầu cùng <Accent>Yana.</Accent></Headline>
        <Headline enter={head3} exit={lerp(f, 760, 790, 0, 1)}>Xem thay đổi. <Accent>Bạn quyết định.</Accent></Headline>
        <Headline enter={sp(792, 16, 100)} exit={lerp(f, 900, 930, 0, 1)}>Giao diện mới. <Accent>Vẫn đúng ý bạn.</Accent></Headline>
        <Headline enter={sp(962, 16, 100)} exit={lerp(f, 1360, 1390, 0, 1)}>Chọn <Accent>model</Accent> bạn muốn.</Headline>
        <Headline enter={sp(1440, 16, 100)} exit={lerp(f, 1890, 1920, 0, 1)} size={76}>Theo dõi từng việc <Accent>đến lúc xong.</Accent></Headline>
        <Headline enter={sp(1940, 16, 100)} exit={lerp(f, 2195, 2225, 0, 1)}>Tất cả <Accent>trong một nơi.</Accent></Headline>
      </div>

      {/* camera */}
      <AbsoluteFill style={{transform: `translate(${camX}px, ${camY}px) scale(${camScale})`, transformOrigin: '50% 50%'}}>
        {/* app window */}
        <div
          style={{
            position: 'absolute', left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: 26, background: '#1c1c21',
            opacity: winOpacity, transform: `perspective(1800px) rotateX(${winRot}deg) scale(${winScale})`, transformOrigin: '50% 70%',
            boxShadow: '0 50px 120px rgba(20,20,30,0.28), 0 12px 30px rgba(20,20,30,0.14), inset 0 0 0 1px rgba(255,255,255,0.06)',
            overflow: 'hidden', color: '#ecebe6',
          }}
        >
          {/* titlebar */}
          <div style={{height: WIN.bar, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 9, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{width: 13, height: 13, borderRadius: 7, background: c}} />)}
            <div style={{marginLeft: 'auto', marginRight: 'auto', fontSize: 15, color: '#8c8c95', fontWeight: 700}}>Yana — Landing page</div>
            <div style={{width: 57}} />
          </div>
          {/* sidebar */}
          <div style={{position: 'absolute', left: 0, top: WIN.bar, bottom: 0, width: WIN.side, padding: 22, boxSizing: 'border-box', borderRight: '1px solid rgba(255,255,255,0.06)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26, height: 28}}>
              <Img src={staticFile('branding/yana-mark.svg')} style={{width: 28, height: 28}} />
              <span style={{fontWeight: 900, fontSize: 19}}>Yana</span>
            </div>
            <div style={{position: 'relative'}}>
              <div style={{position: 'absolute', left: 0, right: 0, top: navIdx * 44, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.08)'}} />
              {NAV.map((t, i) => (
                <div key={t} style={{position: 'relative', height: 40, marginBottom: 4, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 16, fontWeight: 700, color: Math.abs(navIdx - i) < 0.5 ? '#fff' : '#8c8c95'}}>{t}</div>
              ))}
            </div>
          </div>

          {/* ===== view: chat + diff ===== */}
          <div style={{position: 'absolute', left: WIN.side, top: WIN.bar, right: 0, bottom: 0, opacity: chatV.a, transform: `translateX(${chatV.tx}px)`}}>
            <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, right: panel * panelW, padding: '28px 30px 0'}}>
              <div style={{display: 'flex', justifyContent: 'flex-end', opacity: bubble, transform: `translateY(${(1 - bubble) * 180}px) scale(${0.9 + bubble * 0.1})`, transformOrigin: '100% 100%'}}>
                <div style={{background: purple, color: '#fff', padding: '14px 20px', borderRadius: '20px 20px 6px 20px', fontSize: 24, fontWeight: 700, maxWidth: 560, minWidth: 0}}>{PROMPT}</div>
              </div>
              <div style={{marginTop: 26, display: 'flex', gap: 14, opacity: f >= 362 ? 1 : 0}}>
                <Img src={staticFile('branding/yana-mark.svg')} style={{width: 34, height: 34, flexShrink: 0}} />
                <div style={{minWidth: 0}}>
                  <div style={{fontSize: 24, lineHeight: 1.45, maxWidth: 560, minHeight: 36}}>
                    {REPLY.slice(0, replyChars)}
                    {replyChars < REPLY.length && <span style={{display: 'inline-block', width: 10, height: 24, background: purple, marginLeft: 3, verticalAlign: -3, opacity: caretOn ? 1 : 0.2}} />}
                  </div>
                  <div style={{marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 17, fontWeight: 700, opacity: fileChip, transform: `translateX(${(1 - fileChip) * -24}px)`}}>
                    <span style={{width: 9, height: 9, borderRadius: 5, background: green}} /> theme.css <span style={{color: '#8c8c95', fontWeight: 400}}>+11 −1</span>
                  </div>
                  <div style={{marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 19, fontWeight: 700, color: '#9ff0c2', opacity: sysLine, transform: `translateY(${(1 - sysLine) * 14}px)`}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={green} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    Đã áp dụng vào theme.css
                  </div>
                </div>
              </div>
              {/* composer */}
              <div style={{position: 'absolute', left: 30, right: 30, bottom: 28, height: 74, borderRadius: 18, background: '#26262c', display: 'flex', alignItems: 'center', padding: '0 12px 0 22px', boxShadow: `0 0 0 ${2 * focus}px rgba(107,92,255,${0.9 * focus}), 0 0 ${30 * focus}px rgba(107,92,255,${0.35 * focus})`}}>
                <div style={{flex: 1, fontSize: 30, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden'}}>
                  {composerText}
                  {f >= 206 && f < 332 && <span style={{display: 'inline-block', width: 3, height: 32, background: '#ecebe6', marginLeft: 2, verticalAlign: -5, opacity: caretOn ? 1 : 0}} />}
                </div>
                <div style={{position: 'relative', width: 50, height: 50, borderRadius: 14, background: purple, display: 'grid', placeItems: 'center', transform: `scale(${sendClick})`}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  <div style={{position: 'absolute', inset: -4, borderRadius: 18, border: `3px solid ${purple}`, transform: `scale(${1 + ripple * 2.4})`, opacity: ripple > 0 ? 1 - ripple : 0}} />
                </div>
              </div>
            </div>

            {/* code / diff panel */}
            <div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: panelW, transform: `translateX(${(1 - panel) * panelW}px)`, background: '#141418', borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden'}}>
              <div style={{height: 50, display: 'flex', alignItems: 'center', padding: '0 22px', fontSize: 16, fontWeight: 700, color: '#8c8c95', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 10, whiteSpace: 'nowrap'}}>
                <span style={{color: '#ecebe6'}}>theme.css</span> · {appliedOn ? <span style={{color: '#9ff0c2'}}>đã áp dụng</span> : 'thay đổi đề xuất'}
              </div>
              <div style={{padding: '18px 0', transform: `translateY(${codeScroll}px)`, ...mono, fontSize: 19, lineHeight: '34px', opacity: 1 - preview * 0.6}}>
                {CODE.map(([k, line], i) => {
                  const a = sp(448 + i * 5, 18, 160);
                  const bg = k === '+' ? 'rgba(61,220,132,0.14)' : k === '-' ? 'rgba(255,95,87,0.16)' : 'transparent';
                  const fg = k === '+' ? '#9ff0c2' : k === '-' ? '#ffb0ab' : '#8c8c95';
                  return (
                    <div key={i} style={{display: 'flex', background: bg, opacity: a, transform: `translateX(${(1 - a) * 30}px)`}}>
                      <span style={{width: 48, textAlign: 'right', paddingRight: 14, color: '#55555e'}}>{i + 1}</span>
                      <span style={{width: 24, color: fg}}>{k}</span>
                      <span style={{color: fg, whiteSpace: 'pre'}}>{line}</span>
                    </div>
                  );
                })}
              </div>
              {/* website preview slides over the code once applied */}
              {preview > 0.01 && (
                <div style={{position: 'absolute', left: 20, right: 20, top: 66, opacity: preview, transform: `translateY(${(1 - preview) * 420}px)`}}>
                  <div style={{fontSize: 15, fontWeight: 700, color: '#8c8c95', marginBottom: 10}}>Xem trước · Trang chủ</div>
                  <SitePreview dark={dark} style={{height: 380}} />
                </div>
              )}
              {/* approval bar */}
              <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: APPLY.barH, background: 'linear-gradient(180deg, rgba(20,20,24,0), #141418 40%)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, padding: `0 ${APPLY.right}px`, opacity: approve, transform: `translateY(${(1 - approve) * 60}px)`}}>
                <div style={{width: 120, height: APPLY.h, borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)', fontSize: 20, fontWeight: 700, color: '#c9c9d0', display: 'grid', placeItems: 'center', opacity: 1 - applied, transform: `translateX(${applied * 30}px)`}}>Bỏ qua</div>
                <div style={{position: 'relative', width: APPLY.w, height: APPLY.h, borderRadius: 14, background: applyBg, fontSize: 20, fontWeight: 900, color: '#fff', display: 'grid', placeItems: 'center', transform: `scale(${f >= 652 && f < 662 ? 0.94 : 1})`, boxShadow: `0 0 ${18 + glow * 22}px rgba(107,92,255,${0.35 + glow * 0.3})`}}>
                  <span style={{gridArea: '1 / 1', opacity: 1 - applied, whiteSpace: 'nowrap'}}>Áp dụng thay đổi</span>
                  <span style={{gridArea: '1 / 1', opacity: applied, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', transform: `scale(${0.8 + 0.2 * applied})`}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    Đã áp dụng
                  </span>
                  <div style={{position: 'absolute', inset: -4, borderRadius: 18, border: `3px solid ${purple}`, transform: `scale(${1 + ripple2 * 1.6})`, opacity: ripple2 > 0 ? 1 - ripple2 : 0}} />
                </div>
              </div>
            </div>
          </div>

          {/* ===== view: models ===== */}
          {modelsV.a > 0.001 && (
            <div style={{position: 'absolute', left: WIN.side, top: WIN.bar, right: 0, bottom: 0, opacity: modelsV.a, transform: `translateX(${modelsV.tx}px)`}}>
              <ModelsView f={f} fps={fps} cur={curApp} />
            </div>
          )}
          {/* ===== view: tasks ===== */}
          {tasksV.a > 0.001 && (
            <div style={{position: 'absolute', left: WIN.side, top: WIN.bar, right: 0, bottom: 0, opacity: tasksV.a, transform: `translateX(${tasksV.tx}px)`}}>
              <TasksView f={f} fps={fps} cur={curApp} />
            </div>
          )}
        </div>

        {/* opening type exits before the app; no tiny placeholder */}
        {!heroGone && (
          <div style={{position: 'absolute', left: 960, top: heroY, transform: 'translate(-50%, -50%)', opacity: heroOpacity, whiteSpace: 'nowrap', fontSize: heroSize, fontWeight: 900, letterSpacing: -4, color: ink, display: 'flex', alignItems: 'baseline', gap: heroSize * 0.26}}>
            {words.map((w, i) => {
              const s = sp(6 + i * 9, 13, 110);
              return <span key={w} style={{display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 60}px) rotate(${(1 - s) * -4}deg)`}}>{w}</span>;
            })}
            {f < 95 && <span style={{display: 'inline-block', width: heroSize * 0.06, height: heroSize * 0.9, background: purple, alignSelf: 'center', marginLeft: -heroSize * 0.12, opacity: caretOn ? 1 : 0, borderRadius: 2}} />}
          </div>
        )}

        {/* cursor */}
        {curOpacity > 0 && (
          <svg style={{position: 'absolute', left: cx, top: cy, opacity: curOpacity, transform: `scale(${click})`, transformOrigin: '0 0', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))'}} width="30" height="36" viewBox="0 0 30 36">
            <path d="M3 2 L3 29 L10 22 L15 34 L20 32 L15 20 L25 20 Z" fill="#fff" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
          </svg>
        )}
      </AbsoluteFill>

      {/* ===== end card (37–42s) ===== */}
      {f >= 2270 && (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'}}>
          <Img src={staticFile('branding/yana-mark.svg')} style={{position: 'absolute', top: 325, width: 150, height: 150, opacity: logo, transform: `scale(${0.4 + 0.6 * logo})`}} />
          <div style={{position: 'absolute', top: 500, fontSize: 84, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1, whiteSpace: 'nowrap', opacity: endTitle, transform: `translateY(${(1 - endTitle) * 40}px)`}}>
            Yana. <Accent>Làm việc cùng AI.</Accent>
          </div>
          <div style={{position: 'absolute', top: 634, padding: '0 46px', height: 84, borderRadius: 42, background: purple, color: '#fff', fontSize: 32, fontWeight: 900, display: 'grid', placeItems: 'center', opacity: cta, transform: `scale(${0.8 + 0.2 * cta})`, boxShadow: '0 18px 50px rgba(107,92,255,0.35)'}}>
            Khám phá Yana
          </div>
          <div style={{position: 'absolute', top: 756, fontSize: 32, fontWeight: 700, color: '#6e6e78', letterSpacing: 0.5, opacity: url, transform: `translateY(${(1 - url) * 12}px)`}}>yana.vutam.link</div>
        </div>
      )}
    </AbsoluteFill>
  );
};
