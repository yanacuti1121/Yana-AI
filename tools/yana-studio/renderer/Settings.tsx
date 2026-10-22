import { useState } from "react";
import { ArrowLeft, FolderOpen, Shield } from "lucide-react";
import type { LiquidGlassConfig, State } from "./types";
import { Connections } from "./Connections";
import { ModelManager } from "./ModelManager";
import { ModelOrchestration } from "./ModelOrchestration";
import { PrivacyData } from "./PrivacyData";
import { translate } from "./i18n";
import { SystemSurfaces } from "./SystemSurfaces";
import { AccountSettings } from "./AccountSettings";
import { TokenUsage } from "./TokenUsage";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { LIQUID_GLASS_SOLID, LIQUID_GLASS_WATER } from "./liquidGlass";

export function Settings({
  state,
  onState,
  onClose,
  onError,
  projectRoot,
  onOpenTerminal,
  onShowOnboarding,
  hiddenSections = [],
  showBackup = true,
  initialSection,
  onSectionChange,
}: {
  state: State;
  onState: (state: State) => void;
  onClose: () => void;
  onError: (message: string) => void;
  projectRoot: string;
  onOpenTerminal: (command?: string) => void;
  onShowOnboarding?: () => void;
  // Hosts that cannot back a section yet (the Code-OSS IDE: no local account,
  // its own theme picker, OAuth not ported) hide it instead of showing buttons
  // that would only fail. Default: every section, as in the standalone app.
  hiddenSections?: string[];
  showBackup?: boolean;
  // Host dựng lại màn khi dữ liệu đổi: truyền tab đang xem vào và nhận lại mỗi lần đổi tab.
  initialSection?: string;
  onSectionChange?: (section: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [section, setSectionState] = useState(
    initialSection ??
      (hiddenSections.includes("account") ? "models" : "account"),
  );
  const setSection = (next: string) => {
    setSectionState(next);
    onSectionChange?.(next);
  };
  const t = translate(state.preferences.locale);
  const previewPreferences = (patch: Partial<State["preferences"]>) =>
    onState({
      ...state,
      preferences: { ...state.preferences, ...patch },
    });
  const persistPreferences = (patch: Partial<State["preferences"]>) =>
    void run(async () => {
      onState(
        await window.studio.savePreferences({
          ...state.preferences,
          ...patch,
        }),
      );
    });
  const previewLiquidGlass = (patch: Partial<LiquidGlassConfig>) =>
    previewPreferences({
      liquidGlass: { ...state.preferences.liquidGlass, ...patch },
    });
  const persistLiquidGlass = (patch: Partial<LiquidGlassConfig>) =>
    persistPreferences({
      liquidGlass: { ...state.preferences.liquidGlass, ...patch },
    });
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-page">
      <button className="text-button" onClick={onClose}>
        <ArrowLeft size={16} /> {t("backWorkspace")}
      </button>
      <div className="eyebrow">CONTROL PLANE</div>
      <h1>{t("settingsTitle")}</h1>
      <p className="muted">{t("settingsDescription")}</p>
      {onShowOnboarding && (
        <button className="settings-tour-button" onClick={onShowOnboarding}>
          {t("showIntroduction")}
        </button>
      )}
      <div className="button-row">
        {[
          ["account", t("account")],
          ["appearance", t("appearance")],
          ["models", t("modelRuntime")],
          ["usage", t("usage")],
          ["connections", t("connections")],
          ["permissions", t("permissions")],
          ["tools", t("tools")],
          ["commands", t("commands")],
          ["privacy", t("privacy")],
        ]
          .filter(([id]) => !hiddenSections.includes(id))
          .map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              aria-pressed={section === id}
            >
              {label}
            </button>
          ))}
      </div>
      {section === "account" ? (
        <AccountSettings
          state={state}
          locale={state.preferences.locale}
          onState={onState}
          onError={onError}
        />
      ) : section === "appearance" ? (
        <div className="card settings-card settings-language">
          <h2>{t("appearance")}</h2>
          <p className="muted">{t("appearanceDescription")}</p>
          <label>
            {t("themeLabel")}
            <select
              value={state.preferences.theme}
              onChange={(event) =>
                persistPreferences({
                  theme: event.target.value as "light" | "dark",
                })
              }
            >
              <option value="light">{t("themeLight")}</option>
              <option value="dark">{t("themeDark")}</option>
            </select>
          </label>
          <h3 className="appearance-section-title">{t("contrastTitle")}</h3>
          <p className="muted">{t("contrastDescription")}</p>
          <label className="range-setting">
            <span>
              {t("glassOpacityLabel")}
              <output>{state.preferences.glassOpacity}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={state.preferences.glassOpacity}
              onChange={(event) =>
                previewPreferences({ glassOpacity: Number(event.target.value) })
              }
              onPointerUp={(event) =>
                persistPreferences({
                  glassOpacity: Number(event.currentTarget.value),
                })
              }
              onBlur={(event) =>
                persistPreferences({
                  glassOpacity: Number(event.currentTarget.value),
                })
              }
            />
          </label>
          <label className="range-setting">
            <span>
              {t("glassBlurLabel")}
              <output>{state.preferences.glassBlur}px</output>
            </span>
            <input
              type="range"
              min="0"
              max="32"
              value={state.preferences.glassBlur}
              onChange={(event) =>
                previewPreferences({ glassBlur: Number(event.target.value) })
              }
              onPointerUp={(event) =>
                persistPreferences({
                  glassBlur: Number(event.currentTarget.value),
                })
              }
              onBlur={(event) =>
                persistPreferences({
                  glassBlur: Number(event.currentTarget.value),
                })
              }
            />
          </label>
          <hr />
          <h3 className="appearance-section-title">{t("liquidGlassTitle")}</h3>
          <p className="muted">{t("liquidGlassDescription")}</p>
          <LiquidGlassSurface
            configuration={state.preferences.liquidGlass}
            cornerRadius={18}
            className="liquid-glass-preview"
          >
            <div className="liquid-glass-preview-content">
              <strong>{t("lgPreviewTitle")}</strong>
            </div>
          </LiquidGlassSurface>
          <h4>{t("lgSectionSurface")}</h4>
          <LiquidGlassRange
            label={t("lgTransparencyLabel")}
            value={state.preferences.liquidGlass.transparency}
            min={0}
            max={0.96}
            onPreview={(value) => previewLiquidGlass({ transparency: value })}
            onCommit={(value) => persistLiquidGlass({ transparency: value })}
          />
          <LiquidGlassRange
            label={t("lgFrostLabel")}
            value={state.preferences.liquidGlass.frost}
            min={0}
            max={1}
            onPreview={(value) => previewLiquidGlass({ frost: value })}
            onCommit={(value) => persistLiquidGlass({ frost: value })}
          />
          <LiquidGlassRange
            label={t("lgTintStrengthLabel")}
            value={state.preferences.liquidGlass.tintStrength}
            min={0}
            max={0.55}
            onPreview={(value) => previewLiquidGlass({ tintStrength: value })}
            onCommit={(value) => persistLiquidGlass({ tintStrength: value })}
          />
          <LiquidGlassRange
            label={t("lgTintHueLabel")}
            value={state.preferences.liquidGlass.tintHue}
            min={0}
            max={1}
            onPreview={(value) => previewLiquidGlass({ tintHue: value })}
            onCommit={(value) => persistLiquidGlass({ tintHue: value })}
          />
          <LiquidGlassRange
            label={t("lgTintSaturationLabel")}
            value={state.preferences.liquidGlass.tintSaturation}
            min={0}
            max={1}
            onPreview={(value) => previewLiquidGlass({ tintSaturation: value })}
            onCommit={(value) => persistLiquidGlass({ tintSaturation: value })}
          />
          <h4>{t("lgSectionDepth")}</h4>
          <LiquidGlassRange
            label={t("lgHighlightLabel")}
            value={state.preferences.liquidGlass.highlight}
            min={0}
            max={1}
            onPreview={(value) => previewLiquidGlass({ highlight: value })}
            onCommit={(value) => persistLiquidGlass({ highlight: value })}
          />
          <LiquidGlassRange
            label={t("lgEdgeLabel")}
            value={state.preferences.liquidGlass.edgeOpacity}
            min={0}
            max={1}
            onPreview={(value) => previewLiquidGlass({ edgeOpacity: value })}
            onCommit={(value) => persistLiquidGlass({ edgeOpacity: value })}
          />
          <LiquidGlassRange
            label={t("lgShadowOpacityLabel")}
            value={state.preferences.liquidGlass.shadowOpacity}
            min={0}
            max={0.75}
            onPreview={(value) => previewLiquidGlass({ shadowOpacity: value })}
            onCommit={(value) => persistLiquidGlass({ shadowOpacity: value })}
          />
          <LiquidGlassRange
            label={t("lgShadowRadiusLabel")}
            value={state.preferences.liquidGlass.shadowRadius}
            min={0}
            max={54}
            step={1}
            format={(value) => `${value}px`}
            onPreview={(value) => previewLiquidGlass({ shadowRadius: value })}
            onCommit={(value) => persistLiquidGlass({ shadowRadius: value })}
          />
          <LiquidGlassRange
            label={t("lgGlowLabel")}
            value={state.preferences.liquidGlass.glowStrength}
            min={0}
            max={0.65}
            onPreview={(value) => previewLiquidGlass({ glowStrength: value })}
            onCommit={(value) => persistLiquidGlass({ glowStrength: value })}
          />
          <h4>{t("lgSectionEffects")}</h4>
          <LiquidGlassToggle
            label={t("lgToggleRipples")}
            checked={state.preferences.liquidGlass.animatedRipples}
            onChange={(checked) =>
              persistLiquidGlass({ animatedRipples: checked })
            }
          />
          <LiquidGlassToggle
            label={t("lgToggleParallax")}
            checked={state.preferences.liquidGlass.pointerParallax}
            onChange={(checked) =>
              persistLiquidGlass({ pointerParallax: checked })
            }
          />
          <LiquidGlassToggle
            label={t("lgToggleGlow")}
            checked={state.preferences.liquidGlass.ambientGlow}
            onChange={(checked) => persistLiquidGlass({ ambientGlow: checked })}
          />
          <LiquidGlassToggle
            label={t("lgToggleAccessibility")}
            checked={state.preferences.liquidGlass.respectAccessibility}
            onChange={(checked) =>
              persistLiquidGlass({ respectAccessibility: checked })
            }
          />
          {state.preferences.liquidGlass.animatedRipples ? (
            <>
              <LiquidGlassRange
                label={t("lgRippleAmplitudeLabel")}
                value={state.preferences.liquidGlass.rippleAmplitude}
                min={0}
                max={14}
                onPreview={(value) =>
                  previewLiquidGlass({ rippleAmplitude: value })
                }
                onCommit={(value) =>
                  persistLiquidGlass({ rippleAmplitude: value })
                }
              />
              <LiquidGlassRange
                label={t("lgRippleSpeedLabel")}
                value={state.preferences.liquidGlass.rippleSpeed}
                min={0.1}
                max={1.6}
                onPreview={(value) =>
                  previewLiquidGlass({ rippleSpeed: value })
                }
                onCommit={(value) => persistLiquidGlass({ rippleSpeed: value })}
              />
              <LiquidGlassRange
                label={t("lgRippleOpacityLabel")}
                value={state.preferences.liquidGlass.rippleOpacity}
                min={0}
                max={0.55}
                onPreview={(value) =>
                  previewLiquidGlass({ rippleOpacity: value })
                }
                onCommit={(value) =>
                  persistLiquidGlass({ rippleOpacity: value })
                }
              />
            </>
          ) : null}
          {state.preferences.liquidGlass.pointerParallax ? (
            <LiquidGlassRange
              label={t("lgParallaxDepthLabel")}
              value={state.preferences.liquidGlass.parallaxDepth}
              min={0}
              max={24}
              onPreview={(value) =>
                previewLiquidGlass({ parallaxDepth: value })
              }
              onCommit={(value) => persistLiquidGlass({ parallaxDepth: value })}
            />
          ) : null}
          <div className="button-row">
            <button onClick={() => persistLiquidGlass(LIQUID_GLASS_WATER)}>
              {t("lgPresetWater")}
            </button>
            <button onClick={() => persistLiquidGlass(LIQUID_GLASS_SOLID)}>
              {t("lgPresetSolid")}
            </button>
          </div>
          <hr />
          <h3>{t("language")}</h3>
          <p className="muted">{t("languageDescription")}</p>
          <label>
            {t("languageLabel")}
            <select
              value={state.preferences.locale}
              onChange={(event) =>
                persistPreferences({
                  locale: event.target.value as "vi" | "ko" | "en",
                })
              }
            >
              <option value="vi">Tiếng Việt</option>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
      ) : section === "privacy" ? (
        <PrivacyData
          locale={state.preferences.locale}
          showBackup={showBackup}
          onState={onState}
          onError={onError}
        />
      ) : section === "connections" ? (
        <Connections locale={state.preferences.locale} />
      ) : section === "usage" ? (
        <TokenUsage
          locale={state.preferences.locale}
          projectRoot={projectRoot}
          onError={onError}
        />
      ) : ["permissions", "tools", "commands"].includes(section) ? (
        <SystemSurfaces
          mode={section as "permissions" | "tools" | "commands"}
          locale={state.preferences.locale}
          projectRoot={projectRoot}
          onOpenTerminal={onOpenTerminal}
          onError={onError}
        />
      ) : (
        <>
          <h2>Model & Runtime</h2>
          <p className="muted">{t("runtimeIntro")}</p>
          <ModelManager
            state={state}
            locale={state.preferences.locale}
            onState={onState}
            onError={onError}
          />
          <div className="card settings-card runtime-settings-card">
            <h2>Yana runtime</h2>
            <p>{t("runtimeDirect")}</p>
            <code className="path-block">
              {state.runtime || t("runtimeMissing")}
            </code>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const runtime = await window.studio.chooseRuntime();
                  if (runtime) onState({ ...state, runtime });
                })
              }
            >
              <FolderOpen size={15} /> {t("chooseRuntime")}
            </button>
            <hr />
            <h3>
              <Shield size={16} /> {t("authorityBoundary")}
            </h3>
            <p>{t("authorityChain")}</p>
            <p className="muted">
              {t("keyStorageLabel")} {state.credentialStorage}.{" "}
              {t("keyStorageNote")}
            </p>
          </div>
          <ModelOrchestration
            state={state}
            locale={state.preferences.locale}
            projectRoot={projectRoot}
            onState={onState}
            onError={onError}
          />
        </>
      )}
    </section>
  );
}

function LiquidGlassRange({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="range-setting">
      <span>
        {label}
        <output>{format ? format(value) : value.toFixed(2)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onPreview(Number(event.target.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
        onBlur={(event) => onCommit(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function LiquidGlassToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="lg-toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
