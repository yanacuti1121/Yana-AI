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

const size = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function PrivacyData({
  onState,
  onError,
}: {
  onState: (state: State) => void;
  onError: (value: string) => void;
}) {
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
      setMessage("Dữ liệu portable đã được khôi phục.");
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
      <p className="muted">
        Chỉ thống kê số file và dung lượng. Màn hình này không đọc hoặc hiển thị
        nội dung file.
      </p>
      <section className="card settings-card data-summary">
        <header>
          <div>
            <h3>Local data overview</h3>
            <p className="muted">Dữ liệu nằm trên máy của anh.</p>
          </div>
          <button disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={15} /> {busy ? "Đang đọc…" : "Làm mới"}
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
                ? `${overview.workspace.files} file · ${size(overview.workspace.bytes)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Credentials & sessions · không export</dt>
            <dd>
              {overview
                ? `${overview.credentials.files} file · ${size(overview.credentials.bytes)}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="card settings-card portable-backup">
        <div>
          <h3>Backup Yana Studio về máy</h3>
          <p>
            Lưu project gần đây, hội thoại, model đang chọn, ngôn ngữ và bố cục
            vào một file portable. OAuth token, API key, mật khẩu, runtime path
            và tiến trình terminal luôn bị loại trừ.
          </p>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    const file = await window.studio.exportPortableData();
                    if (file) setMessage("Backup đã được lưu trên máy.");
                  } catch (error) {
                    onError(String(error));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              <Download size={15} /> Xuất backup
            </button>
            <button disabled={busy} onClick={() => void restore()}>
              <FileUp size={15} /> Chọn file khôi phục
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
        <strong>Thả file backup vào đây</strong>
        <span>Hoặc bấm để chọn file `.json` từ máy.</span>
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
          <h3>Trước khi gỡ ứng dụng</h3>
          <p>
            Hãy xuất backup trước. Hệ điều hành có thể xóa ứng dụng mà không mở
            Yana Studio, nên app không thể chặn hoặc cảnh báo trong mọi cách gỡ
            cài đặt.
          </p>
        </div>
      </section>
      <section className="card settings-card data-boundary">
        <ShieldCheck size={20} />
        <div>
          <h3>Ranh giới dữ liệu</h3>
          <p>
            Đây là backup trạng thái của Yana Studio, không phải bản sao toàn bộ
            project và không giả vờ thay thế memory engine của{" "}
            <code>yana-rt</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
