(function () {
  const STORAGE_KEY = 'vq_theme';

  function readTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function updateButton(theme) {
    const button = document.querySelector('.vq-theme-toggle');
    if (!button) return;
    const isLight = theme === 'light';
    button.setAttribute('aria-pressed', String(isLight));
    button.setAttribute('aria-label', isLight ? '当前为白天模式，切换到黑夜模式' : '当前为黑夜模式，切换到白天模式');
    button.title = isLight ? '切换到黑夜模式' : '切换到白天模式';
    button.querySelector('.vq-theme-toggle-icon').textContent = isLight ? '☀️' : '🌙';
    button.querySelector('.vq-theme-toggle-label').textContent = isLight ? '白天模式' : '黑夜模式';
  }

  function applyTheme(theme, persist) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch (_) {
        // The visual preference still works for the current page.
      }
    }
    updateButton(nextTheme);
    window.dispatchEvent(new CustomEvent('vqthemechange', { detail: { theme: nextTheme } }));
  }

  function mountToggle() {
    if (document.querySelector('.vq-theme-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vq-theme-toggle';
    button.innerHTML = '<span class="vq-theme-toggle-icon" aria-hidden="true"></span><span class="vq-theme-toggle-label"></span>';
    button.addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
    });
    document.body.appendChild(button);
    updateButton(document.documentElement.dataset.theme || 'dark');
  }

  applyTheme(readTheme(), false);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
  } else {
    mountToggle();
  }

  window.VQTheme = {
    get: function () { return document.documentElement.dataset.theme || 'dark'; },
    set: function (theme) { applyTheme(theme, true); }
  };
})();
