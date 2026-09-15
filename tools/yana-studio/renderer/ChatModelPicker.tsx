import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown, RefreshCw, Search, Settings2 } from "lucide-react";
import type {
  Chat,
  MoAPreset,
  Profile,
  ProviderCatalogEntry,
  State,
} from "./types";
import { translate, type Locale, type MessageKey } from "./i18n";

type FlatOption =
  | { kind: "auto" }
  | { kind: "preset"; preset: MoAPreset }
  | {
      kind: "model";
      provider: ProviderCatalogEntry;
      modelId: string;
      label: string;
    };

// Same "ready to actually use right now" condition host/model-orchestration.cjs's
// resolveAutoProfile() applies -- reused here instead of a second definition so
// the composer picker never lists a provider Auto itself would skip.
function isReady(provider: ProviderCatalogEntry, configuredProviders: string[]) {
  return !provider.requiresKey || configuredProviders.includes(provider.id);
}

function effectiveLabel(profile: Profile, state: State, t: (key: MessageKey) => string) {
  if (profile.provider === "auto") return t("autoModelOption");
  if (profile.provider === "mixture-of-agents") {
    const preset = state.mixtureOfAgents.presets.find(
      (entry) => entry.id === profile.model,
    );
    return preset ? preset.name || t("moaUnnamedPreset") : profile.model;
  }
  const provider = state.providerCatalog.find(
    (entry) => entry.id === profile.provider,
  );
  return profile.model || provider?.label || profile.provider;
}

// New model picker that lives directly in the chat composer, for the
// currently open chat only. Distinct from <ModelManager compact>, which it
// replaces in main.tsx's composer toolbar: selecting a model here calls
// onPendingProfile (a per-chat override main.tsx threads into sendChat's
// new profileOverride argument) instead of window.studio.saveProfile, so it
// never touches the app-wide default new chats start with.
export function ChatModelPicker({
  state,
  locale,
  chat,
  pendingProfile,
  onPendingProfile,
  onManageModels,
}: {
  state: State;
  locale: Locale;
  chat: Chat | null;
  pendingProfile: Profile | undefined;
  onPendingProfile: (profile: Profile) => void;
  onManageModels: () => void;
}) {
  const t = translate(locale);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  // position:fixed with JS-computed viewport coordinates, not CSS-only
  // `position:absolute` anchoring -- .center (the message+composer column)
  // has `overflow:hidden`, which clips an absolutely-positioned popover
  // whenever it needs to extend above .center's own top edge, even though
  // there's plenty of real viewport space above the composer. Fixed
  // positioning escapes that clip (per frontend-production-checklist.md's
  // own overlay-in-a-clipping-ancestor guidance) since neither .center nor
  // any of its ancestors sets a transform/filter that would reintroduce a
  // containing block for fixed-position descendants.
  const [popoverStyle, setPopoverStyle] = useState<{
    position: "fixed";
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const [discovered, setDiscovered] = useState<Record<string, string[]>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});
  const [discoverError, setDiscoverError] = useState<Record<string, string>>(
    {},
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const effective = pendingProfile ?? chat?.profile ?? state.profile;

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceAbove >= 320 || spaceAbove >= spaceBelow;
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - 328),
      );
      setPopoverStyle({
        position: "fixed",
        left,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
      });
    };
    setSearch("");
    setHighlighted(0);
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

  const needle = search.trim().toLowerCase();
  const matches = (...values: string[]) =>
    !needle || values.some((value) => value.toLowerCase().includes(needle));

  const presets = useMemo(
    () => state.mixtureOfAgents.presets.filter((preset) => preset.enabled),
    [state.mixtureOfAgents.presets],
  );

  const options = useMemo<FlatOption[]>(() => {
    const list: FlatOption[] = [];
    if (matches("auto", t("autoModelOption"))) list.push({ kind: "auto" });
    for (const preset of presets) {
      if (matches(preset.name || t("moaUnnamedPreset"), "mixture of agents"))
        list.push({ kind: "preset", preset });
    }
    for (const provider of state.providerCatalog) {
      if (!isReady(provider, state.configuredProviders)) continue;
      const modelIds =
        discovered[provider.id] || provider.modelCatalog.map((entry) => entry.id);
      for (const modelId of modelIds) {
        const label =
          provider.modelCatalog.find((entry) => entry.id === modelId)?.label ||
          modelId;
        if (matches(provider.label, modelId, label))
          list.push({ kind: "model", provider, modelId, label });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, state.providerCatalog, state.configuredProviders, discovered, needle]);

  useEffect(() => {
    setHighlighted((current) =>
      Math.min(current, Math.max(options.length - 1, 0)),
    );
  }, [options.length]);

  const applyOption = (option: FlatOption) => {
    if (option.kind === "auto")
      onPendingProfile({ provider: "auto", model: "", baseUrl: "" });
    else if (option.kind === "preset")
      onPendingProfile({
        provider: "mixture-of-agents",
        model: option.preset.id,
        baseUrl: "",
      });
    else
      onPendingProfile({
        provider: option.provider.id,
        model: option.modelId,
        baseUrl: option.provider.baseUrl || "",
      });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const refreshProvider = async (provider: ProviderCatalogEntry) => {
    if (!provider.discoverable) return;
    setDiscovering((current) => ({ ...current, [provider.id]: true }));
    setDiscoverError((current) => ({ ...current, [provider.id]: "" }));
    try {
      const models = await window.studio.discoverModels(
        {
          provider: provider.id,
          model: provider.defaultModel,
          baseUrl: provider.baseUrl || "",
        },
        "",
      );
      setDiscovered((current) => ({ ...current, [provider.id]: models }));
    } catch (error) {
      setDiscoverError((current) => ({
        ...current,
        [provider.id]: String(error).replace(/^Error:\s*/, ""),
      }));
    } finally {
      setDiscovering((current) => ({ ...current, [provider.id]: false }));
    }
  };
  const readyProviders = state.providerCatalog.filter((provider) =>
    isReady(provider, state.configuredProviders),
  );
  const unreadyProviders = state.providerCatalog.filter(
    (provider) =>
      !isReady(provider, state.configuredProviders) && matches(provider.label),
  );
  const anyDiscovering = Object.values(discovering).some(Boolean);
  const firstDiscoverError = Object.values(discoverError).find(Boolean);
  const refreshAll = () =>
    Promise.all(
      readyProviders
        .filter((provider) => provider.discoverable)
        .map((provider) => refreshProvider(provider)),
    );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, options.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = options[highlighted];
      if (option) applyOption(option);
    }
  };
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="model-pill-anchor chat-model-picker" ref={anchorRef}>
      <button
        ref={triggerRef}
        className="composer-model-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t("chooseModel")}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        {effectiveLabel(effective, state, t)} <ChevronDown size={13} />
      </button>
      <button
        type="button"
        className="composer-effort-button"
        disabled
        aria-label={t("reasoningEffortLabel")}
        title={t("reasoningEffortUnavailableNote")}
      >
        {t("reasoningEffortLabel")}
      </button>
      {open && popoverStyle && (
        <div
          className="model-popover chat-model-popover"
          style={popoverStyle}
          role="listbox"
          aria-label={t("composerModelPickerAria")}
          onKeyDown={onKeyDown}
        >
          <label className="model-search">
            <Search size={14} />
            <input
              ref={searchRef}
              autoFocus
              value={search}
              placeholder={t("modelSearchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {chat?.running && (
            <p className="muted small chat-model-picker-note">
              {t("appliesNextTurnNote")}
            </p>
          )}
          <div className="chat-model-picker-list">
            {options.length === 0 && (
              <p className="muted small">{t("noModelsFoundLabel")}</p>
            )}
            {options.map((option, index) => {
              const active =
                option.kind === "auto"
                  ? effective.provider === "auto"
                  : option.kind === "preset"
                    ? effective.provider === "mixture-of-agents" &&
                      effective.model === option.preset.id
                    : effective.provider === option.provider.id &&
                      effective.model === option.modelId;
              const key =
                option.kind === "auto"
                  ? "auto"
                  : option.kind === "preset"
                    ? `preset:${option.preset.id}`
                    : `${option.provider.id}:${option.modelId}`;
              return (
                <button
                  type="button"
                  key={key}
                  role="option"
                  aria-selected={active}
                  className={`model-row chat-model-option ${
                    index === highlighted ? "highlighted" : ""
                  } ${active ? "active" : ""}`}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => applyOption(option)}
                >
                  <span className="model-row-main">
                    <strong>
                      {option.kind === "auto"
                        ? t("autoModelOption")
                        : option.kind === "preset"
                          ? option.preset.name || t("moaUnnamedPreset")
                          : option.label}
                    </strong>
                    <small>
                      {option.kind === "auto"
                        ? t("autoModelInlineNote")
                        : option.kind === "preset"
                          ? "Mixture of Agents"
                          : option.provider.label}
                    </small>
                  </span>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
          {unreadyProviders.length > 0 && (
            <div className="chat-model-picker-unready">
              {unreadyProviders.map((provider) => (
                <div key={provider.id} className="chat-model-picker-unready-row">
                  <span>{provider.label}</span>
                  <span className="muted small">
                    {t("providerNotConnectedLabel")}
                  </span>
                </div>
              ))}
            </div>
          )}
          {firstDiscoverError && (
            <p className="muted small chat-model-picker-error" role="alert">
              {firstDiscoverError}
            </p>
          )}
          <div className="chat-model-picker-footer">
            <button
              type="button"
              disabled={anyDiscovering}
              onClick={() => void refreshAll()}
            >
              <RefreshCw size={13} className={anyDiscovering ? "spin" : ""} />
              {t("refreshModelListLabel")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManageModels();
              }}
            >
              <Settings2 size={13} /> {t("manageModelsLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
