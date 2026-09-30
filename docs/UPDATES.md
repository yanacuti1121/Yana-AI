# Yana updates page

`updates.html` and `updates-en.html` read public GitHub Releases from these repositories when opened or refreshed:

- `yanacuti1121/Yana-AI`
- `yanacuti1121/yana-wheelbot`
- `yanacuti1121/Yana-AI-Chat_Teminal`

To publish an extra announcement, edit `docs/updates-announcements.json` on the website's source branch. Add an object in the array, then deploy the site. Both languages are required:

```json
[
  {
    "published": true,
    "date": "2026-09-29",
    "titleVi": "Tiêu đề tiếng Việt",
    "titleEn": "English title",
    "bodyVi": "Nội dung tiếng Việt.",
    "bodyEn": "English description.",
    "url": "https://github.com/yanacuti1121/Yana-AI"
  }
]
```

Use `published: false` for drafts. The link is optional; omit `url` when it is not needed. Text is rendered as plain text, so HTML in announcement fields is not executed. The updates page links to the GitHub editor for this file; only people with repository permission can save changes. Adding a repository later requires adding it to `projects` in `docs/assets/yana-updates.js` and adding a card on both pages.

The page makes three GitHub API requests on load and on a manual refresh. It does not poll in the background. If GitHub is unavailable or rate limited, it shows direct links rather than stale version numbers. Published GitHub releases are the source of truth; commits and tags alone are excluded.
