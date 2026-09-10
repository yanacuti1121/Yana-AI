import { useEffect, useState } from "react";
import { Lock, LogOut, UserRound } from "lucide-react";
import type { IntegrationConnection, State } from "./types";
import { translate, type Locale } from "./i18n";

export function AccountSettings({
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
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  useEffect(() => {
    void window.studio
      .integrationList()
      .then(setConnections)
      .catch(() => {});
  }, []);
  const google = connections.find((item) => item.key === "google:identity");
  if (state.account.configured)
    return (
      <section className="card settings-card account-current">
        <UserRound size={28} />
        <div>
          <h2>{state.account.displayName}</h2>
          <p>{state.account.email || "Local Google identity"}</p>
          <small>
            {state.account.mode === "local"
              ? "Local password profile"
              : "Google identity profile"}{" "}
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
    <div className="account-settings">
      <h2>{t("localFirstAccountTitle")}</h2>
      <p className="muted">{t("localFirstAccountNote")}</p>
      <div className="settings-grid">
        <section className="card settings-card">
          <h3>{t("emailPasswordTitle")}</h3>
          <p>{t("emailPasswordNote")}</p>
          <label>
            {t("displayNameLabel")}
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            {t("emailFieldLabel")}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            {t("passwordFieldLabel")}
            <input
              type="password"
              value={password}
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            disabled={
              !displayName.trim() || !email.trim() || password.length < 10
            }
            onClick={() =>
              void window.studio
                .accountCreateLocal({ email, displayName, password })
                .then((next) => {
                  setPassword("");
                  onState(next);
                })
                .catch((error) => onError(String(error)))
            }
          >
            {t("createLocalProfile")}
          </button>
        </section>
        <section className="card settings-card">
          <h3>{t("continueWithGoogleTitle")}</h3>
          <p>{t("googleScopeNote")}</p>
          {google?.account_id ? (
            <>
              <p>
                <strong>{google.display_name}</strong>
              </p>
              <button
                onClick={() =>
                  void window.studio
                    .accountUseGoogle()
                    .then(onState)
                    .catch((error) => onError(String(error)))
                }
              >
                {t("useGoogleAsProfile")}
              </button>
            </>
          ) : (
            <>
              <p className="muted">{t("connectGoogleFirst")}</p>
              <button disabled>{t("googleNotConnected")}</button>
            </>
          )}
        </section>
      </div>
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
