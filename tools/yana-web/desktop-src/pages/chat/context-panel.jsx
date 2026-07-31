// Yana AI — Chat: right-hand Routing/Context/Safety panel
import React from 'react';
import { L, Card, Icons } from '../../components.jsx';
import { loadModelChoices, CHAT_MODELS } from './model-select.js';

export function ContextPanel() {
  const D = window.YANA;
  const [facts, setFacts] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFacts(d.memories.recent); })
      .catch(() => {});
  }, []);

  // Real routing: providers that actually have a key, in send order
  const keyed = D.providers.filter((p) => YanaVault.hasKey(p.id));
  const primary  = keyed[0];
  const fallback = keyed[1];

  // display/flex-direction/gap/overflow live in themes.css's .yana-chat-aside
  // rule, not inline — an inline style here would beat the ≤860px media
  // query's `display: none`, since inline styles always win over external
  // stylesheet rules regardless of specificity (this was the actual bug:
  // the panel stayed visible and overlapped the chat at narrow widths).
  return (
    <aside className="yana-chat-aside">
      <Card title={L("Routing", "Định tuyến", "라우팅", "路由")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[
            [L("Provider", "Nhà cung cấp", "프로바이더", "提供商"), primary ? primary.name : L("None — add a key", "Chưa có key", "없음 — 키 추가", "无 — 请添加密钥")],
            [L("Model", "Mô hình", "모델", "模型"), primary ? (loadModelChoices()[primary.id] || CHAT_MODELS[primary.id] || "—") : "—"],
            [L("Fallback", "Dự phòng", "폴백", "回退"), fallback ? fallback.name : "—"],
            [L("Connected", "Đã kết nối", "연결됨", "已连接"), keyed.length + " / " + D.providers.length],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
              <span style={{ color: "var(--ink-3)", flex: "none" }}>{k}</span>
              <span style={{ fontWeight: 500, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Context in use", "Ngữ cảnh đang dùng", "사용 중인 컨텍스트", "正在使用的上下文")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {facts && facts.length
            ? facts.map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, display: "flex", gap: 7 }}>
                  <span style={{ color: "var(--pink)", flex: "none", marginTop: 1 }}>{Icons.memory(13)}</span>
                  {m.text}
                </div>
              ))
            : <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("No memories yet.", "Chưa có ký ức nào.", "아직 메모리가 없습니다.", "暂无记忆。")}</span>}
        </div>
      </Card>
      <Card title={L("Safety", "An toàn", "안전", "安全")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot on"></span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{L("Sentinel reviewing all actions", "Sentinel đang giám sát mọi hành động", "Sentinel이 모든 작업을 검토 중", "Sentinel 正在审查所有操作")}</span>
        </div>
      </Card>
    </aside>
  );
}
