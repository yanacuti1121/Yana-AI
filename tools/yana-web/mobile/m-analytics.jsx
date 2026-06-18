// Yana Mobile — Analytics: token usage, request counts, provider breakdown
const { useState: useStateMA, useEffect: useEffectMA } = React;

const MA_PROVIDER_COLORS = {
  anthropic: "#2f7e6e", openai: "#19c37d", gemini: "#4285F4",
  groq: "#f55036", openrouter: "#6366f1", "9router": "#14b8a6",
  xai: "#555", novita: "#7c3aed", nvidia: "#76b900", kimi: "#0050ff",
  minimax: "#ff6b35", glm: "#1e3799", huggingface: "#ff9d00", claude: "#2f7e6e",
};
function maColor(p) { return MA_PROVIDER_COLORS[p] || "var(--primary)"; }

function MAStatTile({ label, value, sub }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

function MABarChart({ daily, providers }) {
  const maxTokens = Math.max(1, ...daily.map(d => d.total_tokens));
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--ink)" }}>
        {L("Daily Token Usage", "Sử dụng token theo ngày")}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110, overflowX: "auto" }}>
        {daily.map(d => {
          return (
            <div key={d.date} style={{ flex: "1 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: 90, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
                title={d.date + "\n" + d.total_tokens.toLocaleString() + " tokens\n" + d.total_requests + " requests"}>
                {providers.map(p => {
                  const s = d.by_provider[p];
                  if (!s || !s.tokens) return null;
                  const h = Math.round((s.tokens / maxTokens) * 90);
                  return (
                    <div key={p} title={p + ": " + s.tokens.toLocaleString()}
                      style={{ width: "100%", height: h, background: maColor(p), minHeight: h > 0 ? 2 : 0, borderRadius: 2 }} />
                  );
                })}
                {d.total_tokens === 0 && (
                  <div style={{ width: "100%", height: 2, background: "rgba(var(--shadow-rgb),.1)", borderRadius: 2 }} />
                )}
              </div>
              <div style={{ fontSize: 8.5, color: "var(--ink-3)", writingMode: "vertical-lr", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>
                {d.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
      {providers.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {providers.map(p => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: maColor(p), flex: "none" }} />
              <span style={{ color: "var(--ink-2)" }}>{p}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MAProviderTable({ daily, providers }) {
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
        {L("Provider Breakdown", "Chi tiết nhà cung cấp")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(r => (
          <div key={r.provider}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12.5 }}>
              <span style={{ fontWeight: 500, color: maColor(r.provider) }}>{r.provider}</span>
              <span style={{ color: "var(--ink-3)" }}>{r.tokens.toLocaleString()} tok · {r.requests} req</span>
            </div>
            <div className="bar" style={{ height: 5 }}>
              <i style={{ width: Math.round(r.tokens / maxT * 100) + "%", background: maColor(r.provider) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MAnalytics() {
  const [days, setDays] = useStateMA(7);
  const [data, setData] = useStateMA(null);
  const [loading, setLoading] = useStateMA(false);

  function load(d) {
    setLoading(true);
    fetch("/api/analytics?days=" + d)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffectMA(() => { load(days); }, [days]);

  const avgPerDay = data ? Math.round(data.total_tokens / data.days) : 0;

  return (
    <div data-screen-label="Analytics" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MHead title={L("Analytics", "Thống kê")} sub={L("Token usage and provider activity", "Sử dụng token và hoạt động theo nhà cung cấp")}>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12,
              fontWeight: days === d ? 500 : 400,
              background: days === d ? "var(--primary)" : "rgba(var(--shadow-rgb),.08)",
              color: days === d ? "white" : "var(--ink-2)",
            }}>{d}d</button>
          ))}
        </div>
      </MHead>

      {loading && !data && (
        <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("Loading…", "Đang tải…")}</div>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--gap)" }}>
            <MAStatTile
              label={L("Total tokens", "Tổng token")}
              value={data.total_tokens > 999 ? (data.total_tokens / 1000).toFixed(1) + "K" : data.total_tokens}
              sub={L("est. (chars ÷ 4)", "ước tính (ký tự ÷ 4)")} />
            <MAStatTile
              label={L("Requests", "Yêu cầu")}
              value={data.total_requests.toLocaleString()}
              sub={days + L("-day window", " ngày qua")} />
            <MAStatTile
              label={L("Avg / day", "Trung bình / ngày")}
              value={avgPerDay > 999 ? (avgPerDay / 1000).toFixed(1) + "K" : avgPerDay}
              sub={L("tokens per day", "token mỗi ngày")} />
            <MAStatTile
              label={L("Providers", "Nhà cung cấp")}
              value={data.providers.length}
              sub={data.providers.slice(0, 2).join(", ") || "—"} />
          </div>

          {data.daily.length > 0 && (
            <MABarChart daily={data.daily} providers={data.providers} />
          )}

          {data.providers.length > 0 && (
            <MAProviderTable daily={data.daily} providers={data.providers} />
          )}

          {data.total_tokens === 0 && (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {L("No usage data yet. Data is recorded automatically when you use Chat.", "Chưa có dữ liệu. Dữ liệu được ghi tự động khi bạn dùng Chat.")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

Object.assign(window, { MAnalytics });
