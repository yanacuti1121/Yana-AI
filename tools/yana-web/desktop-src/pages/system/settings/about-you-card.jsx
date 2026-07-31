// Yana AI — Settings: "About you" card (personal context for Yana)
import React from 'react';
import { L, Card, Icons } from '../../../components.jsx';

function AboutField({ id, label, hint, placeholder, rows }) {
  const key = "yana.about." + id;
  const [v, setV] = React.useState(() => localStorage.getItem(key) || "");
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef(null);

  function onChange(e) {
    const val = e.target.value;
    setV(val);
    localStorage.setItem(key, val);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(true), 800);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <label htmlFor={"about-" + id} style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
        <span style={{ fontSize: 11, color: "var(--good)", opacity: saved ? 1 : 0, transition: "opacity .3s", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {Icons.check(11)} {L("Planted in Memory Garden", "Đã lưu vào Vườn ký ức", "메모리 가든에 저장됨", "已存入记忆花园")}
        </span>
      </div>
      {hint && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: -3 }}>{hint}</div>}
      <textarea id={"about-" + id} value={v} onChange={onChange} rows={rows || 3}
        placeholder={placeholder}
        style={{
          width: "100%", resize: "vertical", padding: "10px 13px",
          borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
          background: "rgba(var(--surface-rgb), .6)", color: "var(--ink)",
          fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, outline: "none",
        }}
        onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
        onBlur={(e) => e.target.style.borderColor = "var(--border)"}
      ></textarea>
    </div>
  );
}

export function AboutYouCard() {
  return (
    <Card title={L("About you", "Về bạn", "당신에 대하여", "关于你")} style={{ gridColumn: "1 / -1" }}
      aside={<span className="chip pink" style={{ fontSize: 11 }}>{Icons.memory(12)} {L("Pinned · never pruned", "Đã ghim · không bao giờ xóa", "고정됨 · 삭제되지 않음", "已固定 · 永不清除")}</span>}>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {L(
          "Yana reads this before every mission. The more honestly you describe yourself, the better she routes, plans, and phrases things for you.",
          "Yana đọc phần này trước mỗi nhiệm vụ. Bạn mô tả bản thân càng thực tế, cô ấy càng định tuyến, lên kế hoạch và diễn đạt tốt hơn cho bạn.",
          "Yana는 모든 미션 전에 이 내용을 읽습니다. 자신을 솔직하게 설명할수록 라우팅, 계획, 표현이 더 잘 맞춰집니다.",
          "Yana 会在每次任务前阅读这些内容。你对自己的描述越真实，她的路由、规划和表达就越贴合你。"
        )}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <AboutField id="who" label={L("Who you are", "Bạn là ai", "당신은 누구인가요", "你是谁")}
          hint={L("Role, what you're building, how you work", "Vai trò, bạn đang xây dựng gì, cách bạn làm việc", "역할, 만들고 있는 것, 일하는 방식", "角色、你在构建什么、你的工作方式")}
          placeholder={L("e.g. I'm a system builder. I think in workflows, not code.", "e.g. Tôi xây hệ thống. Tôi nghĩ theo luồng công việc, không phải code.", "예: 저는 시스템을 만듭니다. 코드보다 워크플로우로 생각해요.", "例：我是系统构建者，习惯以工作流而非代码来思考。")} rows={4} />
        <AboutField id="strengths" label={L("Strengths", "Điểm mạnh", "강점", "优势")}
          hint={L("What Yana should lean on", "Điều Yana nên dựa vào", "Yana가 의지해야 할 부분", "Yana 应该依靠的方面")}
          placeholder={L("e.g. Big-picture architecture, fast decisions.", "e.g. Kiến trúc tổng thể, ra quyết định nhanh.", "예: 큰 그림의 아키텍처, 빠른 의사결정.", "例：把握整体架构，决策迅速。")} rows={4} />
        <AboutField id="weaknesses" label={L("Weak spots", "Điểm yếu", "약점", "弱项")}
          hint={L("Where Yana should quietly cover for you", "Nơi Yana nên lặng lẽ hỗ trợ bạn", "Yana가 조용히 보완해줘야 할 부분", "Yana 应默默为你弥补的地方")}
          placeholder={L("e.g. I lose patience with long documents.", "e.g. Tôi mất kiên nhẫn với tài liệu dài.", "예: 긴 문서를 보면 인내심을 잃어요.", "例：面对长文档容易失去耐心。")} rows={4} />
        <AboutField id="style" label={L("How Yana should respond", "Yana nên trả lời thế nào", "Yana가 응답하는 방식", "Yana 应如何回应")}
          hint={L("Tone, length, language", "Giọng điệu, độ dài, ngôn ngữ", "어조, 길이, 언어", "语气、长度、语言")}
          placeholder={L("e.g. Calm and brief. Vietnamese is fine for casual notes.", "e.g. Bình tĩnh và ngắn gọn. Tiếng Việt được cho ghi chú thường ngày.", "예: 차분하고 간결하게. 편한 메모는 한국어도 괜찮아요.", "例：冷静简短。日常笔记用中文也可以。")} rows={4} />
      </div>
    </Card>
  );
}
