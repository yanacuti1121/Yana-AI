import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Files,
  FolderOpen,
  LayoutTemplate,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type { Locale } from "./types";

type Copy = {
  skip: string;
  back: string;
  next: string;
  finish: string;
  openProject: string;
  steps: {
    eyebrow: string;
    title: string;
    body: string;
  }[];
};

const copy: Record<Locale, Copy> = {
  vi: {
    skip: "Bỏ qua giới thiệu",
    back: "Quay lại",
    next: "Tiếp tục",
    finish: "Vào Workspace",
    openProject: "Mở project đầu tiên",
    steps: [
      {
        eyebrow: "CHÀO MỪNG ĐẾN YANA STUDIO",
        title:
          "Một nơi để anh làm việc cùng AI — nhưng quyền quyết định vẫn thuộc về anh.",
        body: "Yana Studio kết nối trò chuyện, mã nguồn, terminal, thiết kế và runtime trong cùng một workspace local-first.",
      },
      {
        eyebrow: "WORKSPACE HỢP NHẤT",
        title:
          "Từ ý tưởng đến thay đổi thật, không phải nhảy qua nhiều ứng dụng.",
        body: "Mở project, đọc file, trò chuyện theo đúng ngữ cảnh, dựng giao diện và theo dõi tác vụ ngay trong Studio.",
      },
      {
        eyebrow: "HUMAN-GOVERNED",
        title: "AI đề xuất. Yana kiểm tra. Anh phê duyệt.",
        body: "Các hành động nhạy cảm đi qua quyền hạn và bằng chứng. Model có thể thay đổi, ranh giới kiểm soát thì không.",
      },
      {
        eyebrow: "SẴN SÀNG",
        title: "Bắt đầu bằng một project thật.",
        body: "Mở thư mục làm việc để Yana nhận diện project. Anh cũng có thể vào Workspace trước và cấu hình model sau.",
      },
    ],
  },
  en: {
    skip: "Skip introduction",
    back: "Back",
    next: "Continue",
    finish: "Enter Workspace",
    openProject: "Open your first project",
    steps: [
      {
        eyebrow: "WELCOME TO YANA STUDIO",
        title: "One place to work with AI — while you keep the final say.",
        body: "Yana Studio brings chat, source code, terminals, design and the runtime into one local-first workspace.",
      },
      {
        eyebrow: "ONE WORKSPACE",
        title: "Move from an idea to a real change without app-hopping.",
        body: "Open projects, inspect files, chat with the right context, shape interfaces and follow tasks inside Studio.",
      },
      {
        eyebrow: "HUMAN-GOVERNED",
        title: "AI proposes. Yana checks. You approve.",
        body: "Sensitive actions pass through authority and evidence. Models can change; your control boundary does not.",
      },
      {
        eyebrow: "READY",
        title: "Start with a real project.",
        body: "Open a workspace folder so Yana can understand the project, or enter the Workspace and configure a model later.",
      },
    ],
  },
  ko: {
    skip: "소개 건너뛰기",
    back: "뒤로",
    next: "계속",
    finish: "워크스페이스로 이동",
    openProject: "첫 프로젝트 열기",
    steps: [
      {
        eyebrow: "YANA STUDIO에 오신 것을 환영합니다",
        title: "AI와 함께 일하되, 최종 결정권은 사용자가 가집니다.",
        body: "Yana Studio는 채팅, 소스 코드, 터미널, 디자인과 런타임을 하나의 로컬 우선 워크스페이스로 연결합니다.",
      },
      {
        eyebrow: "통합 워크스페이스",
        title: "여러 앱을 오가지 않고 아이디어를 실제 변경으로 만드세요.",
        body: "프로젝트, 파일, 문맥 기반 채팅, 디자인과 작업 흐름을 Studio 안에서 관리합니다.",
      },
      {
        eyebrow: "사람이 통제하는 AI",
        title: "AI가 제안하고 Yana가 확인하며 사용자가 승인합니다.",
        body: "민감한 작업은 권한과 증거를 거칩니다. 모델은 바뀌어도 통제 경계는 유지됩니다.",
      },
      {
        eyebrow: "준비 완료",
        title: "실제 프로젝트로 시작하세요.",
        body: "폴더를 열어 Yana가 프로젝트를 파악하게 하거나, 먼저 워크스페이스로 이동해 나중에 모델을 설정하세요.",
      },
    ],
  },
};

const featureIcons = [MessageSquare, Files, LayoutTemplate, TerminalSquare];
const featureLabels: Record<Locale, string[]> = {
  vi: [
    "Trò chuyện có ngữ cảnh",
    "Tệp & Trình sửa",
    "Design Canvas",
    "Terminal thật",
  ],
  en: [
    "Context-aware chat",
    "Files & Editor",
    "Design Canvas",
    "Real terminal",
  ],
  ko: ["문맥 기반 채팅", "파일 및 편집기", "디자인 캔버스", "실제 터미널"],
};

export function WelcomeOnboarding({
  locale,
  displayName,
  onComplete,
  onOpenProject,
}: {
  locale: Locale;
  displayName: string;
  onComplete: () => Promise<void>;
  onOpenProject: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const text = copy[locale];
  const current = text.steps[step];
  const last = step === text.steps.length - 1;
  const complete = async (openProject: boolean) => {
    setBusy(true);
    try {
      await onComplete();
      if (openProject) await onOpenProject();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <div className="onboarding-aurora" aria-hidden="true" />
      <header className="onboarding-header">
        <div className="onboarding-brand">
          <span className="brand-symbol small">Y</span>
          <strong>Yana Studio</strong>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void complete(false)}
        >
          {text.skip}
        </button>
      </header>

      <section className="onboarding-stage" aria-live="polite">
        <div className="onboarding-copy">
          <div className="eyebrow">{current.eyebrow}</div>
          <h1>
            {step === 0 && displayName ? (
              <>
                <span>
                  {locale === "ko" ? `${displayName}님,` : `${displayName},`}
                </span>
                <br />
              </>
            ) : null}
            {current.title}
          </h1>
          <p>{current.body}</p>

          {step === 1 && (
            <div className="onboarding-features">
              {featureLabels[locale].map((label, index) => {
                const Icon = featureIcons[index];
                return (
                  <div key={label}>
                    <Icon size={18} />
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-authority">
              <span>
                <Sparkles size={17} /> AI
              </span>
              <ArrowRight size={16} />
              <span>
                <ShieldCheck size={17} /> Yana
              </span>
              <ArrowRight size={16} />
              <span>
                <Check size={17} /> Human
              </span>
            </div>
          )}
        </div>

        <div className="onboarding-visual" aria-hidden="true">
          <div className="onboarding-window">
            <div className="onboarding-window-bar">
              <i />
              <i />
              <i />
              <span>Workspace</span>
            </div>
            <div className="onboarding-window-body">
              <aside>
                <b>Y</b>
                <span />
                <span />
                <span />
              </aside>
              <div className="onboarding-canvas">
                <div className="onboarding-command">
                  <Code2 size={15} />
                  <span>Ask Yana to build…</span>
                </div>
                <div className="onboarding-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="onboarding-proof">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>Governed runtime</strong>
                    <small>Permission · evidence · control</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="onboarding-footer">
        <div
          className="onboarding-progress"
          aria-label={`${step + 1} / ${text.steps.length}`}
        >
          {text.steps.map((item, index) => (
            <button
              key={item.eyebrow}
              aria-label={`${index + 1}`}
              aria-current={index === step ? "step" : undefined}
              onClick={() => setStep(index)}
            />
          ))}
        </div>
        <div className="button-row">
          {step > 0 && (
            <button disabled={busy} onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> {text.back}
            </button>
          )}
          {!last ? (
            <button className="primary" onClick={() => setStep(step + 1)}>
              {text.next} <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={() => void complete(false)}>
                {text.finish}
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void complete(true)}
              >
                <FolderOpen size={16} /> {text.openProject}
              </button>
            </>
          )}
        </div>
      </footer>
    </main>
  );
}
