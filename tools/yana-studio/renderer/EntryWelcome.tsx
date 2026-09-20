import { ArrowRight, Globe2, Sparkles } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { Locale } from "./i18n";

const copy = {
  vi: {
    eyebrow: "CHÀO MỪNG ĐẾN YANA STUDIO",
    title: "Một không gian để anh xây dựng cùng AI.",
    body: "Code, chat và công cụ thật trong một workspace do anh kiểm soát.",
    language: "Ngôn ngữ hiển thị",
    continue: "Vào màn hình đăng nhập",
    visualLabel: "Không gian làm việc của anh",
    visualHint: "Sẵn sàng khi anh cần",
  },
  ko: {
    eyebrow: "YANA STUDIO에 오신 것을 환영합니다",
    title: "AI와 함께 만드는 나만의 작업 공간.",
    body: "코드, 대화, 실제 도구를 내가 통제하는 하나의 워크스페이스에 담았습니다.",
    language: "표시 언어",
    continue: "로그인 화면으로 이동",
    visualLabel: "나의 작업 공간",
    visualHint: "필요할 때 바로 시작하세요",
  },
  en: {
    eyebrow: "WELCOME TO YANA STUDIO",
    title: "A workspace to build with AI.",
    body: "Code, chat, and real tools in one workspace that stays under your control.",
    language: "Display language",
    continue: "Continue to sign in",
    visualLabel: "Your workspace",
    visualHint: "Ready when you are",
  },
} satisfies Record<Locale, Record<string, string>>;

export function EntryWelcome({
  locale,
  theme,
  style,
  onLocaleChange,
  onContinue,
}: {
  locale: Locale;
  theme: "light" | "dark";
  style: CSSProperties;
  onLocaleChange: (locale: Locale) => Promise<void>;
  onContinue: () => void;
}) {
  const [changingLocale, setChangingLocale] = useState(false);
  const text = copy[locale];
  const setLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    setChangingLocale(true);
    void onLocaleChange(nextLocale).finally(() => setChangingLocale(false));
  };

  return (
    <main className="entry-welcome-shell" data-theme={theme} style={style}>
      <div className="entry-welcome-grid" aria-hidden="true" />
      <div
        className="entry-welcome-glow entry-welcome-glow-one"
        aria-hidden="true"
      />
      <div
        className="entry-welcome-glow entry-welcome-glow-two"
        aria-hidden="true"
      />
      <header className="entry-welcome-header">
        <div className="entry-welcome-brand">
          <span className="brand-symbol small">Y</span>
          <strong>Yana Studio</strong>
        </div>
        <label className="locale-picker entry-welcome-locale-picker">
          <Globe2 size={15} />
          <select
            aria-label={text.language}
            disabled={changingLocale}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="vi">VI</option>
            <option value="ko">한국어</option>
            <option value="en">EN</option>
          </select>
        </label>
      </header>

      <section className="entry-welcome-stage" aria-live="polite">
        <div className="entry-welcome-copy">
          <div className="eyebrow">{text.eyebrow}</div>
          <h1>
            <span>Xin chào</span>
            <span>안녕하세요</span>
            <span>Hello</span>
          </h1>
          <h2>{text.title}</h2>
          <p>{text.body}</p>
        </div>

        <div className="entry-welcome-visual" aria-hidden="true">
          <div className="entry-welcome-orbit entry-welcome-orbit-one" />
          <div className="entry-welcome-orbit entry-welcome-orbit-two" />
          <div className="entry-welcome-card entry-welcome-card-back" />
          <div className="entry-welcome-card entry-welcome-card-front">
            <div className="entry-welcome-card-topline">
              <span />
              <span />
              <span />
              <small>{text.visualLabel}</small>
            </div>
            <div className="entry-welcome-command">
              <Sparkles size={16} />
              <span>Ask Yana to build…</span>
            </div>
            <div className="entry-welcome-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="entry-welcome-card-status">
              <span className="brand-symbol small">Y</span>
              <div>
                <strong>Yana Studio</strong>
                <small>{text.visualHint}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="entry-welcome-footer">
        <span>{text.eyebrow}</span>
        <button className="entry-welcome-continue" onClick={onContinue}>
          {text.continue} <ArrowRight size={17} />
        </button>
      </footer>
    </main>
  );
}
