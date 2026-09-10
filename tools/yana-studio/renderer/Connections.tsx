import { useEffect, useState } from "react";
import type { IntegrationConnection } from "./types";
import { translate, type Locale } from "./i18n";

export function Connections({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [items, setItems] = useState<IntegrationConnection[]>([]);
  const [error, setError] = useState("");
  const [githubClientId, setGithubClientId] = useState("");
  useEffect(() => {
    const unsubscribe = window.studio.on("integrations:update", setItems);
    window.studio
      .integrationList()
      .then(setItems)
      .catch(() => setError(t("connectionsLoadError")));
    return unsubscribe;
  }, []);
  const connect = async (key: string) => {
    setError("");
    try {
      setItems(await window.studio.integrationConnect(key));
    } catch {
      setError(t("oauthStartError"));
    }
  };
  return (
    <div>
      <h2>Accounts & Connections</h2>
      <p className="muted">{t("connectionsIntro")}</p>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <section className="card settings-card" key={item.key}>
          <h3>
            {item.name} <small>· {item.status.replaceAll("_", " ")}</small>
          </h3>
          <p>
            {item.purpose === "authentication"
              ? t("authPurposeNote")
              : t("servicePurposeNote")}
          </p>
          {item.display_name && <p>{item.display_name}</p>}
          {item.setup && <p className="muted">{item.setup}</p>}
          {item.provider === "github" && (
            <details>
              <summary>{t("githubOauthConfigSummary")}</summary>
              <label>
                {t("githubClientIdLabel")}
                <input
                  aria-label="GitHub OAuth client ID"
                  value={githubClientId}
                  onChange={(event) => setGithubClientId(event.target.value)}
                />
              </label>
              <p>{t("githubOauthHint")}</p>
              <button
                disabled={
                  !githubClientId.trim() ||
                  item.status === "connecting" ||
                  Boolean(item.account_id)
                }
                onClick={async () => {
                  try {
                    setItems(
                      await window.studio.integrationConfigureGithub(
                        githubClientId.trim(),
                      ),
                    );
                    setGithubClientId("");
                  } catch {
                    setError(t("githubClientIdSaveError"));
                  }
                }}
              >
                {t("saveClientId")}
              </button>
              {item.account_id && <p>{t("disconnectBeforeChangeClientId")}</p>}
            </details>
          )}
          {item.user_code && (
            <p role="status">
              {t("deviceCodePrefix")} <strong>{item.user_code}</strong>{" "}
              {t("deviceCodeSuffix")}
            </p>
          )}
          {!item.secure_storage && (
            <p role="alert">{t("secureStorageNotReady")}</p>
          )}
          {item.error && <p role="alert">{item.error.replaceAll("_", " ")}</p>}
          <details>
            <summary>Manage permissions</summary>
            <ul>
              {item.scopes.map((scope) => (
                <li key={scope}>
                  <code>{scope}</code>
                </li>
              ))}
            </ul>
            <p>{t("realPermissionsNote")}</p>
          </details>
          <div className="button-row">
            {item.account_id && item.provider === "google" && (
              <button
                onClick={async () => {
                  try {
                    setItems(await window.studio.integrationRevoke(item.key));
                  } catch {
                    setError(t("revokeFailNote"));
                  }
                }}
              >
                {t("revokeAtGoogle")}
              </button>
            )}
            <button
              disabled={
                !item.enabled ||
                !item.secure_storage ||
                item.status === "connecting"
              }
              onClick={() => void connect(item.key)}
            >
              {item.account_id ? "Reconnect" : "Connect"}
            </button>
            {item.status === "connecting" && (
              <button
                onClick={() => void window.studio.integrationCancel(item.key)}
              >
                {t("cancel")}
              </button>
            )}
            {item.account_id && (
              <button
                onClick={async () => {
                  if (!window.confirm(t("confirmDisconnect"))) return;
                  try {
                    setItems(
                      await window.studio.integrationDisconnect(item.key),
                    );
                  } catch {
                    setError(t("disconnectFailNote"));
                  }
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
