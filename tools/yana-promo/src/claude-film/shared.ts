import {Easing, interpolate, spring} from 'remotion';

export const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const FAMILY = 'Nunito';
export const ink = '#17171c';
export const purple = '#6b5cff';
export const green = '#3ddc84';
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const lerp = (f: number, a: number, b: number, c: number, d: number) =>
  interpolate(f, [a, b], [c, d], {...CL, easing: ease});
export const mkSpring =
  (f: number, fps: number) =>
  (delay: number, damping = 14, stiffness = 120) =>
    spring({frame: f - delay, fps, config: {damping, stiffness, mass: 1}});

// Window geometry in scene px. Every later click target derives from these constants.
export const WIN = {x: 320, y: 250, w: 1280, h: 760, side: 232, bar: 54};
export const app = (ax: number, ay: number): [number, number] => [WIN.x + ax, WIN.y + ay];

// Approval button (diff panel, right-aligned, fixed size) — app-relative
export const APPLY = {w: 240, h: 52, right: 24, barH: 96};
export const APPLY_CENTER: [number, number] = [WIN.w - APPLY.right - APPLY.w / 2, WIN.h - APPLY.barH / 2];

// Models view — app-relative
export const DROP = {x: 272, y: 200, w: 520, h: 64, listTop: 272, pad: 8, item: 60};
export const DROP_CENTER: [number, number] = [DROP.x + DROP.w / 2, DROP.y + DROP.h / 2];
export const dropItemCenter = (i: number): [number, number] => [DROP.x + DROP.w / 2, DROP.listTop + DROP.pad + i * DROP.item + DROP.item / 2];

// Tasks view — app-relative
export const SEARCH = {x: 880, y: 100, w: 360, h: 52};
export const SEARCH_CENTER: [number, number] = [SEARCH.x + SEARCH.w / 2, SEARCH.y + SEARCH.h / 2];
export const COLS = {top: 180, xs: [282, 606, 930], w: 300, head: 52, gap: 14, h: 560};
export const CARD_H = 96;
export const BIG_H = 136;
// Big card home slot (Đang làm, first) and drop slot (Hoàn tất, after one 96px card)
export const BIG_HOME: [number, number] = [COLS.xs[1] + COLS.w / 2, COLS.top + COLS.head + BIG_H / 2];
export const BIG_DROP: [number, number] = [COLS.xs[2] + COLS.w / 2, COLS.top + COLS.head + CARD_H + COLS.gap + BIG_H / 2];
