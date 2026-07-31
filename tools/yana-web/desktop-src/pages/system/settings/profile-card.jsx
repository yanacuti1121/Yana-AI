// Yana AI — Settings: Profile card (profession/role + custom instructions).
// ProfileHero (avatar/name/theme-mode strip) lives in profile-hero.jsx —
// split out purely to keep both files under this repo's 300-line limit.
import React from 'react';
import { L, Card, Icons } from '../../../components.jsx';

const ROLE_OPTIONS_EN = ["Engineering", "Software Development", "Data Science / AI", "Design", "Product Management", "Marketing", "Research", "Business", "Education", "Automation / Robotics", "Mechanical Engineering", "Other"];
const ROLE_OPTIONS_VI = ["Kỹ thuật", "Phát triển phần mềm", "Khoa học dữ liệu / AI", "Thiết kế", "Quản lý sản phẩm", "Marketing", "Nghiên cứu", "Kinh doanh", "Giáo dục", "Tự động hóa / Robotics", "Cơ khí", "Khác"];
const ROLE_OPTIONS_KO = ["엔지니어링", "소프트웨어 개발", "데이터 사이언스 / AI", "디자인", "제품 관리", "마케팅", "연구", "비즈니스", "교육", "자동화 / 로보틱스", "기계공학", "기타"];
const ROLE_OPTIONS_ZH = ["工程", "软件开发", "数据科学 / AI", "设计", "产品管理", "市场营销", "研究", "商业", "教育", "自动化 / 机器人", "机械工程", "其他"];
const ROLE_OPTIONS_MAP = { "Tiếng Việt": ROLE_OPTIONS_VI, "한국어": ROLE_OPTIONS_KO, "中文": ROLE_OPTIONS_ZH };

export function ProfileCard({ lang }) {
  const ROLE_OPTIONS = ROLE_OPTIONS_MAP[lang] || ROLE_OPTIONS_EN;
  const [role, setRole] = React.useState(() => localStorage.getItem("yana.profile.role") || "");
  const [instr, setInstr] = React.useState(() => localStorage.getItem("yana.profile.instructions") || "");
  const [savedInstr, setSavedInstr] = React.useState(false);
  const timer = React.useRef(null);

  function onRoleChange(e) {
    const v = e.target.value;
    setRole(v);
    localStorage.setItem("yana.profile.role", v);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: "yana.profile.role", value: v } }));
  }

  function onInstrChange(e) {
    const v = e.target.value;
    setInstr(v);
    localStorage.setItem("yana.profile.instructions", v);
    setSavedInstr(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSavedInstr(true), 800);
  }

  return (
    <Card title={L("Profile", "Hồ sơ cá nhân", "프로필", "个人资料")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Profession / Role", "Lĩnh vực hoạt động", "직업 / 역할", "职业 / 角色")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Shapes how Yana frames context", "Định hình cách Yana xử lý ngữ cảnh", "Yana가 맥락을 구성하는 방식에 영향", "影响 Yana 组织上下文的方式")}</div>
        </div>
        <select value={role} onChange={onRoleChange} style={{
          border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px",
          background: "transparent", color: "var(--primary)", fontSize: 12,
          fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 190,
        }}>
          <option value="">{L("— select —", "— chọn —", "— 선택 —", "— 选择 —")}</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: "calc(11px * var(--sp))" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Yana Instructions", "Chỉ thị cho Yana", "Yana 지시사항", "Yana 指令")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {L("Rules Yana follows in every conversation", "Quy tắc Yana tuân theo trong mọi cuộc trò chuyện", "모든 대화에서 Yana가 따르는 규칙", "Yana 在每次对话中遵循的规则")}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "var(--good)", opacity: savedInstr ? 1 : 0, transition: "opacity .3s", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {Icons.check(11)} {L("Saved", "Đã lưu", "저장됨", "已保存")}
          </span>
        </div>
        <textarea value={instr} onChange={onInstrChange} rows={5}
          placeholder={L(
            "e.g. Always explain briefly. Prefer optimised code for Mac M4. Reply in Vietnamese for casual notes.",
            "e.g. Luôn giải thích ngắn gọn. Ưu tiên code tối ưu cho Mac M4. Trả lời tiếng Việt cho ghi chú thường ngày.",
            "예: 항상 간단히 설명. Mac M4에 최적화된 코드 선호. 편한 메모는 한국어로 답변.",
            "例：始终简明扼要。优先使用针对 Mac M4 优化的代码。日常笔记用中文回复。"
          )}
          style={{
            width: "100%", resize: "vertical", padding: "10px 13px",
            borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
            background: "rgba(var(--surface-rgb), .6)", color: "var(--ink)",
            fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = "var(--primary)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
      </div>
    </Card>
  );
}
