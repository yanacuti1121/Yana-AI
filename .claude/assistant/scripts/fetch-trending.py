#!/usr/bin/env python3
"""
Fetch GitHub Trending daily — cache theo ngày.
Output: JSON list of repos với name, desc, stars, lang, url.

Usage:
  python3 fetch-trending.py              # all languages
  python3 fetch-trending.py rust         # filter by language
  python3 fetch-trending.py --force      # bypass cache

Cache: .claude/assistant/trending_cache.json (tự expire sau 24h)
"""
import sys, re, json, os, time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

CACHE_FILE = Path(__file__).parent.parent / "trending_cache.json"
CACHE_TTL  = 60 * 60 * 22  # 22 hours

# Từ khoá anh Tâm quan tâm — sẽ được đánh dấu ⭐ nếu khớp
INTEREST_KEYWORDS = [
    "ai", "agent", "llm", "rust", "claude", "security", "audit",
    "scanner", "copilot", "codex", "mcp", "anthropic", "openai",
    "fine-tun", "inference", "rag", "embedding", "vector",
]

def load_cache():
    if not CACHE_FILE.exists():
        return None
    try:
        data = json.loads(CACHE_FILE.read_text())
        if time.time() - data.get("fetched_at", 0) < CACHE_TTL:
            return data
    except Exception:
        pass
    return None

def save_cache(data: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))

def fetch_trending(lang: str = "") -> list[dict]:
    url = f"https://github.com/trending/{lang}?since=daily"
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; yamtam-assistant/1.0)"})
    try:
        html = urlopen(req, timeout=10).read().decode("utf-8", errors="replace")
    except (URLError, Exception) as e:
        print(f"[trending] fetch failed: {e}", file=sys.stderr)
        return []

    repos = []
    # Parse article blocks
    articles = re.findall(
        r'<article[^>]*class="Box-row"[^>]*>(.*?)</article>',
        html, re.DOTALL
    )
    for article in articles:
        # Repo name
        name_m = re.search(r'href="/([a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+)"', article)
        if not name_m:
            continue
        name = name_m.group(1)

        # Description
        desc_m = re.search(r'<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*(.*?)\s*</p>', article, re.DOTALL)
        desc = re.sub(r"\s+", " ", desc_m.group(1)).strip() if desc_m else ""

        # Stars
        stars_m = re.search(r'href="/' + re.escape(name) + r'/stargazers[^>]*>\s*([\d,]+)', article)
        if not stars_m:
            stars_m = re.search(r'aria-label="([0-9,]+) users starred', article)
        stars = stars_m.group(1).replace(",", "") if stars_m else "0"

        # Language
        lang_m = re.search(r'itemprop="programmingLanguage"[^>]*>\s*([^<]+)', article)
        language = lang_m.group(1).strip() if lang_m else ""

        # Stars today
        today_m = re.search(r'([\d,]+)\s+stars today', article)
        stars_today = today_m.group(1).replace(",", "") if today_m else "0"

        # Relevance flag
        text_lower = (name + " " + desc).lower()
        relevant = any(kw in text_lower for kw in INTEREST_KEYWORDS)

        repos.append({
            "name": name,
            "url": f"https://github.com/{name}",
            "description": desc[:120],
            "language": language,
            "stars": int(stars) if stars.isdigit() else 0,
            "stars_today": int(stars_today) if stars_today.isdigit() else 0,
            "relevant": relevant,
        })

    return repos

def main():
    args = sys.argv[1:]
    force = "--force" in args
    lang = next((a for a in args if not a.startswith("--")), "")

    if not force:
        cached = load_cache()
        if cached:
            print(json.dumps(cached["repos"], ensure_ascii=False))
            return

    repos = fetch_trending(lang)
    if repos:
        save_cache({
            "fetched_at": time.time(),
            "date": time.strftime("%Y-%m-%d"),
            "lang": lang,
            "repos": repos,
        })
    print(json.dumps(repos, ensure_ascii=False))

if __name__ == "__main__":
    main()
