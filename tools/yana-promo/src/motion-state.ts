// Time is expressed on a 30fps design clock; the composition samples it at 60fps.
export const OUTPUT_FPS = 60;
export const DESIGN_FPS = 30;
export const MAIN_DURATION = 75;
export const TEASER_DURATION = 25;
export const BPM = 128;
export type Tab = 'code' | 'terminal' | 'audit' | 'models' | 'tasks';
export const bound = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const ease = (v: number) => {const x = bound(v); return x * x * (3 - 2 * x);};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const tween = (f: number, a: number, b: number, x = 0, y = 1) => mix(x, y, ease((f - a) / (b - a)));
export const linear = (f: number, a: number, b: number, x = 0, y = 1) => mix(x, y, bound((f - a) / (b - a)));
export const typing = (f: number, start: number, end: number, text: string) => Array.from(text).slice(0, Math.floor(linear(f, start, end, 0, Array.from(text).length))).join('');

export const chapters = [
  {from: 0, to: 112.5, id: 'intro'},
  {from: 112.5, to: 337.5, id: 'workspace'},
  {from: 337.5, to: 675, id: 'conversation'},
  {from: 675, to: 1012.5, id: 'approval'},
  {from: 1012.5, to: 1237.5, id: 'audit'},
  {from: 1237.5, to: 1575, id: 'models'},
  {from: 1575, to: 1912.5, id: 'tools'},
  {from: 1912.5, to: 2250, id: 'finish'},
] as const;

export const tabAt = (f: number): Tab => {
  if (f < 1030) return 'code';
  if (f < 1255) return 'audit';
  if (f < 1590) return 'models';
  if (f < 1750) return 'terminal';
  if (f < 1915) return 'tasks';
  if (f < 1950) return 'code';
  if (f < 1985) return 'terminal';
  if (f < 2020) return 'models';
  return 'code';
};
export const panelEnteredAt = (f: number) => [1030, 1255, 1590, 1750, 1915, 1950, 1985, 2020].filter(t => t <= f).at(-1) ?? 112.5;

type Pose = {at: number; x: number; y: number; scale: number; tilt: number};
const poses: Pose[] = [
  {at: 105, x: 460, y: 410, scale: 0.62, tilt: -7},
  {at: 150, x: 160, y: 155, scale: 1, tilt: -1},
  {at: 220, x: 160, y: 155, scale: 1, tilt: -1},
  {at: 260, x: 25, y: 55, scale: 1.2, tilt: 0},
  {at: 330, x: 25, y: 55, scale: 1.2, tilt: 0},
  {at: 375, x: -630, y: -120, scale: 1.32, tilt: 0},
  {at: 425, x: -630, y: -120, scale: 1.32, tilt: 0},
  {at: 465, x: -630, y: 80, scale: 1.32, tilt: 0},
  {at: 530, x: -630, y: 80, scale: 1.32, tilt: 0},
  {at: 570, x: 10, y: 70, scale: 1.27, tilt: 0},
  {at: 640, x: 10, y: 70, scale: 1.27, tilt: 0},
  {at: 700, x: -645, y: 20, scale: 1.35, tilt: 0},
  {at: 960, x: -645, y: 20, scale: 1.35, tilt: 0},
  {at: 1020, x: 155, y: 155, scale: 1, tilt: 1},
  {at: 1080, x: 60, y: 85, scale: 1.15, tilt: 0},
  {at: 1210, x: 60, y: 85, scale: 1.15, tilt: 0},
  {at: 1260, x: 150, y: 150, scale: 1.02, tilt: -1},
  {at: 1320, x: 10, y: 100, scale: 1.2, tilt: 0},
  {at: 1440, x: 10, y: 100, scale: 1.2, tilt: 0},
  {at: 1490, x: -360, y: 95, scale: 1.2, tilt: 0},
  {at: 1550, x: -360, y: 95, scale: 1.2, tilt: 0},
  {at: 1610, x: 80, y: 100, scale: 1.12, tilt: 0},
  {at: 1720, x: 80, y: 100, scale: 1.12, tilt: 0},
  {at: 1770, x: 50, y: 70, scale: 1.16, tilt: 0},
  {at: 1880, x: 50, y: 70, scale: 1.16, tilt: 0},
  {at: 1925, x: 250, y: 200, scale: 0.88, tilt: -3},
  {at: 2020, x: 250, y: 200, scale: 0.88, tilt: 2},
  {at: 2065, x: 750, y: 365, scale: 0.25, tilt: 0},
];
export function cameraAt(f: number) {
  if (f <= poses[0].at) return poses[0];
  const i = poses.findIndex(p => p.at >= f);
  if (i < 0) return poses.at(-1)!;
  const a = poses[i - 1], b = poses[i], t = ease((f - a.at) / (b.at - a.at));
  return {at: f, x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), scale: mix(a.scale, b.scale, t), tilt: mix(a.tilt, b.tilt, t)};
}

export const clicks = [180, 425, 748, 900, 1030, 1255, 1312, 1440, 1532, 1590, 1665, 1750, 1790, 1835];
const pointer = [
  [112, 900, 450], [150, 180, 304], [180, 180, 304], [210, 600, 230],
  [285, 730, 340], [337, 1280, 737], [400, 1280, 737], [425, 1545, 755],
  [470, 1280, 365], [550, 750, 420], [630, 750, 545],
  [675, 1270, 735], [730, 1270, 735], [748, 1545, 755],
  [800, 1420, 390], [865, 1200, 600], [900, 1200, 600], [960, 1350, 650],
  [1000, 710, 70], [1030, 710, 70], [1080, 1180, 365], [1180, 1180, 530],
  [1230, 865, 70], [1255, 865, 70], [1300, 650, 215], [1400, 600, 330],
  [1440, 600, 330], [1490, 1300, 365], [1532, 1300, 365],
  [1560, 575, 70], [1590, 575, 70], [1640, 670, 550], [1665, 550, 134],
  [1730, 1015, 70], [1750, 1015, 70], [1790, 550, 350], [1835, 961, 350],
  [1870, 1280, 540], [1915, 435, 70], [1950, 575, 70], [1985, 865, 70], [2020, 435, 70], [2050, 1300, 700],
];
export function pointerAt(f: number) {
  if (f >= 1790 && f <= 1835) {
    const t = tween(f, 1790, 1835);
    return {x: 550 + t * 411, y: 350 - Math.sin(t * Math.PI) * 28};
  }
  const i = pointer.findIndex(p => p[0] >= f);
  if (i === 0) return {x: pointer[0][1], y: pointer[0][2]};
  if (i < 0) return {x: 1300, y: 700};
  const a = pointer[i - 1], b = pointer[i];
  const phase = bound((f - a[0]) / (b[0] - a[0]));
  const t = ease(phase);
  const distance = Math.hypot(b[1] - a[1], b[2] - a[2]);
  return {x: mix(a[1], b[1], t), y: mix(a[2], b[2], t) - Math.sin(phase * Math.PI) * Math.min(50, distance * 0.04)};
}

export const captions = [
  [112.5, 225, 'Mở dự án. Vào việc.'], [225, 337.5, 'Code, chat, công cụ — cùng một nơi.'],
  [337.5, 450, 'Trao đổi cùng ngữ cảnh code.'], [450, 562.5, 'Câu trả lời hiện từng dòng.'],
  [562.5, 675, 'Cuộn code. Giữ mạch suy nghĩ.'], [675, 787.5, 'Giao việc bằng tiếng Việt.'],
  [787.5, 900, 'Cần quyền? Chờ bạn duyệt.'], [900, 1012.5, 'Một cú bấm. Rồi mới tiếp tục.'],
  [1012.5, 1125, 'Xem lại quyết định và phạm vi.'], [1125, 1237.5, 'Lướt lại. Xem rõ từng bước.'],
  [1237.5, 1350, 'Nhiều model. Một không gian.'], [1350, 1462.5, 'Tìm nhanh. Chọn đúng.'],
  [1462.5, 1575, 'Cloud hay local, bạn chọn.'], [1575, 1687.5, 'Terminal ngay trong workspace.'],
  [1687.5, 1800, 'Đổi mục. Không đổi nhịp làm việc.'], [1800, 1912.5, 'Kéo công việc tới bước tiếp theo.'],
  [1912.5, 2040, 'Tất cả chuyển động. Bạn giữ quyền.'],
] as const;

export const teaserTime = (seconds: number) => {
  // Reuse the strongest action ranges, with a clean five-second brand hold.
  if (seconds < 3.75) return seconds;
  if (seconds < 8.75) return seconds - 3.75 + 11.25;
  if (seconds < 15) return seconds - 8.75 + 25;
  if (seconds < 20) return seconds - 15 + 43.75;
  return seconds - 20 + 70;
};
