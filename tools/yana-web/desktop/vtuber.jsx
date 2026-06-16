// Yana AI — VTuber companion
// Slides in occasionally with a short, contextual hint. Click to dismiss.

const HINTS = {
  en: [
    "Try /code-review before merging! 🌿",
    "Wrap up your session with /wrap-up to save context.",
    "Need tests? /write-tests can scaffold them fast.",
    "Feeling stuck? /debug traces the issue step by step.",
    "Quick commit ready? /quick-commit handles it in one go.",
    "Big task ahead? /plan first — then code.",
    "Want a deep review? /code-review ultra runs multi-agent.",
    "Check overall health with /project-health-check.",
    "Spent a while on this? /session-wrap saves your progress.",
    "Refactor time? /refactor-clean keeps it surgical.",
  ],
  vi: [
    "Thử /code-review trước khi merge nhé! 🌿",
    "Dùng /wrap-up để lưu context trước khi tắt.",
    "Cần test? /write-tests tạo nhanh cho anh.",
    "Bí rồi? /debug trace từng bước.",
    "Commit nhanh? /quick-commit là đủ.",
    "Task lớn? /plan trước — rồi mới code.",
    "Cần review sâu? /code-review ultra chạy đa agent.",
    "Xem tổng thể? /project-health-check đi.",
    "Làm lâu rồi? /session-wrap để lưu lại.",
    "Refactor? /refactor-clean cho gọn.",
  ],
};

const IDLE_HINTS = {
  en: ["Still here? 👀", "Take a short break if you need it 🍵", "How's everything going?"],
  vi: ["Anh còn đó không? 👀", "Nghỉ ngơi tí đi anh 🍵", "Mọi thứ ổn không?"],
};

/* ---------- Sprite ---------- */
function YanaSprite({ blinking, talking, wiggling }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="72" height="72" viewBox="0 0 72 72"
      style={{
        filter: "drop-shadow(0 6px 16px rgba(47,126,110,0.40))",
        animation: wiggling
          ? "vt-wiggle 0.55s ease"
          : "vt-float 3.2s ease-in-out infinite",
        display: "block",
      }}
    >
      <style>{`
        @keyframes vt-float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes vt-wiggle {
          0%,100% { transform: rotate(0deg) scale(1); }
          20%     { transform: rotate(-9deg) scale(1.05); }
          60%     { transform: rotate(9deg) scale(1.05); }
        }
      `}</style>

      {/* Left leaf-ear */}
      <ellipse cx="18" cy="17" rx="9" ry="13" fill="#2f8c6e" transform="rotate(-22 18 17)" />
      <ellipse cx="18" cy="17" rx="5.5" ry="8" fill="#4dbf96" transform="rotate(-22 18 17)" />

      {/* Right leaf-ear */}
      <ellipse cx="54" cy="17" rx="9" ry="13" fill="#2f8c6e" transform="rotate(22 54 17)" />
      <ellipse cx="54" cy="17" rx="5.5" ry="8" fill="#4dbf96" transform="rotate(22 54 17)" />

      {/* Head */}
      <circle cx="36" cy="40" r="26" fill="#2a7a60" />
      <circle cx="36" cy="40" r="24" fill="#3daa88" />

      {/* Soft cheek blush */}
      <ellipse cx="21" cy="46" rx="7" ry="4.5" fill="#5bcba6" opacity="0.45" />
      <ellipse cx="51" cy="46" rx="7" ry="4.5" fill="#5bcba6" opacity="0.45" />

      {/* Eyes */}
      {blinking ? (
        <>
          <rect x="24" y="37" width="9"  height="3" rx="1.5" fill="#1a4a38" />
          <rect x="39" y="37" width="9"  height="3" rx="1.5" fill="#1a4a38" />
        </>
      ) : (
        <>
          <circle cx="28.5" cy="39" r="5" fill="#1a4a38" />
          <circle cx="43.5" cy="39" r="5" fill="#1a4a38" />
          {/* Catchlights */}
          <circle cx="30" cy="37" r="1.8" fill="white" />
          <circle cx="45" cy="37" r="1.8" fill="white" />
        </>
      )}

      {/* Mouth */}
      {talking ? (
        <ellipse cx="36" cy="49" rx="5.5" ry="4" fill="#1a4a38" />
      ) : (
        <path d="M29 47 Q36 53 43 47" stroke="#1a4a38" strokeWidth="2.2"
              fill="none" strokeLinecap="round" />
      )}

      {/* Little top leaf accent */}
      <ellipse cx="36" cy="17" rx="4.5" ry="8" fill="#2a7a60" transform="rotate(5 36 17)" />
      <line x1="36" y1="25" x2="36" y2="14" stroke="#5bcba6" strokeWidth="1.2"
            strokeLinecap="round" />
    </svg>
  );
}

/* ---------- VTuber overlay ---------- */
function VTuber() {
  function lang() { return window.YANA_LANG === "vi" ? "vi" : "en"; }
  function pickHint(pool) {
    const arr = pool[lang()] || pool.en;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const [visible,  setVisible]  = React.useState(false);
  const [hint,     setHint]     = React.useState("");
  const [blinking, setBlinking] = React.useState(false);
  const [talking,  setTalking]  = React.useState(false);
  const [wiggling, setWiggling] = React.useState(false);

  const msgCountRef  = React.useRef(0);
  const hideTimerRef = React.useRef(null);
  const idleTimerRef = React.useRef(null);

  function show(text) {
    setHint(text);
    setVisible(true);
    setTalking(true);
    setWiggling(true);
    setTimeout(() => setTalking(false), 1800);
    setTimeout(() => setWiggling(false), 650);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 9000);
    resetIdle();
  }

  function dismiss() {
    setVisible(false);
    clearTimeout(hideTimerRef.current);
    resetIdle();
  }

  function resetIdle() {
    clearTimeout(idleTimerRef.current);
    // Pop an idle nudge after 3 minutes of silence
    idleTimerRef.current = setTimeout(
      () => show(pickHint(IDLE_HINTS)),
      3 * 60 * 1000
    );
  }

  // Listen for chat messages dispatched from chat.jsx
  React.useEffect(() => {
    function onMsg() {
      msgCountRef.current++;
      resetIdle();
      // Every 5th message → skill tip
      if (msgCountRef.current % 5 === 0) show(pickHint(HINTS));
    }
    window.addEventListener("yana-chat-message", onMsg);
    resetIdle();
    return () => {
      window.removeEventListener("yana-chat-message", onMsg);
      clearTimeout(hideTimerRef.current);
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Random blink every 2.5–5.5 s
  React.useEffect(() => {
    let t;
    function scheduleBlink() {
      t = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 145);
        scheduleBlink();
      }, 2500 + Math.random() * 3000);
    }
    scheduleBlink();
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        transform: visible ? "translateY(0) scale(1)" : "translateY(110px) scale(0.85)",
        opacity: visible ? 1 : 0,
        transition:
          "transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Speech bubble */}
      <div
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderRadius: 14,
          padding: "9px 14px",
          maxWidth: 210,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "#1a2e1a",
          boxShadow:
            "0 4px 28px rgba(47,126,110,0.18), 0 1px 4px rgba(0,0,0,0.07)",
          textAlign: "center",
          position: "relative",
        }}
      >
        {hint}
        {/* Tail */}
        <svg
          style={{
            position: "absolute",
            bottom: -10,
            left: "50%",
            transform: "translateX(-50%)",
          }}
          width="22" height="11" viewBox="0 0 22 11"
        >
          <path d="M0 0 L11 11 L22 0 Z" fill="rgba(255,255,255,0.97)" />
        </svg>
      </div>

      {/* Character — click to dismiss */}
      <div
        onClick={dismiss}
        title={lang() === "vi" ? "Bấm để đóng" : "Click to dismiss"}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <YanaSprite blinking={blinking} talking={talking} wiggling={wiggling} />
      </div>
    </div>
  );
}
