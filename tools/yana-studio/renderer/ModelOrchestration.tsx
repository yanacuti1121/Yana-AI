import { useEffect, useState } from "react";
import { Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import type {
  MoAModelRef,
  MoAPreset,
  MoARunResult,
  MoAReferenceModel,
  Profile,
  State,
  TitleModelConfig,
} from "./types";
import { translate, type Locale } from "./i18n";

function newId() {
  return crypto.randomUUID();
}

function emptyPreset(): MoAPreset {
  return {
    id: newId(),
    name: "",
    enabled: false,
    referenceModels: [],
    aggregator: { provider: "", model: "" },
    contextWindow: "auto",
    fallbackModels: [],
  };
}

// Shared provider+model select used for aggregator/reference/fallback rows
// -- reuses the same providerCatalog every other model picker in Studio
// reads from (state.providerCatalog), never a second catalog.
function ModelRefPicker({
  state,
  value,
  onChange,
}: {
  state: State;
  value: MoAModelRef;
  onChange: (next: MoAModelRef) => void;
}) {
  const provider =
    state.providerCatalog.find((entry) => entry.id === value.provider) ||
    state.providerCatalog[0];
  return (
    <span className="moa-model-ref">
      <select
        value={value.provider || provider?.id || ""}
        onChange={(event) => {
          const next = state.providerCatalog.find(
            (entry) => entry.id === event.target.value,
          );
          onChange({
            provider: event.target.value,
            model: next?.defaultModel || "",
          });
        }}
      >
        {state.providerCatalog.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <input
        list={`moa-models-${value.provider}`}
        value={value.model}
        placeholder="Model ID"
        onChange={(event) =>
          onChange({ provider: value.provider, model: event.target.value })
        }
      />
      <datalist id={`moa-models-${value.provider}`}>
        {provider?.modelCatalog.map((model) => (
          <option key={model.id} value={model.id} />
        ))}
      </datalist>
    </span>
  );
}

function PresetEditor({
  state,
  locale,
  preset,
  onChange,
  onCancel,
  onSave,
  busy,
}: {
  state: State;
  locale: Locale;
  preset: MoAPreset;
  onChange: (next: MoAPreset) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const t = translate(locale);
  const firstProvider = state.providerCatalog[0];
  const addReference = () =>
    onChange({
      ...preset,
      referenceModels: [
        ...preset.referenceModels,
        {
          id: newId(),
          provider: firstProvider?.id || "",
          model: firstProvider?.defaultModel || "",
          enabled: true,
        },
      ],
    });
  const updateReference = (id: string, ref: MoAModelRef) =>
    onChange({
      ...preset,
      referenceModels: preset.referenceModels.map((entry) =>
        entry.id === id ? { ...entry, ...ref } : entry,
      ),
    });
  const toggleReference = (id: string) =>
    onChange({
      ...preset,
      referenceModels: preset.referenceModels.map((entry) =>
        entry.id === id ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    });
  const removeReference = (id: string) =>
    onChange({
      ...preset,
      referenceModels: preset.referenceModels.filter(
        (entry) => entry.id !== id,
      ),
    });
  const addFallback = () =>
    onChange({
      ...preset,
      fallbackModels: [
        ...preset.fallbackModels,
        { provider: firstProvider?.id || "", model: firstProvider?.defaultModel || "" },
      ],
    });
  const updateFallback = (index: number, ref: MoAModelRef) =>
    onChange({
      ...preset,
      fallbackModels: preset.fallbackModels.map((entry, i) =>
        i === index ? ref : entry,
      ),
    });
  const moveFallback = (index: number, delta: number) => {
    const next = [...preset.fallbackModels];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...preset, fallbackModels: next });
  };
  const removeFallback = (index: number) =>
    onChange({
      ...preset,
      fallbackModels: preset.fallbackModels.filter((_, i) => i !== index),
    });

  return (
    <div className="moa-preset-editor">
      <label>
        {t("moaPresetNameLabel")}
        <input
          value={preset.name}
          maxLength={200}
          onChange={(event) => onChange({ ...preset, name: event.target.value })}
        />
      </label>
      <h4>{t("moaReferenceModelsLabel")}</h4>
      {preset.referenceModels.map((reference: MoAReferenceModel) => (
        <div key={reference.id} className="moa-reference-row">
          <input
            type="checkbox"
            checked={reference.enabled}
            onChange={() => toggleReference(reference.id)}
          />
          <ModelRefPicker
            state={state}
            value={reference}
            onChange={(ref) => updateReference(reference.id, ref)}
          />
          <button
            type="button"
            className="danger-button"
            onClick={() => removeReference(reference.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addReference}>
        <Plus size={13} /> {t("moaAddReferenceModel")}
      </button>
      <h4>{t("moaAggregatorLabel")}</h4>
      <ModelRefPicker
        state={state}
        value={preset.aggregator}
        onChange={(ref) => onChange({ ...preset, aggregator: ref })}
      />
      <h4>{t("moaContextWindowLabel")}</h4>
      <p className="muted small">{t("moaContextWindowNote")}</p>
      <h4>{t("moaFallbackModelsLabel")}</h4>
      <p className="muted small">{t("moaFallbackDescription")}</p>
      {preset.fallbackModels.map((fallback, index) => (
        <div key={index} className="moa-reference-row">
          <span className="moa-fallback-order">{index + 1}</span>
          <ModelRefPicker
            state={state}
            value={fallback}
            onChange={(ref) => updateFallback(index, ref)}
          />
          <button type="button" onClick={() => moveFallback(index, -1)}>
            ↑
          </button>
          <button type="button" onClick={() => moveFallback(index, 1)}>
            ↓
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => removeFallback(index)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addFallback}>
        <Plus size={13} /> {t("moaAddFallbackModel")}
      </button>
      <label className="moa-enabled-toggle">
        <input
          type="checkbox"
          checked={preset.enabled}
          onChange={(event) =>
            onChange({ ...preset, enabled: event.target.checked })
          }
        />
        {t("moaEnabledLabel")}
      </label>
      <div className="button-row">
        <button className="primary" disabled={busy} onClick={onSave}>
          {t("saveLabel")}
        </button>
        <button onClick={onCancel}>{t("cancelLabel")}</button>
      </div>
    </div>
  );
}

function ActivityLog({ result, locale }: { result: MoARunResult; locale: Locale }) {
  const t = translate(locale);
  return (
    <div className="moa-activity-log">
      {result.steps.map((step, index) => (
        <div
          key={index}
          className={`moa-activity-step ${step.ok ? "ok" : "failed"}`}
        >
          <strong>
            {step.kind === "reference"
              ? t("moaStepReference")
              : step.kind === "aggregator"
                ? t("moaStepAggregator")
                : t("moaStepFallback")}
          </strong>
          <code>
            {step.provider}/{step.model}
          </code>
          <span>{step.ok ? t("moaStepOk") : t("moaStepFailed")}</span>
          {step.reason && <small>{step.reason}</small>}
          <p>{step.message.slice(0, 400)}</p>
        </div>
      ))}
      <p className="moa-activity-final">
        {result.ok
          ? t("moaRunSucceeded")
          : t("moaRunFailed")}
      </p>
    </div>
  );
}

export function ModelOrchestration({
  state,
  locale,
  projectRoot,
  onState,
  onError,
}: {
  state: State;
  locale: Locale;
  projectRoot: string;
  onState: (state: State) => void;
  onError: (message: string) => void;
}) {
  const t = translate(locale);
  const [search, setSearch] = useState("");
  const [autoPreview, setAutoPreview] = useState<Profile | null>(null);
  const [autoPreviewError, setAutoPreviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MoAPreset | null>(null);
  const [runPromptById, setRunPromptById] = useState<Record<string, string>>(
    {},
  );
  const [runResultById, setRunResultById] = useState<
    Record<string, MoARunResult>
  >({});
  const [runningId, setRunningId] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.studio
      .previewAutoProfile()
      .then((profile) => {
        if (cancelled) return;
        setAutoPreview(profile);
        setAutoPreviewError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setAutoPreview(null);
        setAutoPreviewError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [state.configuredProviders]);

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
  const savePresets = (
    presets: MoAPreset[],
    defaultPresetId = state.mixtureOfAgents.defaultPresetId,
  ) =>
    run(async () => {
      onState(
        await window.studio.saveMixtureOfAgents({ presets, defaultPresetId }),
      );
      setEditing(null);
    });
  const removePreset = (id: string) => {
    if (!window.confirm(t("moaConfirmDeletePreset"))) return;
    const presets = state.mixtureOfAgents.presets.filter(
      (preset) => preset.id !== id,
    );
    const defaultPresetId =
      state.mixtureOfAgents.defaultPresetId === id
        ? ""
        : state.mixtureOfAgents.defaultPresetId;
    void savePresets(presets, defaultPresetId);
  };
  const togglePresetEnabled = (preset: MoAPreset) =>
    savePresets(
      state.mixtureOfAgents.presets.map((entry) =>
        entry.id === preset.id ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
  const setDefaultPreset = (id: string) =>
    savePresets(
      state.mixtureOfAgents.presets,
      state.mixtureOfAgents.defaultPresetId === id ? "" : id,
    );
  const runPreset = (preset: MoAPreset) =>
    run(async () => {
      setRunningId(preset.id);
      try {
        const result = await window.studio.runMixtureOfAgentsPreset(
          preset.id,
          runPromptById[preset.id] || "",
          projectRoot,
        );
        setRunResultById((current) => ({ ...current, [preset.id]: result }));
      } finally {
        setRunningId("");
      }
    });
  const saveTitleModel = (config: TitleModelConfig) =>
    run(async () => {
      onState(await window.studio.saveTitleModel(config));
    });

  const needle = search.trim().toLowerCase();
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle);

  return (
    <div className="model-orchestration">
      <label className="model-search">
        <input
          value={search}
          placeholder={t("orchestrationSearchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="model-orchestration-grid">
        {matches(t("autoModelTitle")) && (
          <div className="card settings-card">
            <h2>{t("autoModelTitle")}</h2>
            <p className="muted">{t("autoModelDescription")}</p>
            {autoPreview ? (
              <div className="moa-activity-step ok">
                <strong>{t("autoResolvesToLabel")}</strong>
                <code>
                  {autoPreview.provider}/{autoPreview.model}
                </code>
              </div>
            ) : (
              <div className="moa-activity-step failed">
                <span>{autoPreviewError || t("loadingLabel")}</span>
              </div>
            )}
            <h3 className="appearance-section-title">
              {t("reasoningEffortLabel")}
            </h3>
            <p className="muted small">{t("reasoningEffortUnavailableNote")}</p>
            <select disabled>
              <option>{t("unavailableBadge")}</option>
            </select>
          </div>
        )}
        {matches(t("auxiliaryModelsTitle")) && (
          <div className="card settings-card">
            <h2>{t("auxiliaryModelsTitle")}</h2>
            <p className="muted">{t("auxiliaryModelsDescription")}</p>
            <div className="auxiliary-flow-list">
              {state.auxiliaryFlows
                .filter((id) => matches(t(`auxFlow_${id}_label` as never)))
                .map((id) => (
                  <div key={id} className="auxiliary-flow-row">
                    <div>
                      <strong>{t(`auxFlow_${id}_label` as never)}</strong>
                      <p className="muted small">
                        {t(`auxFlow_${id}_desc` as never)}
                      </p>
                    </div>
                    <span className="roadmap-badge">{t("unavailableBadge")}</span>
                  </div>
                ))}
            </div>
            <button disabled title={t("resetAuxiliaryDisabledReason")}>
              {t("resetAuxiliaryModels")}
            </button>
          </div>
        )}
        {matches(t("titleModelTitle")) && (
          <div className="card settings-card">
            <h2>{t("titleModelTitle")}</h2>
            <p className="muted">{t("titleModelDescription")}</p>
            <label className="moa-enabled-toggle">
              <input
                type="checkbox"
                checked={state.titleModel.enabled}
                onChange={(event) =>
                  void saveTitleModel({
                    ...state.titleModel,
                    enabled: event.target.checked,
                  })
                }
              />
              {t("titleModelEnableLabel")}
            </label>
            {state.titleModel.enabled ? (
              <>
                <label className="moa-enabled-toggle">
                  <input
                    type="radio"
                    name="title-model-source"
                    checked={state.titleModel.useMainModel}
                    onChange={() =>
                      void saveTitleModel({
                        enabled: true,
                        useMainModel: true,
                        provider: "",
                        model: "",
                      })
                    }
                  />
                  {t("titleModelUseMainModelLabel")}
                </label>
                <label className="moa-enabled-toggle">
                  <input
                    type="radio"
                    name="title-model-source"
                    checked={!state.titleModel.useMainModel}
                    onChange={() =>
                      void saveTitleModel({
                        enabled: true,
                        useMainModel: false,
                        provider:
                          state.titleModel.provider ||
                          state.providerCatalog[0]?.id ||
                          "",
                        model:
                          state.titleModel.model ||
                          state.providerCatalog[0]?.defaultModel ||
                          "",
                      })
                    }
                  />
                  {t("titleModelCustomModelLabel")}
                </label>
                {!state.titleModel.useMainModel && (
                  <ModelRefPicker
                    state={state}
                    value={{
                      provider: state.titleModel.provider,
                      model: state.titleModel.model,
                    }}
                    onChange={(ref) =>
                      void saveTitleModel({
                        ...state.titleModel,
                        useMainModel: false,
                        ...ref,
                      })
                    }
                  />
                )}
              </>
            ) : (
              <p className="muted small">{t("titleModelDisabledNote")}</p>
            )}
          </div>
        )}
      </div>
      {matches(t("mixtureOfAgentsTitle")) && (
        <div className="card settings-card moa-section">
          <h2>{t("mixtureOfAgentsTitle")}</h2>
          <p className="muted">{t("mixtureOfAgentsDescription")}</p>
          <p className="muted small">{t("mixtureOfAgentsKnownLimit")}</p>
          {state.mixtureOfAgents.presets.map((preset) => (
            <div key={preset.id} className="moa-preset-card">
              <div className="moa-preset-header">
                <div>
                  <strong>{preset.name || t("moaUnnamedPreset")}</strong>
                  <span className={preset.enabled ? "success" : "muted"}>
                    {preset.enabled
                      ? t("moaEnabledLabel")
                      : t("moaDisabledLabel")}
                  </span>
                  {state.mixtureOfAgents.defaultPresetId === preset.id && (
                    <span className="model-tag">{t("moaDefaultBadge")}</span>
                  )}
                </div>
                <div className="button-row">
                  <button onClick={() => togglePresetEnabled(preset)}>
                    {preset.enabled ? t("disableLabel") : t("enableLabel")}
                  </button>
                  <button
                    disabled={!preset.enabled}
                    onClick={() => setDefaultPreset(preset.id)}
                  >
                    {t("moaSetDefault")}
                  </button>
                  <button onClick={() => setEditing(preset)}>
                    {t("editLabel")}
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => removePreset(preset.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="moa-run-row">
                <input
                  value={runPromptById[preset.id] || ""}
                  placeholder={t("moaRunPromptPlaceholder")}
                  onChange={(event) =>
                    setRunPromptById((current) => ({
                      ...current,
                      [preset.id]: event.target.value,
                    }))
                  }
                />
                <button
                  disabled={
                    busy ||
                    runningId === preset.id ||
                    !runPromptById[preset.id]?.trim()
                  }
                  onClick={() => void runPreset(preset)}
                >
                  {runningId === preset.id ? (
                    <RefreshCw className="spin" size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                  {t("moaRunTest")}
                </button>
              </div>
              {runResultById[preset.id] && (
                <ActivityLog result={runResultById[preset.id]} locale={locale} />
              )}
            </div>
          ))}
          {editing ? (
            <PresetEditor
              state={state}
              locale={locale}
              preset={editing}
              busy={busy}
              onChange={setEditing}
              onCancel={() => setEditing(null)}
              onSave={() =>
                savePresets(
                  state.mixtureOfAgents.presets.some(
                    (entry) => entry.id === editing.id,
                  )
                    ? state.mixtureOfAgents.presets.map((entry) =>
                        entry.id === editing.id ? editing : entry,
                      )
                    : [...state.mixtureOfAgents.presets, editing],
                )
              }
            />
          ) : (
            <button onClick={() => setEditing(emptyPreset())}>
              <Plus size={14} /> {t("moaCreatePreset")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
