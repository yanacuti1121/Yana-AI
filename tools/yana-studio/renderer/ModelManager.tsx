import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Cloud,
  Cpu,
  KeyRound,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import type {
  LocalModelRuntime,
  ModelCatalogEntry,
  Profile,
  ProviderCatalogEntry,
  State,
} from "./types";

function providerProfile(provider: ProviderCatalogEntry): Profile {
  return {
    provider: provider.id,
    model: provider.defaultModel,
    baseUrl: provider.baseUrl || "",
  };
}

function kindLabel(provider: ProviderCatalogEntry) {
  if (provider.kind === "cloud") return "Cloud";
  if (provider.kind === "local") return "Local";
  return "Custom";
}

// Deterministic per-provider accent hue so the picker reads like a real
// multi-provider platform (OpenRouter/Cursor style) without shipping
// external brand logos — the artifact/app CSP only allows a small script
// CDN allowlist, no arbitrary image hosts, so a generated color is the
// honest way to give each provider a distinct identity.
function providerHue(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1)
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  return hash;
}

function ModelRow({
  model,
  active,
  onSelect,
}: {
  model: ModelCatalogEntry;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`model-row ${active ? "active" : ""}`}
      onClick={onSelect}
    >
      <span className="model-row-main">
        <strong>{model.label}</strong>
        <code>{model.id}</code>
      </span>
      <span className="model-row-meta">
        {model.context !== "—" && (
          <span className="model-context">{model.context}</span>
        )}
        {model.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="model-tag">
            {tag}
          </span>
        ))}
      </span>
    </button>
  );
}

function ModelSearchResult({
  provider,
  model,
  onSelect,
}: {
  provider: ProviderCatalogEntry;
  model: ModelCatalogEntry;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="model-search-result" onClick={onSelect}>
      <span
        className="provider-monogram small"
        style={{
          background: `hsl(${providerHue(provider.id)} 45% 20%)`,
          color: `hsl(${providerHue(provider.id)} 85% 75%)`,
        }}
      >
        {provider.label[0]}
      </span>
      <span className="model-row-main">
        <strong>{model.label}</strong>
        <small>
          {provider.label} · <code>{model.id}</code>
        </small>
      </span>
      <span className="model-row-meta">
        {model.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="model-tag">
            {tag}
          </span>
        ))}
      </span>
    </button>
  );
}

export function ModelManager({
  state,
  onState,
  onError,
  compact = false,
  onManage,
}: {
  state: State;
  onState: (state: State) => void;
  onError: (message: string) => void;
  compact?: boolean;
  onManage?: () => void;
}) {
  const [profile, setProfile] = useState<Profile>(state.profile);
  const [secret, setSecret] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [localRuntimes, setLocalRuntimes] = useState<LocalModelRuntime[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const provider = useMemo(
    () =>
      state.providerCatalog.find((entry) => entry.id === profile.provider) ||
      state.providerCatalog[0],
    [profile.provider, state.providerCatalog],
  );
  const configured = state.configuredProviders.includes(profile.provider);
  const availableModels = Array.from(
    new Set([...provider.models, ...models].filter(Boolean)),
  );
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return state.providerCatalog.flatMap((entry) =>
      entry.modelCatalog
        .filter(
          (model) =>
            model.id.toLowerCase().includes(needle) ||
            model.label.toLowerCase().includes(needle) ||
            entry.label.toLowerCase().includes(needle) ||
            model.tags.some((tag) => tag.includes(needle)),
        )
        .map((model) => ({ provider: entry, model })),
    );
  }, [query, state.providerCatalog]);

  useEffect(() => setProfile(state.profile), [state.profile]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const selectProvider = (id: string) => {
    const next = state.providerCatalog.find((entry) => entry.id === id);
    if (!next) return;
    setProfile(providerProfile(next));
    setModels(next.models);
    setSecret("");
  };
  const pickModel = (target: ProviderCatalogEntry, modelId: string) => {
    setProfile({ ...providerProfile(target), model: modelId });
    setModels(target.models);
    setSecret("");
    setQuery("");
  };
  const save = () =>
    run(async () => {
      onState(await window.studio.saveProfile(profile, secret));
      setSecret("");
    });
  const discover = () =>
    run(async () => {
      const discovered = await window.studio.discoverModels(profile, secret);
      setModels(discovered);
      if (!profile.model && discovered[0])
        setProfile((current) => ({ ...current, model: discovered[0] }));
    });

  const providerOptions = (
    <>
      <optgroup label="Cloud">
        {state.providerCatalog
          .filter((entry) => entry.kind === "cloud")
          .map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
              {compact ? "" : ` · ${entry.company}`}
            </option>
          ))}
      </optgroup>
      <optgroup label="Local">
        {state.providerCatalog
          .filter((entry) => entry.kind === "local")
          .map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
              {compact ? "" : ` · ${entry.company}`}
            </option>
          ))}
      </optgroup>
      <optgroup label="Custom">
        {state.providerCatalog
          .filter((entry) => entry.kind === "custom")
          .map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
      </optgroup>
    </>
  );

  if (compact)
    return (
      <div className="model-manager compact-model-manager">
        <div className="model-status-line">
          {provider.kind === "cloud" ? <Cloud size={15} /> : <Cpu size={15} />}
          <span>{kindLabel(provider)}</span>
          <b>{provider.label}</b>
          <span className={configured ? "success" : "muted"}>
            {configured
              ? "Key đã mã hóa"
              : provider.requiresKey
                ? "Cần API key"
                : "Không cần key"}
          </span>
        </div>
        <label>
          Provider
          <select
            value={profile.provider}
            onChange={(event) => selectProvider(event.target.value)}
          >
            {providerOptions}
          </select>
        </label>
        <label>
          Model
          <input
            list="inspector-model-options"
            value={profile.model}
            placeholder="Model ID"
            onChange={(event) =>
              setProfile({ ...profile, model: event.target.value })
            }
          />
          <datalist id="inspector-model-options">
            {availableModels.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
        {provider.modelCatalog.length > 0 && (
          <div className="model-pick-list compact">
            {provider.modelCatalog.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                active={model.id === profile.model}
                onSelect={() => pickModel(provider, model.id)}
              />
            ))}
          </div>
        )}
        <div className="button-row">
          <button
            className="primary"
            disabled={
              busy || !profile.model || (provider.requiresKey && !configured)
            }
            onClick={() => void save()}
          >
            <Check size={14} /> Dùng model
          </button>
          <button onClick={onManage}>
            <Settings2 size={14} /> Quản lý
          </button>
        </div>
        {provider.requiresKey && !configured && (
          <p className="model-warning">
            Thêm key trong Settings trước khi sử dụng provider này.
          </p>
        )}
      </div>
    );

  return (
    <div className="model-manager">
      <label className="model-search">
        <Search size={14} />
        <input
          value={query}
          placeholder="Tìm model theo tên, provider hoặc khả năng (vision, reasoning, cheap...)"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {searchResults.length > 0 && (
        <div className="model-search-results">
          {searchResults.slice(0, 8).map(({ provider: entry, model }) => (
            <ModelSearchResult
              key={`${entry.id}:${model.id}`}
              provider={entry}
              model={model}
              onSelect={() => pickModel(entry, model.id)}
            />
          ))}
        </div>
      )}
      <div className="settings-grid model-settings-grid">
        <div className="card settings-card">
          <div className="settings-heading-row">
            <div>
              <h2>Model đang dùng</h2>
              <p className="muted">
                Cùng catalog với yana-rt; mỗi provider giữ key riêng.
              </p>
            </div>
            <span className="provider-kind">
              {provider.kind === "cloud" ? (
                <Cloud size={14} />
              ) : (
                <Cpu size={14} />
              )}
              {kindLabel(provider)}
            </span>
          </div>
          <label>
            Provider
            <select
              value={profile.provider}
              onChange={(event) => selectProvider(event.target.value)}
            >
              {providerOptions}
            </select>
          </label>
          {provider.discoverable && (
            <label>
              Endpoint
              <input
                value={profile.baseUrl}
                disabled={provider.canonical}
                placeholder="http://127.0.0.1:1234/v1"
                onChange={(event) =>
                  setProfile({ ...profile, baseUrl: event.target.value })
                }
              />
              <small>
                Provider Yana chính thức dùng endpoint cố định. Custom chỉ nhận
                HTTPS hoặc loopback HTTP.
              </small>
            </label>
          )}
          {(provider.requiresKey || provider.kind === "custom") && (
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={secret}
                placeholder={
                  configured
                    ? "Đã mã hóa · nhập key mới để thay thế"
                    : provider.requiresKey
                      ? `Nhập ${provider.envVar}`
                      : "Không bắt buộc"
                }
                onChange={(event) => setSecret(event.target.value)}
              />
              <small>
                Key chỉ đi tới trusted host và OS secure storage; renderer không
                thể đọc key đã lưu trở lại.
              </small>
            </label>
          )}
          <label>
            Model ID
            <input
              list="settings-model-options"
              value={profile.model}
              placeholder="ID chính xác từ provider"
              onChange={(event) =>
                setProfile({ ...profile, model: event.target.value })
              }
            />
            <datalist id="settings-model-options">
              {availableModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>
          {provider.modelCatalog.length > 0 && (
            <div className="model-pick-list">
              {provider.modelCatalog.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  active={model.id === profile.model}
                  onSelect={() => pickModel(provider, model.id)}
                />
              ))}
              <p className="model-pick-hint">
                Gợi ý model phổ biến — không phải danh sách trực tiếp từ
                provider. Bấm &quot;Dò model&quot; hoặc nhập ID chính xác nếu
                khác.
              </p>
            </div>
          )}
          <div className="button-row">
            {provider.discoverable && (
              <button
                disabled={
                  busy || (!profile.baseUrl && provider.kind === "custom")
                }
                onClick={() => void discover()}
              >
                <RefreshCw size={14} /> Dò model
              </button>
            )}
            <button
              className="primary"
              disabled={
                busy ||
                !profile.model.trim() ||
                (provider.requiresKey && !configured && !secret)
              }
              onClick={() => void save()}
            >
              <Check size={14} /> Lưu và sử dụng
            </button>
            {configured && (
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Xóa key đã lưu cho ${provider.label}?`))
                    return;
                  void run(async () => {
                    onState(await window.studio.clearProviderKey(provider.id));
                    setSecret("");
                  });
                }}
              >
                <Trash2 size={14} /> Xóa key
              </button>
            )}
          </div>
          <div className="credential-boundary">
            <KeyRound size={15} />
            <span>
              {configured
                ? `Credential ${provider.label}: ${state.credentialStorage}.`
                : provider.requiresKey
                  ? `${provider.label} chưa có credential.`
                  : `${provider.label} chạy không cần API key.`}
            </span>
          </div>
        </div>
        <div className="card settings-card">
          <div className="settings-heading-row">
            <div>
              <h2>Local AI trên máy</h2>
              <p className="muted">
                Dò endpoint từ trusted host, không qua renderer.
              </p>
            </div>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setLocalRuntimes(await window.studio.inspectLocalModels()),
                )
              }
            >
              <RefreshCw size={14} /> Quét local
            </button>
          </div>
          {localRuntimes.length ? (
            <div className="local-runtime-list">
              {localRuntimes.map((runtime) => (
                <button
                  key={runtime.provider}
                  className="local-runtime-card"
                  disabled={runtime.status !== "ready"}
                  onClick={() => {
                    const next = state.providerCatalog.find(
                      (entry) => entry.id === runtime.provider,
                    );
                    if (!next) return;
                    setProfile({
                      ...providerProfile(next),
                      model: runtime.models[0] || next.defaultModel,
                    });
                    setModels(runtime.models);
                  }}
                >
                  <span>
                    <b>{runtime.name}</b>
                    <small>{runtime.endpoint}</small>
                  </span>
                  <span
                    className={runtime.status === "ready" ? "success" : "muted"}
                  >
                    {runtime.status === "ready"
                      ? `${runtime.models.length} model · ${runtime.latencyMs} ms`
                      : "Chưa chạy"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">
              Bấm Quét local để tìm 9Router, Ollama, LM Studio, llama.cpp,
              TurboFieldfare và AirLLM.
            </p>
          )}
        </div>
      </div>
      <div className="provider-library-heading">
        <div>
          <h2>Provider library</h2>
          <p className="muted">
            {state.providerCatalog.filter((entry) => entry.canonical).length}{" "}
            provider chính thức từ catalog Rust · Cloud và Local.
          </p>
        </div>
      </div>
      <div className="provider-library">
        {state.providerCatalog.map((entry) => {
          const hasCredential = state.configuredProviders.includes(entry.id);
          const hue = providerHue(entry.id);
          return (
            <button
              key={entry.id}
              className={`provider-card ${state.profile.provider === entry.id ? "active" : ""}`}
              onClick={() => selectProvider(entry.id)}
            >
              <span
                className="provider-monogram"
                style={{
                  background: `hsl(${hue} 45% 18%)`,
                  color: `hsl(${hue} 85% 72%)`,
                }}
              >
                {entry.kind === "cloud" ? (
                  <Cloud size={18} />
                ) : (
                  <Cpu size={18} />
                )}
              </span>
              <span className="provider-card-body">
                <strong>{entry.label}</strong>
                <small>{entry.company}</small>
                {entry.modelCatalog.length > 1 ? (
                  <span className="provider-model-tags">
                    {entry.modelCatalog[0].tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="model-tag">
                        {tag}
                      </span>
                    ))}
                    <span className="model-count">
                      {entry.modelCatalog.length} models
                    </span>
                  </span>
                ) : (
                  <code>{entry.defaultModel || "User-defined model"}</code>
                )}
              </span>
              <span
                className={
                  entry.requiresKey && !hasCredential
                    ? "provider-state needs-key"
                    : "provider-state"
                }
              >
                {hasCredential
                  ? "Key encrypted"
                  : entry.requiresKey
                    ? "Needs key"
                    : "Keyless"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
