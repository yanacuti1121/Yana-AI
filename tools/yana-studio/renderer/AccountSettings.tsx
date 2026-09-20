import { useEffect, useState } from "react";
import {
  Github,
  Globe2,
  LoaderCircle,
  Lock,
  LogOut,
  UserRound,
} from "lucide-react";
import type { IntegrationConnection, State } from "./types";
import { translate, type Locale } from "./i18n";

export function AccountSettings({
  state,
  locale,
  onState,
  onError,
  onLocaleChange,
}: {
  state: State;
  locale: Locale;
  onState: (state: State) => void;
  onError: (message: string) => void;
  onLocaleChange?: (locale: Locale) => Promise<void>;
}) {
  const t = translate(locale);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [connecting, setConnecting] = useState<
    "" | "google:identity" | "github:account"
  >("");
  const [changingLocale, setChangingLocale] = useState(false);
  const [githubClientId, setGithubClientId] = useState("");
  useEffect(() => {
    void window.studio
      .integrationList()
      .then(setConnections)
      .catch(() => {});
    return window.studio.on("integrations:update", setConnections);
  }, []);
  const google = connections.find((item) => item.key === "google:identity");
  const github = connections.find((item) => item.key === "github:account");
  const setLocale = (nextLocale: Locale) => {
    if (!onLocaleChange || nextLocale === locale) return;
    setChangingLocale(true);
    void onLocaleChange(nextLocale)
      .catch((error) => onError(String(error)))
      .finally(() => setChangingLocale(false));
  };
  const continueWithProvider = (key: "google:identity" | "github:account") => {
    if (connecting) return;
    setConnecting(key);
    void (async () => {
      let available = connections;
      if (key === "github:account" && !github?.enabled) {
        if (!githubClientId.trim())
          throw new Error(t("githubConfigurationRequired"));
        available = await window.studio.integrationConfigureGithub(
          githubClientId.trim(),
        );
        setConnections(available);
        setGithubClientId("");
      }
      const current = available.find((item) => item.key === key);
      if (current?.account_id && current.status === "connected") {
        onState(
          await (key === "google:identity"
            ? window.studio.accountUseGoogle()
            : window.studio.accountUseGithub()),
        );
        return;
      }
      const updated = await window.studio.integrationConnect(key);
      setConnections(updated);
      const connected = updated.find((item) => item.key === key);
      if (!connected?.account_id || connected.status !== "connected")
        throw new Error(
          key === "google:identity" && connected?.error === "callback_timeout"
            ? t("googleTestingBlocked")
            : key === "google:identity"
              ? t("googleConnectionFailed")
              : t("githubConnectionFailed"),
        );
      onState(
        await (key === "google:identity"
          ? window.studio.accountUseGoogle()
          : window.studio.accountUseGithub()),
      );
    })()
      .catch((error) => onError(String(error)))
      .finally(() => setConnecting(""));
  };
  const identityLabel =
    state.account.mode === "github" ? "GitHub identity" : "Google identity";
  if (state.account.configured)
    return (
      <section className="card settings-card account-current">
        <UserRound size={28} />
        <div>
          <h2>{state.account.displayName}</h2>
          <p>{state.account.email || identityLabel}</p>
          <small>
            {state.account.mode === "local"
              ? "Local password profile"
              : `${identityLabel} profile`}{" "}
            {t("localDataOnlyNote")}
          </small>
        </div>
        <div className="button-row">
          {state.account.mode === "local" && (
            <button
              onClick={() =>
                void window.studio
                  .accountLock()
                  .then(onState)
                  .catch((error) => onError(String(error)))
              }
            >
              <Lock size={15} /> {t("lockStudio")}
            </button>
          )}
          <button
            className="danger-button"
            onClick={() => {
              if (!window.confirm(t("confirmLogout"))) return;
              void window.studio
                .accountLogout()
                .then(onState)
                .catch((error) => onError(String(error)));
            }}
          >
            <LogOut size={15} /> {t("logOut")}
          </button>
        </div>
      </section>
    );
  return (
    <div
      className={`account-settings ${onLocaleChange ? "account-entry" : ""}`}
    >
      {onLocaleChange && (
        <header className="account-entry-header">
          <div className="account-entry-brand">
            <span className="brand-symbol small">Y</span>
            <strong>Yana Studio</strong>
          </div>
          <label className="locale-picker">
            <Globe2 size={15} />
            <select
              aria-label={t("languageLabel")}
              disabled={changingLocale}
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              <option value="vi">VI</option>
              <option value="ko">한국어</option>
              <option value="en">EN</option>
            </select>
          </label>
        </header>
      )}
      <section className="card settings-card account-google-card">
        <span className="brand-symbol">Y</span>
        <h1>{t("googleAccountTitle")}</h1>
        <p>{t("googleAccountNote")}</p>
        {google?.account_id && google.status === "connected" && (
          <p className="account-google-identity">
            <strong>{google.display_name || google.email}</strong>
          </p>
        )}
        <button
          className="primary"
          disabled={Boolean(connecting)}
          onClick={() => continueWithProvider("google:identity")}
        >
          {connecting === "google:identity" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <span className="google-mark" aria-hidden="true">
              G
            </span>
          )}
          {connecting === "google:identity"
            ? t("googleConnecting")
            : google?.account_id && google.status === "connected"
              ? t("useGoogleAsProfile")
              : t("continueWithGoogleTitle")}
        </button>
        <small>
          {connecting === "google:identity"
            ? t("googleWaitingForApproval")
            : t("googleScopeNote")}
        </small>
        <div className="google-setup-guide">
          <p>{t("googleTestingHint")}</p>
          <button
            type="button"
            onClick={() =>
              void window.studio
                .openGoogleOAuthHelp()
                .catch((error) => onError(String(error)))
            }
          >
            <Globe2 size={16} /> {t("openGoogleCloudAudience")}
          </button>
        </div>
        <div className="account-provider-divider">
          <span>{t("or")}</span>
        </div>
        <h2>{t("continueWithGithubTitle")}</h2>
        {!github?.enabled && (
          <div className="github-setup-guide">
            <h3>{t("githubSetupTitle")}</h3>
            <ol>
              <li>{t("githubSetupStepOne")}</li>
              <li>{t("githubSetupStepTwo")}</li>
              <li>{t("githubSetupStepThree")}</li>
              <li>{t("githubSetupStepFour")}</li>
            </ol>
            <button
              type="button"
              onClick={() =>
                void window.studio
                  .openGithubOAuthHelp()
                  .catch((error) => onError(String(error)))
              }
            >
              <Github size={16} /> {t("openGithubDeveloperSettings")}
            </button>
            <label>
              {t("githubClientIdLabel")}
              <input
                aria-label="GitHub OAuth client ID"
                autoCapitalize="off"
                autoComplete="off"
                placeholder={t("githubClientIdPlaceholder")}
                value={githubClientId}
                onChange={(event) => setGithubClientId(event.target.value)}
              />
              <small>{t("githubOauthHint")}</small>
            </label>
          </div>
        )}
        {connecting === "github:account" && github?.user_code && (
          <p className="account-device-code" role="status">
            {t("deviceCodePrefix")} <strong>{github.user_code}</strong>
          </p>
        )}
        <button
          disabled={
            Boolean(connecting) || (!github?.enabled && !githubClientId.trim())
          }
          onClick={() => continueWithProvider("github:account")}
        >
          {connecting === "github:account" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Github size={16} />
          )}
          {connecting === "github:account"
            ? t("githubConnecting")
            : t("continueWithGithubTitle")}
        </button>
        <small>
          {connecting === "github:account"
            ? t("githubWaitingForApproval")
            : t("githubAccountNote")}
        </small>
      </section>
    </div>
  );
}

export function AccountUnlock({
  state,
  locale,
  onState,
  onError,
}: {
  state: State;
  locale: Locale;
  onState: (state: State) => void;
  onError: (message: string) => void;
}) {
  const t = translate(locale);
  const [password, setPassword] = useState("");
  const unlock = () =>
    window.studio
      .accountUnlock(password)
      .then(onState)
      .catch((error) => onError(String(error)));
  return (
    <main className="account-lock">
      <div className="brand-symbol">Y</div>
      <h1>{t("studioLockedTitle")}</h1>
      <p>
        {state.account.displayName} · {state.account.email}
      </p>
      <label>
        {t("passwordFieldLabel")}
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void unlock();
          }}
        />
      </label>
      <button disabled={!password} onClick={() => void unlock()}>
        {t("unlockButton")}
      </button>
    </main>
  );
}
