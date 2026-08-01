// Yana AI — Settings: Model Hyperparameters + Advanced/Developer cards
import React from 'react';
import { L, Card } from '../../../components.jsx';
import { ToggleRow, YSeg } from './atoms.jsx';

export function ModelParamsCard({ lang }) {
  const [temp, setTemp] = React.useState(() => {
    const s = localStorage.getItem("yana.model.temperature");
    return s !== null ? parseFloat(s) : 0.7;
  });
  const [maxTok, setMaxTok] = React.useState(
    () => localStorage.getItem("yana.model.max-tokens") || "4K"
  );

  function onTempChange(e) {
    const v = parseFloat(e.target.value);
    setTemp(v);
    localStorage.setItem("yana.model.temperature", v);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: "yana.model.temperature", value: v } }));
  }

  function onMaxTokChange(v) {
    setMaxTok(v);
    localStorage.setItem("yana.model.max-tokens", v);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: "yana.model.max-tokens", value: v } }));
  }

  // Temperature zone label
  const TEMP_ZONE_MAP = {
    "Tiếng Việt": { precise: ["Chính xác", "Code, phân tích, sửa lỗi"], balanced: ["Cân bằng", "Giải thích, tóm tắt, Q&A"], creative: ["Sáng tạo", "Viết lách, brainstorm, ý tưởng"], veryCreative: ["Rất sáng tạo", "Thơ, kịch bản, thử nghiệm"] },
    "한국어": { precise: ["정밀", "코드, 분석, 버그 수정"], balanced: ["균형", "설명, 요약, Q&A"], creative: ["창의적", "글쓰기, 브레인스토밍, 아이디어"], veryCreative: ["매우 창의적", "시, 대본, 실험"] },
    "中文": { precise: ["精确", "代码、分析、修复错误"], balanced: ["均衡", "解释、总结、问答"], creative: ["有创意", "写作、头脑风暴、创意"], veryCreative: ["非常有创意", "诗歌、剧本、实验"] },
  };
  const tempZoneDict = TEMP_ZONE_MAP[lang] || { precise: ["Precise", "Code, analysis, bug fixes"], balanced: ["Balanced", "Explanations, summaries, Q&A"], creative: ["Creative", "Writing, brainstorm, ideas"], veryCreative: ["Very creative", "Poetry, scripts, experiments"] };
  function tempZone(t) {
    if (t <= 0.2) return tempZoneDict.precise;
    if (t <= 0.5) return tempZoneDict.balanced;
    if (t <= 0.79) return tempZoneDict.creative;
    return tempZoneDict.veryCreative;
  }

  function tempColor(t) {
    if (t <= 0.2) return "#3a7ca5";
    if (t <= 0.5) return "#2f7e6e";
    if (t <= 0.79) return "#b07a4f";
    return "#b96b80";
  }

  const [zoneName, zoneDesc] = tempZone(temp);
  const color = tempColor(temp);

  const TOKEN_OPTS = ["1K", "2K", "4K", "8K", "16K", "32K"];
  const TOKEN_MAP = { "1K": 1024, "2K": 2048, "4K": 4096, "8K": 8192, "16K": 16384, "32K": 32768 };

  return (
    <Card title={L("Model Parameters", "Tham số mô hình", "모델 파라미터", "模型参数")}>

      {/* Temperature */}
      <div style={{ paddingBottom: "calc(14px * var(--sp))", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Temperature", "Nhiệt độ", "온도", "温度")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Controls creativity vs precision", "Điều chỉnh sáng tạo so với chính xác", "창의성과 정확성의 균형 조절", "调节创意与精确度")}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color }}>{temp.toFixed(2)}</span>
            <div style={{ fontSize: 11, color, fontWeight: 500 }}>{zoneName}</div>
          </div>
        </div>

        <input type="range" min="0" max="1" step="0.01" value={temp} onChange={onTempChange}
          style={{ width: "100%", accentColor: color, height: 4, marginBottom: 6 }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)" }}>
          <span>0.0 — {tempZoneDict.precise[0]}</span>
          <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "center" }}>{zoneDesc}</span>
          <span>1.0 — {tempZoneDict.creative[0]}</span>
        </div>
      </div>

      {/* Max tokens */}
      <div style={{ paddingTop: "calc(12px * var(--sp))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Max response tokens", "Giới hạn token phản hồi", "최대 응답 토큰", "最大回复 token 数")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {"≈ " + Math.round(TOKEN_MAP[maxTok] * 0.75).toLocaleString() + L(" words", " từ", "단어", " 词")}
            </div>
          </div>
          <YSeg options={TOKEN_OPTS} value={maxTok} onChange={onMaxTokChange} />
        </div>
      </div>
    </Card>
  );
}

const ADVANCED_CARD_STR = {
  "Tiếng Việt": { title: "Nâng cao / Nhà phát triển", devMode: "Chế độ nhà phát triển", devModeDesc: "Hiển thị thời gian phản hồi và ước lượng token dưới mỗi câu trả lời", expandThink: "Luôn mở rộng suy nghĩ", expandThinkDesc: "Tự động mở khối <think> thay vì thu gọn" },
  "한국어": { title: "고급 / 개발자", devMode: "개발자 모드", devModeDesc: "각 답변 아래에 응답 시간과 예상 토큰 수를 표시", expandThink: "항상 생각 과정 펼치기", expandThinkDesc: "<think> 블록을 접지 않고 자동으로 펼침" },
  "中文": { title: "高级 / 开发者", devMode: "开发者模式", devModeDesc: "在每条回复下方显示响应时间和预估 token 数", expandThink: "始终展开思考过程", expandThinkDesc: "自动展开 <think> 块，而不是折叠" },
};

export function AdvancedCard({ lang }) {
  const S = ADVANCED_CARD_STR[lang] || { title: "Advanced / Developer", devMode: "Developer mode", devModeDesc: "Show response time and estimated token count under each reply", expandThink: "Always expand thinking", expandThinkDesc: "Auto-open <think> blocks instead of collapsing them" };
  return (
    <Card title={S.title}>
      <ToggleRow
        label={S.devMode}
        desc={S.devModeDesc}
        storeKey="yana.dev.mode"
        defaultVal={false} />
      <ToggleRow
        label={S.expandThink}
        desc={S.expandThinkDesc}
        storeKey="yana.dev.expand-thinking"
        defaultVal={false} />
    </Card>
  );
}
