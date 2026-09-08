import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import type { Locale, TokenUsageSummary, TokenUsageTotals } from "./types";

const copy = {
  vi: {
    title: "Sử dụng token",
    description:
      "Số token do chính provider báo về qua Yana runtime. Đây không phải hạn mức hay hóa đơn của nhà cung cấp.",
    workspace: "Workspace hiện tại",
    all: "Tất cả dự án",
    input: "Token đầu vào",
    output: "Token đầu ra",
    rounds: "vòng model đã ghi nhận",
    breakdown: "Theo provider và model",
    empty: "Chưa có dữ liệu token do runtime báo về.",
    honest:
      "Yana không tự đoán quota, phần trăm giới hạn hoặc thời gian reset. Khi provider không trả usage, lượt đó không được cộng.",
    refresh: "Làm mới",
    updated: "Cập nhật gần nhất",
  },
  ko: {
    title: "토큰 사용량",
    description:
      "Yana 런타임을 통해 공급자가 직접 보고한 토큰입니다. 공급자 한도나 청구 금액이 아닙니다.",
    workspace: "현재 워크스페이스",
    all: "모든 프로젝트",
    input: "입력 토큰",
    output: "출력 토큰",
    rounds: "기록된 모델 호출",
    breakdown: "공급자 및 모델별",
    empty: "런타임이 보고한 토큰 데이터가 아직 없습니다.",
    honest:
      "Yana는 할당량, 한도 비율 또는 초기화 시간을 추정하지 않습니다. 공급자가 usage를 반환하지 않으면 합산하지 않습니다.",
    refresh: "새로고침",
    updated: "최근 기록",
  },
  en: {
    title: "Token usage",
    description:
      "Tokens reported by providers through the Yana runtime. This is not a provider quota or billing statement.",
    workspace: "Current workspace",
    all: "All projects",
    input: "Input tokens",
    output: "Output tokens",
    rounds: "recorded model rounds",
    breakdown: "By provider and model",
    empty: "No provider-reported token data yet.",
    honest:
      "Yana does not infer quotas, limit percentages, or reset times. A round is not counted when its provider reports no usage.",
    refresh: "Refresh",
    updated: "Last recorded",
  },
} as const;

const emptySummary: TokenUsageSummary = {
  all: { input: 0, output: 0, total: 0, rounds: 0 },
  workspace: { input: 0, output: 0, total: 0, rounds: 0 },
  models: [],
  lastRecordedAt: "",
};

function share(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
}

function UsageTotal({
  label,
  value,
  roundsLabel,
}: {
  label: string;
  value: TokenUsageTotals;
  roundsLabel: string;
}) {
  return (
    <div className="usage-total">
      <span>{label}</span>
      <strong>{value.total.toLocaleString()}</strong>
      <small>
        {value.rounds.toLocaleString()} {roundsLabel}
      </small>
    </div>
  );
}

export function TokenUsage({
  locale,
  projectRoot,
  onError,
}: {
  locale: Locale;
  projectRoot: string;
  onError: (message: string) => void;
}) {
  const text = copy[locale];
  const [summary, setSummary] = useState(emptySummary);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setSummary(await window.studio.tokenUsage(projectRoot));
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  }, [onError, projectRoot]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="usage-page">
      <div className="usage-heading">
        <div>
          <div className="eyebrow">RUNTIME TELEMETRY</div>
          <h2>{text.title}</h2>
          <p className="muted">{text.description}</p>
        </div>
        <button disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={15} /> {text.refresh}
        </button>
      </div>

      <div className="usage-totals">
        <UsageTotal
          label={text.workspace}
          value={summary.workspace}
          roundsLabel={text.rounds}
        />
        <UsageTotal
          label={text.all}
          value={summary.all}
          roundsLabel={text.rounds}
        />
      </div>

      {summary.all.total ? (
        <>
          <section className="usage-section">
            <UsageBar
              label={text.input}
              value={summary.all.input}
              total={summary.all.total}
            />
            <UsageBar
              label={text.output}
              value={summary.all.output}
              total={summary.all.total}
            />
          </section>
          <section className="usage-section">
            <h3>{text.breakdown}</h3>
            <div className="usage-models">
              {summary.models.map((entry) => (
                <div
                  className="usage-model-row"
                  key={`${entry.provider}/${entry.model}`}
                >
                  <div>
                    <strong>{entry.model}</strong>
                    <small>
                      {entry.provider} · {entry.rounds.toLocaleString()}{" "}
                      {text.rounds}
                    </small>
                  </div>
                  <div className="usage-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${share(entry.total, summary.all.total)}%`,
                      }}
                    />
                  </div>
                  <b>{entry.total.toLocaleString()}</b>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="usage-empty">
          <BarChart3 size={30} />
          <p>{text.empty}</p>
        </div>
      )}

      <div className="usage-truth-note">
        <strong>{text.honest}</strong>
        {summary.lastRecordedAt && (
          <span>
            {text.updated}:{" "}
            {new Date(summary.lastRecordedAt).toLocaleString(locale)}
          </span>
        )}
      </div>
    </div>
  );
}

function UsageBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent = share(value, total);
  return (
    <div className="usage-bar-row">
      <span>{label}</span>
      <div
        className="usage-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <b>{value.toLocaleString()}</b>
      <small>{Math.round(percent)}%</small>
    </div>
  );
}
