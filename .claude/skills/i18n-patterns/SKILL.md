---
name: i18n-patterns
description: >
  Design and implement internationalization (i18n) — RTL layout, text expansion
  budgeting, locale-aware APIs, cultural color semantics, pseudo-localization
  testing, and Vietnamese-specific considerations. Use when asked about "RTL",
  "right-to-left", "internationalization", "localization", "i18n", "l10n",
  "translate the app", "text expansion", "Arabic/Hebrew layout", or "support
  multiple languages". Do NOT use for: translation content itself — that is a
  human/MT workflow. Do NOT use for: font loading — use `typography-system`.
origin: adapted:ux-ui-mastery
license: MIT © phazurlabs
version: 1.0.0
compatibility: "Any web frontend. CSS logical properties + Intl API. React/Vue/Svelte examples included."
---

<!-- Adapted from phazurlabs/ux-ui-mastery (MIT) — i18n Patterns skill #11.
     RTL CSS logical properties, text expansion, Intl API, Hofstede cultural dimensions.
     YAMTAM structure, Vietnamese-specific section, and Anti-Fake-Pass gate are original. -->

## When to Use

- Use when: adding a second language to any UI
- Use when: Arabic, Hebrew, Persian, or Urdu support is required (RTL)
- Use when: UI breaks with German/Finnish/Vietnamese text (text expansion)
- Use when: date, number, or currency formatting is hardcoded
- Use when: running pre-ship i18n audit
- Do NOT use for: translation management workflows — that is ops/tooling

---

## RTL (Right-to-Left) Layout

### Never use physical directions in CSS — use logical properties

```css
/* ❌ Physical — breaks in RTL */
margin-left: 16px;
padding-right: 8px;
border-left: 2px solid;
text-align: left;
float: left;

/* ✓ Logical — works in both LTR and RTL */
margin-inline-start: 16px;
padding-inline-end: 8px;
border-inline-start: 2px solid;
text-align: start;
float: inline-start;
```

### Enable RTL on the root element
```html
<html lang="ar" dir="rtl">
  <!-- OR for dynamic switching: -->
<html lang="ar" dir="auto">
```

```css
/* Flexbox is RTL-aware when dir is set */
.nav { display: flex; gap: 8px; }
/* In RTL: items flow right→left automatically */

/* CSS logical shorthands */
.card {
  margin-block: 16px;    /* top + bottom */
  margin-inline: 24px;   /* start + end (left in LTR, right in RTL) */
  padding-block: 12px;
  padding-inline: 16px;
}
```

### Icons and directional assets
- Arrows, back buttons, chevrons: flip horizontally in RTL
- Non-directional icons (star, heart, warning): do NOT flip
- Technique: `transform: scaleX(-1)` scoped to `[dir="rtl"]`

```css
[dir="rtl"] .icon-arrow,
[dir="rtl"] .icon-back { transform: scaleX(-1); }
```

---

## Text Expansion Budgets

Translated text is longer than English. Design for it.

| Language | Expansion vs English | Budget rule |
|---|---|---|
| German | +30–35% | +40% to be safe |
| Finnish | +30–40% | +45% to be safe |
| French | +15–20% | +25% to be safe |
| Spanish | +20–25% | +30% to be safe |
| Portuguese | +20–30% | +35% to be safe |
| Vietnamese | +5–15% | +20% (tone marks add width) |
| Japanese/Chinese | −10 to +5% | Usually shorter — test wrapping |
| Arabic | −10 to +10% | RTL layout is the real challenge |

### Design rules
- Never use fixed-width containers for text — use `min-width`, not `width`
- Button text must wrap or truncate gracefully — test "Sign In" → "Anmelden" (40% longer)
- Navigation labels: keep to 1–2 words max; truncate with `…` at `max-width`
- Error messages: the longest strings — test in German first

---

## Locale-Aware APIs (Intl)

Always use the platform's `Intl` API. Never hardcode formats.

```js
// ❌ Hardcoded
const date = `${month}/${day}/${year}`;   // US-only
const price = `$${amount.toFixed(2)}`;    // USD-only

// ✓ Locale-aware
const date = new Intl.DateTimeFormat(locale, {
  year: 'numeric', month: 'long', day: 'numeric'
}).format(dateObj);
// en-US → "January 15, 2025"
// de-DE → "15. Januar 2025"
// vi-VN → "15 tháng 1, 2025"

const price = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: currencyCode   // 'USD', 'EUR', 'VND'
}).format(amount);
// en-US → "$1,234.56"
// de-DE → "1.234,56 €"
// vi-VN → "1.234.560 ₫"
```

### Common Intl APIs to use

| API | Use |
|---|---|
| `Intl.DateTimeFormat` | All dates and times |
| `Intl.NumberFormat` | Numbers, currencies, percentages |
| `Intl.RelativeTimeFormat` | "2 hours ago", "in 3 days" |
| `Intl.PluralRules` | "1 item" vs "2 items" (complex in Arabic: 6 plural forms) |
| `Intl.Collator` | Locale-correct alphabetical sorting |

---

## Cultural Color Semantics

Color meaning varies by culture. Never assume universal mapping.

| Color | Western | East Asian | Middle East |
|---|---|---|---|
| Red | Danger, error | Luck, success | Caution |
| Green | Success, go | Envy (some contexts) | Islam, safety |
| White | Purity, clean | Mourning (some) | Purity |
| Purple | Royalty, luxury | Mourning (some) | Royalty |
| Yellow | Warning | Imperial, sacred | Mixed |

Rules:
- Never convey information through color alone — add icon or text label
- For error/success states: always use shape + color (not color-only)
- Run a cultural review for any product entering a new major market

---

## Vietnamese-Specific Notes

```css
/* Vietnamese text benefits from more line height — diacritics stack vertically */
:lang(vi) {
  line-height: 1.7;
  word-spacing: 0.05em;   /* words are monosyllabic, slight gap aids reading */
}

/* Vietnamese uses Latin script — no special font required */
/* But: ensure font includes full Vietnamese Unicode range (U+0300–U+036F, U+1E00–U+1EFF) */
```

- Vietnamese currency: ₫ (VND) — `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`
- Date format: `dd/MM/yyyy` or `ngày dd tháng MM năm yyyy`
- Comma is decimal separator in some Vietnamese conventions — use `Intl.NumberFormat` consistently
- Plural forms: Vietnamese has no grammatical plural — "1 mục" and "5 mục" use the same form

---

## Pseudo-Localization Testing

Run pseudo-localization before any real translation. Catches layout issues early.

```js
// Simple pseudo-localizer — wrap ASCII chars in diacritics + add length
function pseudoLocalize(str) {
  const map = { a:'à', e:'è', i:'ì', o:'ò', u:'ù', n:'ñ' };
  return '[' + str.replace(/[aeioún]/g, c => map[c] || c) + ' ~~~]';
}
// "Sign In" → "[Sìgñ Ìñ ~~~]"
// The brackets expose missing overflow handling
// The ~~~ adds +30% length to simulate German expansion
```

Run pseudo-localization across all UI strings before handing off to translators.
Any layout that breaks with pseudo-localized strings will break with real translations.

---

## Pre-Ship i18n Checklist

```
□ All user-visible strings externalized to message catalog (no hardcoded English)
□ Dates: using Intl.DateTimeFormat — no manual format strings
□ Numbers/currency: using Intl.NumberFormat
□ Plural forms: Intl.PluralRules used (or i18n library handles it)
□ RTL layout: CSS logical properties throughout, tested with dir="rtl"
□ Directional icons: flip rules defined for RTL
□ Text expansion: tested with German (+35%) — no overflow/truncation issues
□ Pseudo-localization: run across all screens — no layout breaks
□ Color semantics: no information conveyed by color alone
□ Font: tested with all target scripts (Latin, Arabic, CJK as applicable)
```

---

## Anti-Fake-Pass Rules

Before claiming i18n is done, you MUST show:
- [ ] All strings externalized — no hardcoded English in templates
- [ ] Dates and numbers using Intl API (not manual formatting)
- [ ] RTL tested: at least one screen rendered with `dir="rtl"` screenshot/evidence
- [ ] Text expansion: UI tested with German or Finnish strings (+35%)
- [ ] Pseudo-localization run: no layout breaks reported

Reference: `gates/anti-fake-pass-gate.md`
