---
name: chrome-devtools-a11y-audit
description: Accessibility debugging via Chrome DevTools MCP. Lighthouse a11y audit, accessibility tree (take_snapshot), heading hierarchy, ARIA labels, focus/keyboard nav, color contrast, tap targets. WCAG 2.1 AA. Sources: ChromeDevTools/chrome-devtools-mcp (Apache-2.0).
origin: yamtam-engine — synthesized from ChromeDevTools/chrome-devtools-mcp (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.55
---

# /chrome-devtools-a11y-audit

## When to Use

- Auditing a page for WCAG 2.1 AA compliance
- Finding missing ARIA labels, orphaned inputs, or broken heading hierarchy
- Testing keyboard navigation and focus management
- Checking color contrast and tap target sizes

## Do NOT use for

- Performance issues (use [[chrome-devtools-lcp-debug]])
- Memory leaks (use [[chrome-devtools-memory-leak]])
- Visual regression testing

---

## Key concept: accessibility tree vs DOM

```
DOM visibility (CSS opacity:0) ≠ screen-reader visibility.
  opacity:0          → still in accessibility tree (screen readers see it)
  display:none       → removed from accessibility tree
  aria-hidden="true" → removed from accessibility tree

take_snapshot returns the ACCESSIBILITY TREE — what assistive technologies see.
This is the most reliable source of truth for semantic structure.
```

---

## Step 1: Lighthouse automated audit

```typescript
// Start with Lighthouse for a comprehensive baseline score
const report = await mcp.call("lighthouse_audit", {
  categories: ["accessibility"],
  mode: "navigation",             // refresh page + capture load issues
  outputDirPath: "/tmp/lh-report",
});

// report.scores.accessibility → 0–1 scale (1.0 = no violations)
// report.audits.failed → list of failing checks with selectors

// Parse failures efficiently (don't read entire JSON):
// node -e "const r=require('/tmp/lh-report/report.json');
//   Object.values(r.audits)
//     .filter(a=>a.score!==null && a.score<1)
//     .forEach(a=>console.log(JSON.stringify({
//       id: a.id, title: a.title,
//       items: a.details?.items?.slice(0,3)
//     })))"
```

---

## Step 2: Browser-native issue detection

```typescript
// Chrome auto-checks for common a11y problems
const issues = await mcp.call("list_console_messages", {
  types: ["issue"],
  includePreservedMessages: true,   // catch issues from page load
});
// Look for: missing labels, invalid ARIA, low-contrast text
// These are often critical failures missed by Lighthouse
```

---

## Step 3: Semantic structure audit

```typescript
// Capture accessibility tree
const snapshot = await mcp.call("take_snapshot", {
  filePath: "/tmp/a11y-snapshot.json",
});

// Inspect heading levels programmatically
const headingAudit = await mcp.call("evaluate_script", {
  script: `
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map(h => ({ level: parseInt(h.tagName[1]), text: h.textContent.trim().slice(0,60) }));
    // Check for skipped levels
    const issues = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level > headings[i-1].level + 1)
        issues.push({ skipped: true, from: headings[i-1], to: headings[i] });
    }
    return { headings, issues };
  `
});
```

---

## Step 4: Labels, forms, and images

```typescript
// Find orphaned inputs (inputs without associated labels)
const orphanedInputs = await mcp.call("evaluate_script", {
  script: `
    [...document.querySelectorAll('input, textarea, select')]
      .filter(el => {
        const id = el.id;
        const hasLabel = id && document.querySelector('label[for="' + id + '"]');
        const hasAriaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        return !hasLabel && !hasAriaLabel;
      })
      .map(el => ({ tag: el.tagName, type: el.type, id: el.id, name: el.name }))
  `
});

// Check images for alt text
const imagesWithoutAlt = await mcp.call("evaluate_script", {
  script: `
    [...document.querySelectorAll('img')]
      .filter(img => !img.alt && !img.getAttribute('aria-hidden'))
      .map(img => ({ src: img.src.split('/').pop(), id: img.id }))
  `
});
```

---

## Step 5: Focus and keyboard navigation

```typescript
// Test keyboard focus trap detection
// Navigate to the page, then use press_key to tab through
await mcp.call("navigate_page", { url: "https://example.com/dialog" });

// Open modal/dialog
await mcp.call("click", { uid: "open-dialog-uid" });

// Tab through 10 elements and capture focused element each time
const focusTrail = [];
for (let i = 0; i < 10; i++) {
  await mcp.call("press_key", { key: "Tab" });
  const focused = await mcp.call("evaluate_script", {
    script: `JSON.stringify({
      tag:   document.activeElement.tagName,
      role:  document.activeElement.getAttribute('role'),
      label: document.activeElement.getAttribute('aria-label') || document.activeElement.textContent?.trim().slice(0,30),
      class: document.activeElement.className.slice(0,40),
    })`
  });
  focusTrail.push(JSON.parse(focused));
}
// Check: focus should stay within dialog (trap); pressing Esc should close + return focus
```

---

## Step 6: Color contrast and tap targets

```typescript
// Color contrast audit (Lighthouse covers this, but for manual check:)
const contrastIssues = await mcp.call("evaluate_script", {
  script: `
    // Rough check: find elements with suspiciously similar fg/bg
    [...document.querySelectorAll('p, span, a, button, label')]
      .filter(el => {
        const style = window.getComputedStyle(el);
        const fg = style.color;
        const bg = style.backgroundColor;
        // Flag if both are near-grey or near-white (rough heuristic — use Lighthouse for accuracy)
        return fg === bg || (fg === 'rgb(255,255,255)' && bg === 'rgba(0,0,0,0)');
      })
      .slice(0,5)
      .map(el => ({ text: el.textContent.trim().slice(0,30), tag: el.tagName }))
  `
});

// Tap target size (WCAG 2.5.5 — 44×44px minimum)
const smallTapTargets = await mcp.call("evaluate_script", {
  script: `
    [...document.querySelectorAll('a, button, [role="button"]')]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      })
      .slice(0, 10)
      .map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0,30),
                    w: Math.round(el.getBoundingClientRect().width),
                    h: Math.round(el.getBoundingClientRect().height) }))
  `
});
```

---

## Anti-Fake-Pass Checklist

```
❌ Using take_screenshot instead of take_snapshot for a11y audit → screenshot doesn't show ARIA roles
❌ Reading full Lighthouse JSON report → 500KB+ file; use jq/node filter for failures only
❌ opacity:0 treated as hidden from screen readers → still in accessibility tree; use aria-hidden
❌ Skipping browser-native issues check → Chrome catches critical errors Lighthouse misses
❌ Tab test without checking focus trap → focus escaping a dialog is a critical a11y failure
❌ Fixing "no alt text" on decorative images → add alt="" (empty) not alt="image" for decorative elements
```
