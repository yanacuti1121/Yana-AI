import { useEffect, useState } from "react";
import { Lock, LogOut, UserRound } from "lucide-react";
import type { IntegrationConnection, State } from "./types";

export function AccountSettings({
  state,
  onState,
  onError,
}: {
  state: State;
  onState: (state: State) => void;
  onError: (message: string) => void;
}) {
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
            · dữ liệu vẫn chỉ nằm trên máy này
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
              <Lock size={15} /> Khóa Studio
            </button>
          )}
          <button
            className="danger-button"
            onClick={() => {
              if (
                !window.confirm(
                  "Đăng xuất khỏi hồ sơ này? Project, chat và credential provider vẫn giữ nguyên trên máy — chỉ hồ sơ tài khoản bị xóa, anh có thể tạo hồ sơ khác hoặc đăng nhập lại.",
                )
              )
                return;
              void window.studio
                .accountLogout()
                .then(onState)
                .catch((error) => onError(String(error)));
            }}
          >
            <LogOut size={15} /> Đăng xuất
          </button>
        </div>
      </section>
    );
  return (
    <div className="account-settings">
      <h2>Tài khoản local-first</h2>
      <p className="muted">
        Không có Yana cloud server. Tài khoản chỉ nhận diện người dùng trên
        thiết bị này; project, chat và backup không tự tải lên mạng.
      </p>
      <div className="settings-grid">
        <section className="card settings-card">
          <h3>Email + mật khẩu</h3>
          <p>
            Mật khẩu khóa Studio trên máy. Chỉ lưu salt và scrypt verifier,
            không lưu mật khẩu.
          </p>
          <label>
            Tên hiển thị
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Mật khẩu
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
            Tạo hồ sơ local
          </button>
        </section>
        <section className="card settings-card">
          <h3>Tiếp tục với Google</h3>
          <p>
            Chỉ dùng scope identity. Không tự cấp Gmail, Drive hoặc Calendar.
          </p>
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
                Dùng Google làm hồ sơ Studio
              </button>
            </>
          ) : (
            <>
              <p className="muted">
                Kết nối Google Account trong mục Tài khoản & Kết nối trước.
              </p>
              <button disabled>Google chưa kết nối</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function AccountUnlock({
  state,
  onState,
  onError,
}: {
  state: State;
  onState: (state: State) => void;
  onError: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const unlock = () =>
    window.studio
      .accountUnlock(password)
      .then(onState)
      .catch((error) => onError(String(error)));
  return (
    <main className="account-lock">
      <div className="brand-symbol">Y</div>
      <h1>Yana Studio đã khóa</h1>
      <p>
        {state.account.displayName} · {state.account.email}
      </p>
      <label>
        Mật khẩu
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
        Mở khóa
      </button>
    </main>
  );
}
