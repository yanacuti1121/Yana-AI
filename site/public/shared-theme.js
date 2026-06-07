// YAMTAM shared theme — dark/light mode across all pages
(function () {
  const KEY = 'theme';
  const html = document.documentElement;

  // Init: localStorage → system preference fallback
  function initTheme() {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      html.classList.toggle('dark', saved === 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.classList.add('dark');
    }
    syncButtons();
  }

  function syncButtons() {
    const dark = html.classList.contains('dark');
    document.querySelectorAll('[data-theme-toggle],[id="theme-toggle"]').forEach(btn => {
      btn.textContent = dark ? '☀️' : '🌙';
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    });
  }

  window.toggleTheme = function () {
    html.classList.add('theme-trans');
    const dark = html.classList.toggle('dark');
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
    syncButtons();
    setTimeout(() => html.classList.remove('theme-trans'), 350);
  };

  // Sync system preference changes (only if no saved preference)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(KEY)) {
      html.classList.toggle('dark', e.matches);
      syncButtons();
    }
  });

  // Run immediately (before DOMContentLoaded to avoid flash)
  initTheme();
  document.addEventListener('DOMContentLoaded', syncButtons);
})();
