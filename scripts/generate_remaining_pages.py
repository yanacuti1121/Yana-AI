import os, re

docs_dir = "/Users/vutam/Desktop/Yana-AI/docs"
dest_dir = "/Users/vutam/Desktop/tkgd yana studio ide/my-macbook-demo/public/yana-home"

targets = [
    "install-macos.html", "install-linux.html", "install-windows.html",
    "account.html", "acknowledgements.html", "contact.html", "legal-notices.html",
    "yana-ai-system-map.html", "history.html", "design.html", "search.html", 
    "music.html", "en.html", "ko.html", "macbook_3d_showcase.html", "website-archive.html"
]

header_tpl = """<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Yana AI 2026</title>
  <meta name="description" content="{desc}">
  <link rel="icon" type="image/svg+xml" href="yana-mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/site26.css">
  <link rel="stylesheet" href="assets/studio26.css">
</head>
<body class="site26-body page-article">
  <header class="site26-nav-wrap">
    <nav class="site26-nav" aria-label="Điều hướng chính">
      <a href="index.html" class="nav-brand" aria-label="Yana AI Trang chủ">
        <img src="assets/yana-rabbit-app-icon.png" alt="Yana Logo" class="brand-logo" width="32" height="32">
        <span class="brand-text">Yana <span class="brand-sub">AI 2026</span></span>
      </a>
      <ul class="nav-links">
        <li><a href="studio.html">Studio IDE</a></li>
        <li><a href="runtime.html">Runtime</a></li>
        <li><a href="wheelbot.html">WheelBot</a></li>
        <li><a href="governance.html">Giám Thị OS</a></li>
        <li><a href="agents-skills.html">Agents & Skills</a></li>
        <li><a href="commands.html">Lệnh (170)</a></li>
        <li><a href="evidence.html">Truth Gate</a></li>
        <li><a href="download.html">Tải về</a></li>
      </ul>
      <div class="nav-cta">
        <a href="download.html" class="btn-nav-primary">Tải Yana Studio</a>
      </div>
    </nav>
  </header>

  <main class="site26-main doc-container">
    <section class="doc-hero">
      <div class="doc-badge">{badge}</div>
      <h1 class="doc-title">{h1}</h1>
      <p class="doc-lead">{lead}</p>
    </section>

    <div class="doc-content-wrapper">
      <div class="doc-main-body">
{body_content}
      </div>
    </div>
  </main>

  <footer class="site26-footer">
    <div class="footer-inner">
      <div class="footer-brand-col">
        <a href="index.html" class="footer-logo">
          <img src="assets/yana-rabbit-app-icon.png" alt="Yana" width="28" height="28">
          <span>Yana AI</span>
        </a>
        <p class="footer-tagline">Hệ điều hành Agentic AI cá nhân hóa — An toàn theo thiết kế, bảo chứng bằng sự thật.</p>
        <div class="footer-crypto-badge">SHA-256 Verified Ecosystem • 2026</div>
      </div>
      <div class="footer-links-grid">
        <div class="footer-col">
          <h4>Sản Phẩm</h4>
          <ul>
            <li><a href="studio.html">Yana Studio IDE</a></li>
            <li><a href="runtime.html">Yana Runtime Engine</a></li>
            <li><a href="wheelbot.html">WheelBot Physical AI</a></li>
            <li><a href="governance.html">Giám Thị OS</a></li>
            <li><a href="download.html">Tải Bản Phát Hành</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Kiến Trúc & An Toàn</h4>
          <ul>
            <li><a href="architecture.html">Kiến Trúc Hệ Thống</a></li>
            <li><a href="evidence.html">Truth Gate L0–L5</a></li>
            <li><a href="safety.html">Hàng Rào Bảo Vệ</a></li>
            <li><a href="connectors.html">MCP & Connectors</a></li>
            <li><a href="continuity.html">Bộ Nhớ L1/L2</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Cài Đặt & Hỗ Trợ</h4>
          <ul>
            <li><a href="install-macos.html">Cài trên macOS</a></li>
            <li><a href="install-linux.html">Cài trên Linux</a></li>
            <li><a href="install-windows.html">Cài trên Windows</a></li>
            <li><a href="yana-ai-system-map.html">Bản Đồ Hệ Thống</a></li>
            <li><a href="support.html">Trung Tâm Hỗ Trợ</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Pháp Lý & Minh Bạch</h4>
          <ul>
            <li><a href="privacy.html">Chính Sách Riêng Tư</a></li>
            <li><a href="legal-notices.html">Thông Cáo Pháp Lý</a></li>
            <li><a href="acknowledgements.html">Tri Ân Mã Nguồn Mở</a></li>
            <li><a href="history.html">Lịch Sử Phát Triển</a></li>
            <li><a href="updates.html">Nhật Ký Cập Nhật</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 Yana AI. Bản quyền mở theo Giấy phép MIT. Phát triển độc lập và tự chủ.</p>
      <div class="footer-bottom-links">
        <a href="privacy.html">Bảo mật</a>
        <a href="legal-notices.html">Điều khoản</a>
        <a href="contact.html">Liên hệ</a>
      </div>
    </div>
  </footer>

  <script src="assets/site26.js"></script>
</body>
</html>
"""

for target in targets:
    src_path = os.path.join(docs_dir, target)
    if not os.path.exists(src_path):
        print(f"Skipping {target}: not found")
        continue
    with open(src_path, "r", encoding="utf-8") as f:
        src_html = f.read()

    # Extract title
    title_m = re.search(r"<title>(.*?)</title>", src_html, re.I | re.DOTALL)
    title = title_m.group(1).strip() if title_m else target.replace(".html", "").title()
    title = re.sub(r"\s*[—–-]\s*Yana.*$", "", title).strip()

    # Extract body or main
    body_m = re.search(r"<body[^>]*>(.*?)</body>", src_html, re.I | re.DOTALL)
    content = body_m.group(1) if body_m else src_html
    
    # Remove header, nav, footer, script, style from original content
    content = re.sub(r"<header\b[^>]*>.*?</header>", "", content, flags=re.I | re.DOTALL)
    content = re.sub(r"<nav\b[^>]*>.*?</nav>", "", content, flags=re.I | re.DOTALL)
    content = re.sub(r"<footer\b[^>]*>.*?</footer>", "", content, flags=re.I | re.DOTALL)
    content = re.sub(r"<script\b[^>]*>.*?</script>", "", content, flags=re.I | re.DOTALL)
    content = re.sub(r"<style\b[^>]*>.*?</style>", "", content, flags=re.I | re.DOTALL)

    # Extract h1
    h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", content, re.I | re.DOTALL)
    h1 = h1_m.group(1).strip() if h1_m else title
    # Remove h1 from content
    content = re.sub(r"<h1\b[^>]*>.*?</h1>", "", content, count=1, flags=re.I | re.DOTALL)

    # Extract lead
    lead_m = re.search(r"<p[^>]*class=[\"'][^\"']*(?:lead|intro|sub)[^\"']*[\"'][^>]*>(.*?)</p>", content, re.I | re.DOTALL)
    if not lead_m:
        lead_m = re.search(r"<p[^>]*>(.*?)</p>", content, re.I | re.DOTALL)
    lead = re.sub(r"<[^>]+>", "", lead_m.group(1)).strip() if lead_m else "Tài liệu kỹ thuật và hướng dẫn thuộc hệ sinh thái Yana AI 2026."
    
    badge = "HỆ THỐNG YANA AI 2026"
    if "install" in target:
        badge = "HƯỚNG DẪN CÀI ĐẶT"
    elif any(k in target for k in ["legal", "privacy", "acknowledgements"]):
        badge = "PHÁP LÝ & MINH BẠCH"
    elif any(k in target for k in ["map", "history", "architecture"]):
        badge = "BẢN ĐỒ & LỊCH SỬ"

    lang = "vi"
    if target in ["en.html", "account-en.html"]:
        lang = "en"
    elif target in ["ko.html", "account-ko.html"]:
        lang = "ko"

    final_html = header_tpl.format(
        lang=lang,
        title=title,
        desc=re.sub(r"\s+", " ", lead[:160]).replace('"', "&quot;"),
        badge=badge,
        h1=h1,
        lead=lead,
        body_content=content.strip()
    )

    out_path = os.path.join(dest_dir, target)
    with open(out_path, "w", encoding="utf-8") as out:
        out.write(final_html)
    print(f"OK: {target}")
