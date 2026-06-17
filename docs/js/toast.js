/* LAC Toast Notification System */

(function () {
  let container = null;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = {
    success: '✓',
    error:   '✕',
    warning: '⚠',
    info:    'ℹ',
  };

  window.showToast = function (message, type = 'info', duration = 4000, title = '') {
    const c = getContainer();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    const resolvedTitle = title || ({ success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' }[type] || 'Info');

    el.innerHTML = `
      <div class="toast-icon">${ICONS[type] || 'ℹ'}</div>
      <div class="toast-body">
        <div class="toast-title">${resolvedTitle}</div>
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    const close = el.querySelector('.toast-close');
    function dismiss() {
      el.classList.add('toast-out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
    close.addEventListener('click', dismiss);

    c.appendChild(el);
    if (duration > 0) setTimeout(dismiss, duration);
    return el;
  };
})();
