# Codexmate — Vietnamese (VI) Language Patch

Thêm tiếng Việt vào codexmate UI (992 strings).

## Cách dùng

```bash
# Cài codexmate global trước
npm install -g codexmate

# Chạy patch
python3 tools/codexmate-vi-patch/patch.py

# Restart
codexmate run
```

Vào **Settings → Language → VI** để bật tiếng Việt.

## Patch bao gồm

- `i18n.dict.mjs` — thêm section `vi` với 992 strings dịch
- `i18n.mjs` — thêm `vi` vào `normalizeLang()`
- `layout-header.html` — thêm nút **VI** vào language switch (header + sidebar)
- `layout-shell.css` — thêm CSS cho `.lang-switch-vi`

## Re-patch sau khi update codexmate

```bash
npm update -g codexmate
python3 tools/codexmate-vi-patch/patch.py
```
