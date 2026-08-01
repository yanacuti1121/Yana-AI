// Yana — Analytics page: token usage, request counts, provider breakdown

const { useState, useEffect } = React;

const PROVIDER_COLORS = {
  anthropic: "#2f7e6e", openai: "#19c37d", gemini: "#4285F4",
  groq: "#f55036", openrouter: "#6366f1", "9router": "#14b8a6",
  xai: "#555", novita: "#7c3aed", nvidia: "#76b900", kimi: "#0050ff",
  minimax: "#ff6b35", glm: "#1e3799", huggingface: "#ff9d00", claude: "#2f7e6e",
};
function pColor(p) { return PROVIDER_COLORS[p] || "var(--primary)"; }

function StatTileA({ label, value, sub }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

function BarChart({ daily, providers }) {
  const maxTokens = Math.max(1, ...daily.map(d => d.total_tokens));
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--ink)" }}>
        {L("Daily Token Usage", "Sử dụng token theo ngày", "일별 토큰 사용량", "每日 Token 使用量")}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, overflowX: "auto" }}>
        {daily.map(d => {
          const pct = d.total_tokens / maxTokens;
          return (
            <div key={d.date} style={{ flex: "1 0 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
                title={d.date + "\n" + d.total_tokens.toLocaleString() + " tokens\n" + d.total_requests + " requests"}>
                {/* Stacked by provider */}
                {providers.map(p => {
                  const s = d.by_provider[p];
                  if (!s || !s.tokens) return null;
                  const h = Math.round((s.tokens / maxTokens) * 100);
                  return (
                    <div key={p} title={p + ": " + s.tokens.toLocaleString()}
                      style={{ width: "100%", height: h, background: pColor(p), minHeight: h > 0 ? 2 : 0, borderRadius: 2 }} />
                  );
                })}
                {d.total_tokens === 0 && (
                  <div style={{ width: "100%", height: 2, background: "rgba(var(--shadow-rgb),.1)", borderRadius: 2 }} />
                )}
              </div>
              <div style={{ fontSize: 9, color: "var(--ink-3)", writingMode: "vertical-lr", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>
                {d.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      {providers.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          {providers.map(p => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: pColor(p), flex: "none" }} />
              <span style={{ color: "var(--ink-2)" }}>{p}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderTable({ daily, providers }) {
  const totals = {};
  for (const p of providers) totals[p] = { tokens: 0, requests: 0 };
  for (const d of daily) {
    for (const [p, s] of Object.entries(d.by_provider || {})) {
      if (!totals[p]) totals[p] = { tokens: 0, requests: 0 };
      totals[p].tokens   += s.tokens;
      totals[p].requests += s.requests;
    }
  }
  const rows = providers.map(p => ({ provider: p, ...totals[p] }))
    .filter(r => r.tokens > 0 || r.requests > 0)
    .sort((a, b) => b.tokens - a.tokens);
  if (!rows.length) return null;
  const maxT = rows[0].tokens;

  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--ink)" }}>
        {L("Provider Breakdown", "Chi tiết nhà cung cấp", "프로바이더별 상세", "提供商明细")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(r => (
          <div key={r.provider}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 500, color: pColor(r.provider) }}>{r.provider}</span>
              <span style={{ color: "var(--ink-3)" }}>{r.tokens.toLocaleString()} tokens · {r.requests} req</span>
            </div>
            <div className="bar" style={{ height: 5 }}>
              <i style={{ width: Math.round(r.tokens / maxT * 100) + "%", background: pColor(r.provider) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Analytics() {
  const [days, setDays]   = useState(7);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  function load(d) {
    setLoading(true);
    fetch("/api/analytics?days=" + d)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(days); }, [days]);

  const avgPerDay = data ? Math.round(data.total_tokens / data.days) : 0;

  return (
    <div data-screen-label="Analytics">
      <PageHeader
        title={L("Analytics", "Thống kê", "분석", "分析")}
        sub={L("Token usage and provider activity", "Sử dụng token và hoạt động theo nhà cung cấp", "토큰 사용량 및 프로바이더 활동", "Token 使用情况与提供商活动")}>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5,
              fontWeight: days === d ? 500 : 400,
              background: days === d ? "var(--primary)" : "rgba(var(--shadow-rgb),.08)",
              color: days === d ? "white" : "var(--ink-2)",
              transition: "background .15s",
            }}>{d}d</button>
          ))}
        </div>
      </PageHeader>

      {loading && !data && (
        <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}</div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "var(--gap)" }}>
            <StatTileA
              label={L("Total tokens", "Tổng token", "총 토큰", "总 Token 数")}
              value={data.total_tokens > 999 ? (data.total_tokens / 1000).toFixed(1) + "K" : data.total_tokens}
              sub={L("estimated (chars ÷ 4)", "ước tính (ký tự ÷ 4)", "추정치 (문자 ÷ 4)", "估算值（字符 ÷ 4）")} />
            <StatTileA
              label={L("Requests", "Yêu cầu", "요청", "请求")}
              value={data.total_requests.toLocaleString()}
              sub={days + L("-day window", " ngày qua", "일 기간", " 天窗口期")} />
            <StatTileA
              label={L("Avg / day", "Trung bình / ngày", "일 평균", "日均")}
              value={avgPerDay > 999 ? (avgPerDay / 1000).toFixed(1) + "K" : avgPerDay}
              sub={L("tokens per day", "token mỗi ngày", "일일 토큰", "每日 Token 数")} />
            <StatTileA
              label={L("Providers", "Nhà cung cấp", "프로바이더", "提供商")}
              value={data.providers.length}
              sub={data.providers.slice(0, 3).join(", ") || "—"} />
          </div>

          {/* Bar chart */}
          {data.daily.length > 0 && (
            <BarChart daily={data.daily} providers={data.providers} />
          )}

          {/* Provider table */}
          {data.providers.length > 0 && (
            <ProviderTable daily={data.daily} providers={data.providers} />
          )}

          {data.total_tokens === 0 && (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {L("No usage data yet. Data is recorded automatically when you use Chat.", "Chưa có dữ liệu. Dữ liệu được ghi tự động khi bạn dùng Chat.", "아직 사용 데이터가 없습니다. Chat을 사용하면 자동으로 기록됩니다.", "暂无使用数据。使用聊天功能时会自动记录数据。")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Analytics });
