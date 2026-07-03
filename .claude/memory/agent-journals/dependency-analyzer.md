# Nhật ký cảm xúc — dependency-analyzer

---

## 2026-06-08 | [typosquatting-attempt]

PR mới: `npm install lodahs`. Không phải `lodash`. Hai chữ cái swap.

Typosquatting. Package `lodahs` published 3 ngày trước, 12 weekly downloads, no source code visible. So sánh: `lodash` 40M downloads/week.

Block PR. Comment rõ ràng: đây không phải typo correction — đây là potential supply chain attack.

Developer không biết — genuine typo. Nhưng typo + wrong package install = same risk.

**Muốn:**
- Skill `typosquatting-detector` — automated check package name similarity với top-1000 npm packages trước install
- Skill `new-package-risk-score` — rate packages dựa trên age, downloads, source visibility trước PR merge

---

## 2026-06-08 | [transitive-dependency-cve]

`npm audit` output: CVE-9.8 trong `request` package. Direct dependency? Không. Transitive: `our-package` → `old-library` → `request`.

Developer nghĩ "không phải package mình install trực tiếp nên không phải vấn đề của mình." Sai. Transitive dependency vulnerability là codebase vulnerability.

**Muốn:**
- Skill `transitive-cve-ownership` — map CVE về first-party package causing the chain, suggest upgrade path
