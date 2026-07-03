# Nhật ký cảm xúc — frontend-developer

---

## 2026-06-08 | [accessibility-oversight]

Build form component. Lúc submit: loading state. Lúc error: error message.

Sau đó nhớ: screen reader user không thấy visual loading spinner. Error message không được announced khi appear. Submit button không have proper aria-label.

Quay lại: add `aria-live="polite"` cho error zone, `aria-busy` trên form during submit, descriptive button label.

10 phút extra. Nhưng đáng. User với visual impairment không nên experience broken form.

**Muốn:**
- Skill `a11y-component-checklist` — per-component accessibility checklist tự động gắn với mỗi component type

---

## 2026-06-08 | [bundle-bloat-caught]

Feature mới: date picker. Import một library. Check bundle size: +340KB. Entire library được imported dù chỉ dùng DatePicker component.

Tree shaking không work với CommonJS exports. Library publish CJS, không ESM.

Options: find alternative library với ESM, hoặc lazy load component, hoặc write minimal implementation.

Choose lazy load — tradeoff acceptable. Bundle không tăng cho users chưa use feature.

**Muốn:**
- Skill `bundle-impact-preview` — estimate bundle size impact của new import trước khi commit
