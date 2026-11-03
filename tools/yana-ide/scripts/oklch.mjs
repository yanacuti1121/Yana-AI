// Sinh màu trong OKLCH: cùng độ sáng L thì mắt thấy sáng ngang nhau, bất kể sắc độ.
// Cùng ý tưởng Linear dùng (LCH): mỗi theme sinh từ vài đầu vào thay vì hàng chục biến gõ tay.

function encode(linear) {
  const v = Math.min(1, Math.max(0, linear));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** L trong [0, 1], C (độ đậm) thường dưới 0.25, h tính bằng độ. Trả về #rrggbb (đã kẹp vào sRGB). */
export function oklchToHex(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map((v) => Math.round(encode(v) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Bề mặt của một theme từ ba đầu vào:
 * - baseHue / baseChroma: sắc và độ ấm của nền xám (chroma rất nhỏ = gần trung tính)
 * - accentHue: màu nhấn, bản sắc của theme
 * - kind: 'dark' hoặc 'light'
 */
export function generateSurfaces({ kind, baseHue, baseChroma, accentHue }) {
  const n = (L, C = baseChroma) => oklchToHex(L, C, baseHue);
  if (kind === 'dark') {
    return {
      page: n(0.17),
      side: n(0.195),
      card: n(0.215),
      inset: n(0.255),
      border: n(0.29),
      ink: n(0.945, baseChroma * 0.5),
      muted: n(0.74),
      accent: oklchToHex(0.74, 0.14, accentHue),
      'accent-ink': oklchToHex(0.2, 0.03, accentHue),
    };
  }
  return {
    page: n(0.985),
    side: n(0.97),
    card: n(1, 0),
    inset: n(0.955),
    border: n(0.905),
    ink: n(0.22),
    muted: n(0.5),
    accent: oklchToHex(0.52, 0.18, accentHue),
    'accent-ink': '#ffffff',
  };
}
