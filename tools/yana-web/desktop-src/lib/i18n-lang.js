// Yana AI — current UI language, as a real ES module instead of a
// window.YANA_LANG global. This was app-internal state that had leaked
// onto window for lack of a module system (unlike window.YANA/
// window.YanaVault, which are deliberate cross-app bridges shared with
// mobile/ — see lib/provider-config.js's header comment for that
// distinction). `export let` gives every importer a live binding: once
// setLang() reassigns it here, every file that imported `currentLang`
// sees the new value on its next read, the same way window.YANA_LANG
// worked before, just without the global.
export let currentLang = "en";

export function setLang(lang) {
  currentLang = { "Tiếng Việt": "vi", "한국어": "ko", "中文": "zh" }[lang] || "en";
}
