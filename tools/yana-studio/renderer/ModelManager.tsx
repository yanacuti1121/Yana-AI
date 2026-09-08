import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Cloud,
  Cpu,
  KeyRound,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import type {
  LocalModelRuntime,
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
          return (
            <button
              key={entry.id}
              className={`provider-card ${state.profile.provider === entry.id ? "active" : ""}`}
              onClick={() => selectProvider(entry.id)}
            >
              <span className="provider-monogram">
                {entry.kind === "cloud" ? (
                  <Cloud size={18} />
                ) : (
                  <Cpu size={18} />
                )}
              </span>
              <span className="provider-card-body">
                <strong>{entry.label}</strong>
                <small>{entry.company}</small>
                <code>{entry.defaultModel || "User-defined model"}</code>
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
