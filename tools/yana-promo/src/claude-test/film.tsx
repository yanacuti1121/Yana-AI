import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {loadFont} from '@remotion/fonts';

const FAMILY = 'Nunito';
[400, 700, 900].forEach((w) =>
  loadFont({family: FAMILY, url: staticFile(`fonts/nunito-${w}.ttf`), weight: String(w)}),
);

const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ink = '#17171c';
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const lerp = (f: number, a: number, b: number, c: number, d: number) =>
  interpolate(f, [a, b], [c, d], {...CL, easing: ease});

const PROMPT = 'Thêm chế độ tối cho trang này';
const REPLY = 'Mình sẽ thêm chế độ tối, giữ nguyên bố cục.';
const CODE: Array<[string, string]> = [
  [' ', ':root {'],
  [' ', '  --bg: #ffffff;'],
  [' ', '  --fg: #17171c;'],
  [' ', '}'],
  ['+', '@media (prefers-color-scheme: dark) {'],
  ['+', '  :root {'],
  ['+', '    --bg: #111114;'],
  ['+', '    --fg: #f4f1ea;'],
  ['+', '    --panel: #1b1b20;'],
  ['+', '  }'],
  ['+', '}'],
  ['-', '.page { background: #fff; }'],
  ['+', '.page { background: var(--bg); }'],
  ['+', '.page { color: var(--fg); }'],
];

export const Film: React.FC<{frameOverride?: number}> = ({frameOverride}) => {
  const real = useCurrentFrame();
  const f = frameOverride ?? real;
  const {fps} = useVideoConfig();
  const sp = (delay: number, damping = 14, stiffness = 120) =>
    spring({frame: f - delay, fps, config: {damping, stiffness, mass: 1}});

  // ---------- Beat 1: hero type ----------
  const words = ['Có', 'ý', 'tưởng?'];
  const caretOn = Math.floor(f / 30) % 2 === 0;
  // match-cut: hero type shrinks into composer (frames 95-150)
  const morph = lerp(f, 95, 150, 0, 1);
  const heroSize = interpolate(morph, [0, 1], [112, 30]);
  const heroX = interpolate(morph, [0, 1], [960, 1030]);
  const heroY = interpolate(morph, [0, 1], [540, 907]);
  const heroColor = morph > 0.75 ? '#8a8a93' : ink;
  const heroGone = f >= 215; // typing replaces the placeholder

  // ---------- Beat 2: window ----------
  const win = sp(95, 13, 90);
  const winScale = interpolate(win, [0, 1], [0.72, 1]);
  const winRot = interpolate(win, [0, 1], [10, 0]);
  const winOpacity = interpolate(f, [95, 115], [0, 1], CL);
  const head2 = sp(130, 16, 100);

  // ---------- Beat 3: cursor + typing ----------
  const curIn = lerp(f, 180, 212, 0, 1);
  const curToSend = lerp(f, 312, 328, 0, 1);
  const cx = interpolate(curToSend, [0, 1], [interpolate(curIn, [0, 1], [1700, 1080]), 1533]);
  const cy = interpolate(curToSend, [0, 1], [interpolate(curIn, [0, 1], [1060, 912]), 945]);
  const click = f >= 330 && f < 340 ? 0.82 : 1;
  const curOpacity = interpolate(f, [180, 195, 345, 360], [0, 1, 1, 0], CL);
  const focus = lerp(f, 206, 222, 0, 1);
  const typed = Math.floor(interpolate(f, [218, 318], [0, PROMPT.length], CL));
  const composerText = f >= 332 ? '' : PROMPT.slice(0, typed);

  // ---------- Beat 4: send ----------
  const ripple = lerp(f, 330, 372, 0, 1);
  const bubble = sp(334, 15, 110);

  // ---------- Beat 5: streaming + code ----------
  const replyChars = Math.floor(interpolate(f, [366, 426], [0, REPLY.length], CL));
  const fileChip = sp(432, 15, 120);
  const panel = sp(442, 15, 85);
  const codeScroll = lerp(f, 462, 520, 0, -118);

  // ---------- Beat 6: reframe to diff ----------
  const re = lerp(f, 510, 575, 0, 1);
  const camScale = interpolate(re, [0, 1], [1, 1.14]);
  const camX = interpolate(re, [0, 1], [0, -210]);
  const camY = interpolate(re, [0, 1], [0, -40]);
  const panelW = interpolate(re, [0, 1], [520, 700]);
  const head3 = sp(528, 16, 100);
  const approve = sp(548, 12, 120);
  const glow = 0.5 + 0.5 * Math.sin((f - 548) / 9);

  const mono = {fontFamily: 'SF Mono, Menlo, monospace'};

  return (
    <AbsoluteFill style={{background: 'radial-gradient(120% 90% at 50% 30%, #fbfaf6 0%, #f1efe8 100%)', fontFamily: FAMILY, color: ink, overflow: 'hidden'}}>
        {/* headline 2 / 3 */}
        <div style={{position: 'absolute', left: 120, top: 120 - re * 60, fontSize: 84, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1}}>
          <div style={{position: 'absolute', whiteSpace: 'nowrap', opacity: head2 * (1 - re), transform: `translateY(${(1 - head2) * 50 - re * 40}px)`}}>
            Bắt đầu cùng <span style={{color: '#6b5cff'}}>Yana.</span>
          </div>
          <div style={{position: 'absolute', whiteSpace: 'nowrap', opacity: head3, transform: `translateY(${(1 - head3) * 50}px)`}}>
            Xem thay đổi. <span style={{color: '#6b5cff'}}>Bạn quyết định.</span>
          </div>
        </div>

      {/* camera */}
      <AbsoluteFill style={{transform: `translate(${camX}px, ${camY}px) scale(${camScale})`, transformOrigin: '50% 50%'}}>
        {/* app window */}
        <div
          style={{
            position: 'absolute', left: 320, top: 250, width: 1280, height: 760, borderRadius: 26, background: '#1c1c21',
            opacity: winOpacity, perspective: 1600,
            transform: `perspective(1800px) rotateX(${winRot}deg) scale(${winScale})`, transformOrigin: '50% 70%',
            boxShadow: '0 50px 120px rgba(20,20,30,0.28), 0 12px 30px rgba(20,20,30,0.14), inset 0 0 0 1px rgba(255,255,255,0.06)',
            overflow: 'hidden', color: '#ecebe6',
          }}
        >
          {/* titlebar */}
          <div style={{height: 54, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 9, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{width: 13, height: 13, borderRadius: 7, background: c}} />)}
            <div style={{marginLeft: 'auto', marginRight: 'auto', fontSize: 15, color: '#8c8c95', fontWeight: 700}}>Yana — Landing page</div>
            <div style={{width: 57}} />
          </div>
          {/* sidebar */}
          <div style={{position: 'absolute', left: 0, top: 54, bottom: 0, width: 232, padding: 22, borderRight: '1px solid rgba(255,255,255,0.06)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26}}>
              <Img src={staticFile('branding/yana-mark.svg')} style={{width: 28, height: 28}} />
              <span style={{fontWeight: 900, fontSize: 19}}>Yana</span>
            </div>
            {['Tổng quan', 'Trang chủ', 'Giao diện', 'Lịch sử'].map((t, i) => (
              <div key={t} style={{padding: '9px 12px', borderRadius: 10, fontSize: 16, marginBottom: 4, background: i === 2 ? 'rgba(255,255,255,0.08)' : 'none', color: i === 2 ? '#fff' : '#8c8c95', fontWeight: 700}}>{t}</div>
            ))}
          </div>

          {/* chat column */}
          <div style={{position: 'absolute', left: 232, top: 54, bottom: 0, right: panel * panelW, padding: '28px 30px 0'}}>
            {/* user bubble */}
            <div style={{display: 'flex', justifyContent: 'flex-end', opacity: bubble, transform: `translateY(${(1 - bubble) * 180}px) scale(${0.9 + bubble * 0.1})`, transformOrigin: '100% 100%'}}>
              <div style={{background: '#6b5cff', color: '#fff', padding: '14px 20px', borderRadius: '20px 20px 6px 20px', fontSize: 24, fontWeight: 700, maxWidth: 560}}>{PROMPT}</div>
            </div>
            {/* reply */}
            <div style={{marginTop: 26, display: 'flex', gap: 14, opacity: f >= 362 ? 1 : 0}}>
              <Img src={staticFile('branding/yana-mark.svg')} style={{width: 34, height: 34, flexShrink: 0}} />
              <div>
                <div style={{fontSize: 24, lineHeight: 1.45, maxWidth: 560, minHeight: 36}}>
                  {REPLY.slice(0, replyChars)}
                  {replyChars < REPLY.length && <span style={{display: 'inline-block', width: 10, height: 24, background: '#6b5cff', marginLeft: 3, verticalAlign: -3, opacity: caretOn ? 1 : 0.2}} />}
                </div>
                <div style={{marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 17, fontWeight: 700, opacity: fileChip, transform: `translateX(${(1 - fileChip) * -24}px)`}}>
                  <span style={{width: 9, height: 9, borderRadius: 5, background: '#3ddc84'}} /> theme.css <span style={{color: '#8c8c95', fontWeight: 400}}>+11 −1</span>
                </div>
              </div>
            </div>
            {/* composer */}
            <div style={{position: 'absolute', left: 30, right: 30, bottom: 28, height: 74, borderRadius: 18, background: '#26262c', display: 'flex', alignItems: 'center', padding: '0 12px 0 22px', boxShadow: `0 0 0 ${2 * focus}px rgba(107,92,255,${0.9 * focus}), 0 0 ${30 * focus}px rgba(107,92,255,${0.35 * focus})`}}>
              <div style={{flex: 1, fontSize: 30, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden'}}>
                {composerText}
                {f >= 206 && f < 332 && <span style={{display: 'inline-block', width: 3, height: 32, background: '#ecebe6', marginLeft: 2, verticalAlign: -5, opacity: caretOn ? 1 : 0}} />}
              </div>
              <div style={{position: 'relative', width: 50, height: 50, borderRadius: 14, background: '#6b5cff', display: 'grid', placeItems: 'center', transform: `scale(${click})`}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                <div style={{position: 'absolute', inset: -4, borderRadius: 18, border: '3px solid #6b5cff', transform: `scale(${1 + ripple * 2.4})`, opacity: ripple > 0 ? 1 - ripple : 0}} />
              </div>
            </div>
          </div>

          {/* code / diff panel */}
          <div style={{position: 'absolute', right: 0, top: 54, bottom: 0, width: panelW, transform: `translateX(${(1 - panel) * panelW}px)`, background: '#141418', borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden'}}>
            <div style={{height: 50, display: 'flex', alignItems: 'center', padding: '0 22px', fontSize: 16, fontWeight: 700, color: '#8c8c95', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 10}}>
              <span style={{color: '#ecebe6'}}>theme.css</span> · thay đổi đề xuất
            </div>
            <div style={{padding: '18px 0', transform: `translateY(${codeScroll}px)`, ...mono, fontSize: 19, lineHeight: '34px'}}>
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
            {/* approval bar */}
            <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, background: 'linear-gradient(180deg, rgba(20,20,24,0), #141418 40%)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, padding: '0 24px', opacity: approve, transform: `translateY(${(1 - approve) * 60}px)`}}>
              <div style={{padding: '14px 22px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)', fontSize: 20, fontWeight: 700, color: '#c9c9d0'}}>Bỏ qua</div>
              <div style={{padding: '14px 26px', borderRadius: 14, background: '#6b5cff', fontSize: 20, fontWeight: 900, color: '#fff', boxShadow: `0 0 ${18 + glow * 22}px rgba(107,92,255,${0.35 + glow * 0.3})`}}>Áp dụng thay đổi</div>
            </div>
          </div>
        </div>

        {/* hero type → composer placeholder (match cut) */}
        {!heroGone && (
          <div style={{position: 'absolute', left: heroX, top: heroY, transform: `translate(${interpolate(morph, [0, 1], [-50, 0])}%, -50%)`, whiteSpace: 'nowrap', fontSize: heroSize, fontWeight: interpolate(morph, [0, 1], [900, 700]) > 800 ? 900 : 700, letterSpacing: interpolate(morph, [0, 1], [-4, 0]), color: heroColor, display: 'flex', alignItems: 'baseline', gap: heroSize * 0.26}}>
            {words.map((w, i) => {
              const s = sp(6 + i * 9, 13, 110);
              return <span key={w} style={{display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 60}px) rotate(${(1 - s) * -4}deg)`}}>{w}</span>;
            })}
            {morph < 0.75 && <span style={{display: 'inline-block', width: heroSize * 0.06, height: heroSize * 0.9, background: '#6b5cff', alignSelf: 'center', marginLeft: -heroSize * 0.12, opacity: caretOn ? 1 : 0, borderRadius: 2}} />}
          </div>
        )}

        {/* cursor */}
        <svg style={{position: 'absolute', left: cx, top: cy, opacity: curOpacity, transform: `scale(${click})`, transformOrigin: '0 0', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))'}} width="30" height="36" viewBox="0 0 30 36">
          <path d="M3 2 L3 29 L10 22 L15 34 L20 32 L15 20 L25 20 Z" fill="#fff" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
