import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import type { LiquidGlassConfig } from "./types";
import { liquidGlassCssVars } from "./liquidGlass";

export function LiquidGlassSurface({
  configuration,
  cornerRadius = 22,
  className = "",
  children,
}: {
  configuration: LiquidGlassConfig;
  cornerRadius?: number;
  className?: string;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const transparencyQuery = window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    );
    const update = () => {
      setReduceMotion(motionQuery.matches);
      setReduceTransparency(transparencyQuery.matches);
    };
    update();
    motionQuery.addEventListener("change", update);
    transparencyQuery.addEventListener("change", update);
    return () => {
      motionQuery.removeEventListener("change", update);
      transparencyQuery.removeEventListener("change", update);
    };
  }, []);

  const motionReduced = configuration.respectAccessibility && reduceMotion;
  const vars = liquidGlassCssVars(configuration, reduceMotion, reduceTransparency);
  const parallaxActive = configuration.pointerParallax && !motionReduced;
  const parallaxX = parallaxActive
    ? (pointer.x - 0.5) * configuration.parallaxDepth
    : 0;
  const parallaxY = parallaxActive
    ? (pointer.y - 0.5) * configuration.parallaxDepth
    : 0;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!parallaxActive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  };
  const handlePointerLeave = () => {
    if (!parallaxActive) return;
    setPointer({ x: 0.5, y: 0.5 });
  };

  useEffect(() => {
    if (!configuration.animatedRipples || motionReduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const draw = (timeMs: number) => {
      const time = (timeMs / 1000) * configuration.rippleSpeed;
      ctx.clearRect(0, 0, width, height);
      for (let wave = 0; wave < 4; wave++) {
        const baseline = height * (0.22 + wave * 0.19);
        ctx.beginPath();
        for (let x = 0; x <= width; x += 12) {
          const progress = x / Math.max(width, 1);
          const value = Math.sin(
            progress * Math.PI * 2 * 1.35 + time + wave * 1.7,
          );
          const y = baseline + value * configuration.rippleAmplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${configuration.rippleOpacity * (1 - wave * 0.16)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    configuration.animatedRipples,
    configuration.rippleAmplitude,
    configuration.rippleOpacity,
    configuration.rippleSpeed,
    motionReduced,
  ]);

  return (
    <div
      className={`liquid-glass-surface ${className}`}
      style={
        {
          ...vars,
          borderRadius: `${cornerRadius}px`,
          "--lg-glow-x": `${pointer.x * 100}%`,
          "--lg-glow-y": `${pointer.y * 100}%`,
          "--lg-parallax-x": `${parallaxX}px`,
          "--lg-parallax-y": `${parallaxY}px`,
        } as CSSProperties
      }
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="liquid-glass-frost" />
      <div className="liquid-glass-tint" />
      {configuration.ambientGlow && <div className="liquid-glass-glow" />}
      {configuration.animatedRipples && !motionReduced && (
        <canvas className="liquid-glass-ripple" ref={canvasRef} />
      )}
      <div className="liquid-glass-edge" />
      <div className="liquid-glass-content">{children}</div>
    </div>
  );
}
