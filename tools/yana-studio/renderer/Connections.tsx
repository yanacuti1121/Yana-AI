import { useEffect, useState } from "react";
import type { IntegrationConnection } from "./types";

export function Connections() {
  const [items, setItems] = useState<IntegrationConnection[]>([]);
  const [error, setError] = useState("");
  const [githubClientId, setGithubClientId] = useState("");
  useEffect(() => {
    const unsubscribe = window.studio.on("integrations:update", setItems);
    window.studio
      .integrationList()
      .then(setItems)
      .catch(() => setError("Không đọc được trạng thái kết nối."));
    return unsubscribe;
  }, []);
  const connect = async (key: string) => {
    setError("");
    try {
      setItems(await window.studio.integrationConnect(key));
    } catch {
      setError(
        "Không bắt đầu được OAuth. Kiểm tra cấu hình và secure storage.",
      );
    }
  };
  return (
    <div>
      <h2>Accounts & Connections</h2>
      <p className="muted">
        Đăng nhập Google không cấp quyền Gmail. Mỗi kết nối có quyền và
        credential riêng, do Electron main quản lý.
      </p>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <section className="card settings-card" key={item.key}>
          <h3>
            {item.name} <small>· {item.status.replaceAll("_", " ")}</small>
          </h3>
          <p>
            {item.purpose === "authentication"
              ? "Tài khoản cá nhân trong app này — không tạo session server Yana."
              : "Cấp quyền dịch vụ riêng biệt."}
          </p>
          {item.display_name && <p>{item.display_name}</p>}
          {item.setup && <p className="muted">{item.setup}</p>}
          {item.provider === "github" && (
            <details>
              <summary>Cấu hình GitHub OAuth app</summary>
              <label>
                Client ID công khai
                <input
                  aria-label="GitHub OAuth client ID"
                  value={githubClientId}
                  onChange={(event) => setGithubClientId(event.target.value)}
                />
              </label>
              <p>
                Trong GitHub Developer Settings, tạo OAuth app và bật Device
                flow. Không nhập token hoặc client secret vào đây.
              </p>
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
                    setError(
                      "Chưa lưu được GitHub client ID. Kiểm tra ID và secure storage.",
                    );
                  }
                }}
              >
                Lưu client ID
              </button>
              {item.account_id && (
                <p>Disconnect trước khi đổi OAuth client ID.</p>
              )}
            </details>
          )}
          {item.user_code && (
            <p role="status">
              Nhập mã <strong>{item.user_code}</strong> tại
              github.com/login/device vừa mở. Chỉ xác nhận mã do chính anh vừa
              yêu cầu trong app này.
            </p>
          )}
          {!item.secure_storage && (
            <p role="alert">
              OS secure storage chưa sẵn sàng. Không lưu token bằng plaintext.
            </p>
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
            <p>
              Quyền thật do nhà cung cấp cấp. Reconnect mở lại màn hình consent;
              không có checkbox tự cấp quyền.
            </p>
          </details>
          <div className="button-row">
            {item.account_id && item.provider === "google" && (
              <button
                onClick={async () => {
                  try {
                    setItems(await window.studio.integrationRevoke(item.key));
                  } catch {
                    setError(
                      "Thu hồi chưa thành công. Credential chưa được đánh dấu đã thu hồi.",
                    );
                  }
                }}
              >
                Thu hồi tại Google
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
                Hủy
              </button>
            )}
            {item.account_id && (
              <button
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Xóa credential kết nối này khỏi Yana Studio? Quyền tại nhà cung cấp vẫn còn; có thể thu hồi trong trang quản lý tài khoản của họ.",
                    )
                  )
                    return;
                  try {
                    setItems(
                      await window.studio.integrationDisconnect(item.key),
                    );
                  } catch {
                    setError(
                      "Chưa xóa được credential. Không coi là đã ngắt kết nối.",
                    );
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
