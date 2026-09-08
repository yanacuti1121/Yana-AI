// New-app locale formatting has one small home so screens don't infer a
// locale from English labels or hand-format dates. Invalid/missing data stays
// visibly unavailable rather than becoming a fabricated timestamp.
const LOCALES = { en: 'en-US', vi: 'vi-VN', ko: 'ko-KR', zh: 'zh-CN' };

export function localeFor(language) {
  return LOCALES[language] || LOCALES.en;
}

export function formatDateTime(value, language) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}
