(() => {
  'use strict';
  const vi = document.documentElement.lang.startsWith('vi');
  const t = vi ? {
    loading: 'Đang kiểm tra…', unavailable: 'Tạm không đọc được nguồn', empty: 'Chưa có Release công khai',
    feedEmpty: 'Chưa có bản phát hành công khai.', feedUnavailable: 'Tạm không tải được nguồn phát hành. Anh có thể xem trực tiếp tại GitHub.',
    postsEmpty: 'Chưa có thông báo riêng.', postsUnavailable: 'Tạm không tải được thông báo.',
    checked: 'Đã kiểm tra', published: 'Công bố', partial: 'Một số nguồn tạm không phản hồi; các nguồn còn lại đã cập nhật.',
    ready: 'Đã cập nhật thông tin từ các nguồn phát hành.', failed: 'Không đọc được nguồn phát hành lúc này. Anh có thể mở GitHub trực tiếp.',
    pre: 'Bản thử nghiệm'
  } : {
    loading: 'Checking…', unavailable: 'Source temporarily unavailable', empty: 'No public Release yet',
    feedEmpty: 'No public release yet.', feedUnavailable: 'The release sources are temporarily unavailable. You can check GitHub directly.',
    postsEmpty: 'No additional announcements yet.', postsUnavailable: 'Announcements are temporarily unavailable.',
    checked: 'Checked', published: 'Published', partial: 'Some sources did not respond; the others are up to date.',
    ready: 'Release sources are up to date.', failed: 'Release sources are unavailable right now. You can open GitHub directly.',
    pre: 'Pre-release'
  };
  const projects = [
    { id: 'core', name: 'Yana AI', repo: 'Yana-AI' },
    { id: 'wheelbot', name: 'Yana Wheelbot', repo: 'yana-wheelbot' },
    { id: 'terminal', name: 'Yana AI Chat Terminal', repo: 'Yana-AI-Chat_Teminal' }
  ];
  const status = document.querySelector('[data-updates-status]');
  const refresh = document.querySelector('[data-updates-refresh]');
  const feed = document.querySelector('[data-updates-feed]');
  const posts = document.querySelector('[data-updates-posts]');
  if (!status || !refresh || !feed || !posts) return;
  let releaseResults = [];
  let announcements = [];

  const textNode = (tag, value, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = value;
    return node;
  };
  const dateText = value => {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    return new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  };
  const safeReleaseUrl = (release, project) => {
    const fallback = `https://github.com/yanacuti1121/${project.repo}/releases`;
    try {
      const url = new URL(release.html_url);
      if (url.protocol === 'https:' && url.hostname === 'github.com' &&
          url.pathname.toLowerCase().startsWith(`/yanacuti1121/${project.repo.toLowerCase()}/releases/`)) return url.href;
    } catch (_) { /* malformed remote URL: use the repository Releases page */ }
    return fallback;
  };
  const releaseCategory = (project, release) => {
    if (project.id !== 'core') return project.name;
    const tag = String(release.tag_name || '').toLowerCase();
    if (tag.startsWith('studio-')) return 'Yana Studio';
    if (tag.startsWith('rt-')) return 'Yana Runtime';
    if (tag.startsWith('py-')) return 'Yana Python';
    return project.name;
  };
  async function getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-cache', headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function getAllReleases(project) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const batch = await getJson(`https://api.github.com/repos/yanacuti1121/${project.repo}/releases?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Invalid release format');
      all.push(...batch.filter(item => item && !item.draft && item.published_at));
      if (batch.length < 100) return all;
    }
  }
  function renderCard(project, result) {
    const card = document.querySelector(`[data-update-card="${project.id}"]`);
    const value = card.querySelector('[data-update-value]');
    const date = card.querySelector('[data-update-date]');
    const link = card.querySelector('[data-update-link]');
    card.classList.toggle('is-unavailable', !result.ok);
    if (!result.ok) { value.textContent = t.unavailable; date.textContent = ''; return; }
    const latest = result.releases[0];
    if (!latest) { value.textContent = t.empty; date.textContent = ''; return; }
    value.textContent = latest.name || latest.tag_name || t.empty;
    date.textContent = [latest.tag_name, dateText(latest.published_at || latest.created_at)].filter(Boolean).join(' · ');
    link.href = safeReleaseUrl(latest, project);
  }
  function renderFeed(results) {
    const items = results.flatMap(({ project, ok, releases }) => ok ? releases.map(release => ({ project, release })) : []);
    items.push(...announcements.map(post => ({ post })));
    items.sort((a, b) => Date.parse(b.post?.date || b.release?.published_at || b.release?.created_at || 0) - Date.parse(a.post?.date || a.release?.published_at || a.release?.created_at || 0));
    feed.replaceChildren();
    if (!items.length) {
      feed.append(textNode('li', results.some(r => r.ok) ? t.feedEmpty : t.feedUnavailable, 'updates-feed-empty'));
      return;
    }
    for (const { project, release, post } of items) {
      const item = document.createElement('li');
      if (post) {
        item.append(textNode('p', `${vi ? 'Yana · Thông báo' : 'Yana · Announcement'} · ${dateText(post.date)}`, 'updates-feed-meta'));
        const a = textNode('a', vi ? post.titleVi : post.titleEn);
        a.href = '#updates-posts';
        item.append(a);
        feed.append(item);
        continue;
      }
      const meta = textNode('p', `${releaseCategory(project, release)} · ${dateText(release.published_at || release.created_at)}${release.prerelease ? ` · ${t.pre}` : ''}`, 'updates-feed-meta');
      const a = document.createElement('a');
      a.href = safeReleaseUrl(release, project);
      a.textContent = release.name || release.tag_name || project.name;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      item.append(meta, a);
      if (release.tag_name && release.tag_name !== release.name) item.append(textNode('span', release.tag_name, 'updates-feed-tag'));
      feed.append(item);
    }
  }
  function renderPosts(data) {
    posts.replaceChildren();
    if (!Array.isArray(data)) throw new Error('Invalid announcement format');
    const visible = data.filter(item => item && item.published === true && typeof item.date === 'string' && typeof item.titleVi === 'string' && typeof item.titleEn === 'string')
      .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
    announcements = visible;
    renderFeed(releaseResults);
    if (!visible.length) { posts.append(textNode('p', t.postsEmpty, 'updates-post-empty')); return; }
    for (const item of visible) {
      const article = document.createElement('article');
      article.className = 'updates-post';
      article.append(textNode('p', dateText(item.date), 'updates-post-date'));
      article.append(textNode('h3', vi ? item.titleVi : item.titleEn));
      article.append(textNode('p', vi ? (item.bodyVi || '') : (item.bodyEn || ''), 'updates-post-body'));
      if (typeof item.url === 'string') {
        try {
          const u = new URL(item.url);
          if (u.protocol === 'https:') {
            const a = textNode('a', vi ? 'Đọc thêm ↗' : 'Read more ↗');
            a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; article.append(a);
          }
        } catch (_) { /* optional link is malformed */ }
      }
      posts.append(article);
    }
  }
  let active = false;
  async function load() {
    if (active) return;
    active = true; refresh.disabled = true; status.textContent = t.loading;
    const announcementRequest = getJson('updates-announcements.json').then(data => ({ ok: true, data }), () => ({ ok: false }));
    const results = await Promise.all(projects.map(async project => {
      try {
        const releases = await getAllReleases(project);
        return { project, ok: true, releases };
      } catch (_) { return { project, ok: false, releases: [] }; }
    }));
    releaseResults = results;
    results.forEach(result => renderCard(result.project, result));
    try {
      const announcementResult = await announcementRequest;
      if (!announcementResult.ok) throw new Error('Announcements unavailable');
      renderPosts(announcementResult.data);
    }
    catch (_) {
      announcements = [];
      posts.replaceChildren(textNode('p', t.postsUnavailable, 'updates-post-empty'));
      renderFeed(results);
    }
    const success = results.filter(result => result.ok).length;
    status.textContent = `${success === 3 ? t.ready : success ? t.partial : t.failed} ${t.checked} ${new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date())}.`;
    refresh.disabled = false; active = false;
  }
  refresh.addEventListener('click', load);
  load();
})();
