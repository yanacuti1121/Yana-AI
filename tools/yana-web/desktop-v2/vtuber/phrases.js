// Yana AI — VTuber companion: canned phrase pools + language/pick helpers.
export const VT_HINTS = {
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

export const VT_IDLE = {
  en: ["Still here? 👀", "Take a short break if you need it 🍵", "How's everything going? ✨"],
  vi: ["Anh còn đó không? 👀", "Nghỉ ngơi tí đi anh 🍵", "Mọi thứ ổn không? ✨"],
};

export const VT_GREET = {
  en: ["Hi! Need help with anything? 🐰", "I'm here if you need me~", "What are we building today? ✨"],
  vi: ["Chào anh! Cần em giúp gì không? 🐰", "Em ở đây nếu anh cần~", "Hôm nay mình build gì nào? ✨"],
};

export function vtLang() { return window.YANA_LANG === "vi" ? "vi" : "en"; }
export function vtPick(pool) {
  const arr = pool[vtLang()] || pool.en;
  return arr[Math.floor(Math.random() * arr.length)];
}
