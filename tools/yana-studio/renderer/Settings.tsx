import { useState } from "react";
import { ArrowLeft, FolderOpen, Shield } from "lucide-react";
import type { State } from "./types";
import { Connections } from "./Connections";
import { ModelManager } from "./ModelManager";
import { PrivacyData } from "./PrivacyData";
import { translate } from "./i18n";
import { SystemSurfaces } from "./SystemSurfaces";
import { AccountSettings } from "./AccountSettings";
import { TokenUsage } from "./TokenUsage";

export function Settings({
  state,
  onState,
  onClose,
  onError,
  projectRoot,
  onOpenTerminal,
  onShowOnboarding,
}: {
  state: State;
  onState: (state: State) => void;
  onClose: () => void;
  onError: (message: string) => void;
  projectRoot: string;
  onOpenTerminal: (command?: string) => void;
  onShowOnboarding: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("account");
  const t = translate(state.preferences.locale);
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
      <button className="settings-tour-button" onClick={onShowOnboarding}>
        {t("showIntroduction")}
      </button>
      <div className="button-row">
        {[
          ["account", t("account")],
          ["appearance", t("language")],
          ["models", t("modelRuntime")],
          ["usage", t("usage")],
          ["connections", t("connections")],
          ["permissions", t("permissions")],
          ["tools", t("tools")],
          ["commands", t("commands")],
          ["privacy", t("privacy")],
        ].map(([id, label]) => (
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
        <AccountSettings state={state} onState={onState} onError={onError} />
      ) : section === "appearance" ? (
        <div className="card settings-card settings-language">
          <h2>{t("language")}</h2>
          <p className="muted">{t("languageDescription")}</p>
          <label>
            {t("languageLabel")}
            <select
              value={state.preferences.locale}
              onChange={(event) =>
                void run(async () => {
                  onState(
                    await window.studio.savePreferences({
                      locale: event.target.value as "vi" | "ko" | "en",
                    }),
                  );
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
        <PrivacyData onState={onState} onError={onError} />
      ) : section === "connections" ? (
        <Connections />
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
          <p className="muted">
            Cloud và local cùng đi qua TurnEngine và RuntimeAuthority của Yana.
          </p>
          <ModelManager state={state} onState={onState} onError={onError} />
          <div className="card settings-card runtime-settings-card">
            <h2>Yana runtime</h2>
            <p>Studio gọi trực tiếp binary yana-rt, không dùng gateway cũ.</p>
            <code className="path-block">
              {state.runtime ||
                "Chưa chọn yana-rt; editor và terminal vẫn dùng được."}
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
              <FolderOpen size={15} /> Chọn yana-rt
            </button>
            <hr />
            <h3>
              <Shield size={16} /> Ranh giới quyền hạn
            </h3>
            <p>
              Chat → TurnEngine → RuntimeAuthority → Giám Thị. Terminal vẫn là
              shell của người dùng và không phải đường thực thi AI.
            </p>
            <p className="muted">
              Lưu key: {state.credentialStorage}. Key không được trả lại
              renderer, không nằm trong localStorage hoặc workspace JSON.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
