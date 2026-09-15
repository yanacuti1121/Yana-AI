import type { LiquidGlassConfig } from "./types";

export const LIQUID_GLASS_WATER: LiquidGlassConfig = {
  transparency: 0.9,
  frost: 0.18,
  tintHue: 0.63,
  tintSaturation: 0.52,
  tintBrightness: 0.92,
  tintStrength: 0.16,
  highlight: 0.74,
  edgeOpacity: 0.52,
  shadowOpacity: 0.34,
  shadowRadius: 28,
  glowStrength: 0.24,
  rippleOpacity: 0.22,
  rippleAmplitude: 4,
  rippleSpeed: 0.58,
  parallaxDepth: 11,
  animatedRipples: true,
  pointerParallax: true,
  ambientGlow: true,
  respectAccessibility: true,
};

export const LIQUID_GLASS_SOLID: LiquidGlassConfig = {
  transparency: 0.12,
  frost: 0.68,
  tintHue: 0.63,
  tintSaturation: 0.2,
  tintBrightness: 0.84,
  tintStrength: 0.3,
  highlight: 0.24,
  edgeOpacity: 0.22,
  shadowOpacity: 0.26,
  shadowRadius: 18,
  glowStrength: 0,
  rippleOpacity: 0,
  rippleAmplitude: 0,
  rippleSpeed: 0,
  parallaxDepth: 0,
  animatedRipples: false,
  pointerParallax: false,
  ambientGlow: false,
  respectAccessibility: true,
};

function hsl(hue: number, saturation: number, brightness: number): string {
  // SwiftUI's Color(hue:saturation:brightness:) is HSB, not CSS's HSL --
  // convert HSB -> HSL so the same 0-1 sliders produce the same color.
  const s = Math.max(0, Math.min(1, saturation));
  const b = Math.max(0, Math.min(1, brightness));
  const hslLightness = (b * (2 - s)) / 2;
  const hslSaturation =
    hslLightness === 0 || hslLightness === 1
      ? 0
      : (b - hslLightness) / Math.min(hslLightness, 1 - hslLightness);
  return `hsl(${Math.round(hue * 360)}deg ${Math.round(hslSaturation * 100)}% ${Math.round(hslLightness * 100)}%)`;
}

export function liquidGlassCssVars(
  config: LiquidGlassConfig,
  reduceMotion: boolean,
  reduceTransparency: boolean,
): Record<string, string> {
  const respect = config.respectAccessibility;
  const motionReduced = respect && reduceMotion;
  const effectiveTransparency =
    respect && reduceTransparency
      ? Math.min(config.transparency, 0.34)
      : config.transparency;
  const tint = hsl(config.tintHue, config.tintSaturation, config.tintBrightness);
  return {
    "--lg-tint-color": tint,
    "--lg-tint-fill-opacity": String(
      (1 - effectiveTransparency) * 0.82 + config.tintStrength,
    ),
    "--lg-frost-blur": `${Math.round(effectiveTransparency * 40)}px`,
    "--lg-frost-opacity": String(config.frost),
    "--lg-highlight": String(config.highlight),
    "--lg-edge-opacity": String(config.edgeOpacity),
    "--lg-shadow-opacity": String(config.shadowOpacity),
    "--lg-shadow-radius": `${config.shadowRadius}px`,
    "--lg-shadow-y": `${Math.round(config.shadowRadius * 0.34)}px`,
    "--lg-glow-opacity": String(config.ambientGlow ? config.glowStrength : 0),
    "--lg-ripple-opacity": String(
      config.animatedRipples && !motionReduced ? config.rippleOpacity : 0,
    ),
    "--lg-ripple-amplitude": String(config.rippleAmplitude),
    "--lg-ripple-speed": String(config.rippleSpeed),
    "--lg-parallax-depth": String(
      config.pointerParallax && !motionReduced ? config.parallaxDepth : 0,
    ),
  };
}
