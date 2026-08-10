const STORE_KEY = 'yana.tweaks';

const CHANNELS = ['brandBlue', 'brandPink', 'brandGreen'];
const BRAND_RGB = {
  brandBlue: [37, 99, 235],
  brandPink: [244, 143, 177],
  brandGreen: [74, 222, 128],
};

export const PRESENTATION_DEFAULTS = Object.freeze({
  brandBlue: 45,
  brandPink: 30,
  brandGreen: 25,
  glowIntensity: 58,
  fontScale: 100,
  surfaceOpacity: 84,
  motifVisibility: 'Subtle',
  layout: 'Regular',
  reduceMotion: false,
  contrastBoost: false,
});

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeBrandBalance(source = PRESENTATION_DEFAULTS) {
  const raw = CHANNELS.map((key) => Math.max(0, Number(source[key]) || 0));
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return {
      brandBlue: PRESENTATION_DEFAULTS.brandBlue,
      brandPink: PRESENTATION_DEFAULTS.brandPink,
      brandGreen: PRESENTATION_DEFAULTS.brandGreen,
    };
  }

  const blue = Math.round((raw[0] / total) * 100);
  const remaining = 100 - blue;
  const pinkGreenTotal = raw[1] + raw[2];
  const pink = pinkGreenTotal ? Math.round(remaining * (raw[1] / pinkGreenTotal)) : 0;
  return {
    brandBlue: blue,
    brandPink: pink,
    brandGreen: remaining - pink,
  };
}

export function rebalanceBrandChannel(source, channel, nextValue) {
  const current = normalizeBrandBalance(source);
  const selected = clamp(nextValue, 0, 100);
  const remaining = 100 - selected;
  const others = CHANNELS.filter((key) => key !== channel);
  const otherTotal = current[others[0]] + current[others[1]];
  const first = otherTotal
    ? Math.round(remaining * (current[others[0]] / otherTotal))
    : Math.round(remaining / 2);

  return {
    [channel]: selected,
    [others[0]]: first,
    [others[1]]: remaining - first,
  };
}

export function sanitizePresentationPreferences(source = {}) {
  const balance = normalizeBrandBalance(source);
  const motifVisibility = ['Off', 'Subtle', 'Visible'].includes(source.motifVisibility)
    ? source.motifVisibility
    : PRESENTATION_DEFAULTS.motifVisibility;

  return {
    ...balance,
    glowIntensity: clamp(source.glowIntensity ?? PRESENTATION_DEFAULTS.glowIntensity, 0, 100),
    fontScale: clamp(source.fontScale ?? PRESENTATION_DEFAULTS.fontScale, 90, 125),
    surfaceOpacity: clamp(source.surfaceOpacity ?? PRESENTATION_DEFAULTS.surfaceOpacity, 70, 100),
    motifVisibility,
    contrastBoost: source.contrastBoost === true,
  };
}

function weightedBrandRgb(preferences) {
  return CHANNELS.map((_, index) => {
    return Math.round(CHANNELS.reduce((sum, channel) => {
      return sum + BRAND_RGB[channel][index] * (preferences[channel] / 100);
    }, 0));
  });
}

export function applyPresentationPreferences(source) {
  const preferences = sanitizePresentationPreferences(source);
  const root = document.documentElement;
  const mixedRgb = weightedBrandRgb(preferences);
  const glow = preferences.glowIntensity / 100;

  root.style.setProperty('--yana-blue-weight', String(preferences.brandBlue));
  root.style.setProperty('--yana-pink-weight', String(preferences.brandPink));
  root.style.setProperty('--yana-green-weight', String(preferences.brandGreen));
  root.style.setProperty('--yana-brand-blend-rgb', mixedRgb.join(', '));
  root.style.setProperty('--yana-glow-strength', glow.toFixed(2));
  root.style.setProperty('--yana-glow-alpha', (0.08 + glow * 0.28).toFixed(3));
  root.style.setProperty('--yana-glow-soft-alpha', (0.05 + glow * 0.17).toFixed(3));
  root.style.setProperty('--yana-glow-faint-alpha', (0.03 + glow * 0.1).toFixed(3));
  root.style.setProperty('--yana-blue-presence', (0.025 + glow * (preferences.brandBlue / 100) * 0.34).toFixed(3));
  root.style.setProperty('--yana-pink-presence', (0.025 + glow * (preferences.brandPink / 100) * 0.34).toFixed(3));
  root.style.setProperty('--yana-green-presence', (0.025 + glow * (preferences.brandGreen / 100) * 0.34).toFixed(3));
  root.style.setProperty('--yana-glow-chip-percent', `${Math.round(18 + glow * 34)}%`);
  root.style.setProperty('--yana-glass-blur', `${Math.round(8 + glow * 12)}px`);
  root.style.setProperty('--yana-surface-opacity', (preferences.surfaceOpacity / 100).toFixed(2));
  root.style.fontSize = `${preferences.fontScale}%`;
  root.dataset.yanaMotif = preferences.motifVisibility.toLowerCase();
  root.dataset.yanaContrast = preferences.contrastBoost ? 'boost' : 'standard';
}

export function hydratePresentationPreferences() {
  let saved = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch (_) {}
  applyPresentationPreferences({ ...PRESENTATION_DEFAULTS, ...saved });
}
