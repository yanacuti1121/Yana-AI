import { useEffect, useState } from "react";
import {
  Database,
  Download,
  FileUp,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { DataOverview, State } from "./types";
import { translate, type Locale } from "./i18n";

const size = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function PrivacyData({
  locale,
  onState,
  onError,
}: {
  locale: Locale;
  onState: (state: State) => void;
  onError: (value: string) => void;
}) {
  const t = translate(locale);
  const [overview, setOverview] = useState<DataOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    setBusy(true);
    try {
      setOverview(await window.studio.dataOverview());
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const restore = async (file?: File) => {
    setBusy(true);
    setMessage("");
    try {
      const next = file
        ? await window.studio.importPortableData(file)
        : await window.studio.choosePortableData();
      onState(next);
      setMessage(t("restoredNotice"));
      await refresh();
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="privacy-data">
      <h2>Privacy & Data</h2>
      <p className="muted">{t("privacyDataNote")}</p>
      <section className="card settings-card data-summary">
        <header>
          <div>
            <h3>Local data overview</h3>
            <p className="muted">{t("localDataOnLocalMachine")}</p>
          </div>
          <button disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={15} /> {busy ? t("readingLabel") : t("refreshLabel")}
          </button>
        </header>
        <div className="data-total">
          <Database size={18} />
          <strong>{overview ? size(overview.total_bytes) : "—"}</strong>
        </div>
        <dl className="data-rows">
          <div>
            <dt>Workspace & conversations</dt>
            <dd>
              {overview
                ? t("filesCountBytes")
                    .replace("{files}", String(overview.workspace.files))
                    .replace("{size}", size(overview.workspace.bytes))
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("credentialsSessionsLabel")}</dt>
            <dd>
              {overview
                ? t("filesCountBytes")
                    .replace("{files}", String(overview.credentials.files))
                    .replace("{size}", size(overview.credentials.bytes))
                : "—"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="card settings-card portable-backup">
        <div>
          <h3>{t("backupToDiskTitle")}</h3>
          <p>{t("backupToDiskNote")}</p>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    const file = await window.studio.exportPortableData();
                    if (file) setMessage(t("backupSavedNotice"));
                  } catch (error) {
                    onError(String(error));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              <Download size={15} /> {t("exportBackup")}
            </button>
            <button disabled={busy} onClick={() => void restore()}>
              <FileUp size={15} /> {t("chooseRestoreFile")}
            </button>
          </div>
        </div>
      </section>
      <label
        className="backup-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void restore(file);
        }}
      >
        <FileUp size={24} />
        <strong>{t("dropBackupHere")}</strong>
        <span>{t("orClickToChoose")}</span>
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
            event.target.value = "";
          }}
        />
      </label>
      {message && <p className="backup-message">{message}</p>}
      <section className="card settings-card data-boundary uninstall-warning">
        <TriangleAlert size={20} />
        <div>
          <h3>{t("beforeUninstallTitle")}</h3>
          <p>{t("beforeUninstallNote")}</p>
        </div>
      </section>
      <section className="card settings-card data-boundary">
        <ShieldCheck size={20} />
        <div>
          <h3>{t("dataBoundaryTitle")}</h3>
          <p>
            {t("dataBoundaryNotePrefix")} <code>yana-rt</code>
            {t("dataBoundaryNoteSuffix")}
          </p>
        </div>
      </section>
    </div>
  );
}
