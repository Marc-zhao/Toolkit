(function () {
  const THEME_STORAGE_KEY = 'vq_theme';
  const FONT_STORAGE_KEY = 'vq_font_size';
  const FONT_MODES = ['standard', 'comfortable', 'large'];

  function readTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
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
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
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

  function readFontMode() {
    try {
      const value = localStorage.getItem(FONT_STORAGE_KEY);
      return FONT_MODES.includes(value) ? value : 'comfortable';
    } catch (_) {
      return 'comfortable';
    }
  }

  function updateFontButton(mode) {
    const button = document.querySelector('.vq-font-toggle');
    if (!button) return;
    const labels = {
      standard: ['标准字号', 'A'],
      comfortable: ['舒适字号', 'A+'],
      large: ['大字号', 'A++'],
    };
    const [label, icon] = labels[mode] || labels.comfortable;
    button.setAttribute('aria-label', `当前${label}，点击切换`);
    button.title = `当前${label}，点击切换`;
    button.querySelector('.vq-font-toggle-icon').textContent = icon;
    button.querySelector('.vq-font-toggle-label').textContent = label;
  }

  function applyFontMode(mode, persist) {
    const nextMode = FONT_MODES.includes(mode) ? mode : 'comfortable';
    document.documentElement.dataset.fontSize = nextMode;
    if (persist) {
      try {
        localStorage.setItem(FONT_STORAGE_KEY, nextMode);
      } catch (_) {
        // The visual preference still works for the current page.
      }
    }
    updateFontButton(nextMode);
    window.dispatchEvent(new CustomEvent('vqfontsizechange', { detail: { mode: nextMode } }));
  }

  function hasDirectText(element) {
    if (element.matches('input, textarea, select, button')) return true;
    return Array.from(element.childNodes).some(node =>
      node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
  }

  function classifyFont(element) {
    if (!(element instanceof HTMLElement) || element.closest('[data-vq-font-control]') || !hasDirectText(element)) return;
    if (Array.from(element.classList).some(name => name.startsWith('vq-font-tier-'))) return;
    const size = Number.parseFloat(getComputedStyle(element).fontSize);
    if (!Number.isFinite(size) || size > 14.5) return;
    const tier = size <= 8.5 ? 1 : (size <= 10.5 ? 2 : (size <= 12.5 ? 3 : 4));
    element.classList.add(`vq-font-tier-${tier}`);
  }

  function scanFonts(root) {
    if (root instanceof HTMLElement) classifyFont(root);
    if (root.querySelectorAll) root.querySelectorAll('*').forEach(classifyFont);
  }

  function watchReadableFonts() {
    scanFonts(document.body);
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'characterData') {
          classifyFont(record.target.parentElement);
          return;
        }
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) scanFonts(node);
          if (node.nodeType === Node.TEXT_NODE) classifyFont(node.parentElement);
        });
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  function mountFontToggle() {
    if (document.querySelector('.vq-font-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vq-font-toggle';
    button.dataset.vqFontControl = 'true';
    button.innerHTML = '<span class="vq-font-toggle-icon" aria-hidden="true"></span><span class="vq-font-toggle-label"></span>';
    button.addEventListener('click', function () {
      const current = document.documentElement.dataset.fontSize || 'comfortable';
      const next = FONT_MODES[(FONT_MODES.indexOf(current) + 1) % FONT_MODES.length];
      applyFontMode(next, true);
    });
    document.body.appendChild(button);
    updateFontButton(document.documentElement.dataset.fontSize || 'comfortable');
  }

  applyTheme(readTheme(), false);
  applyFontMode(readFontMode(), false);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mountToggle();
      mountFontToggle();
      watchReadableFonts();
    }, { once: true });
  } else {
    mountToggle();
    mountFontToggle();
    watchReadableFonts();
  }

  window.VQTheme = {
    get: function () { return document.documentElement.dataset.theme || 'dark'; },
    set: function (theme) { applyTheme(theme, true); }
  };
  window.VQFontSize = {
    get: function () { return document.documentElement.dataset.fontSize || 'comfortable'; },
    set: function (mode) { applyFontMode(mode, true); }
  };
})();
