(() => {
  'use strict';
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('#mobile-menu');
  const close = document.querySelector('.menu-close');
  const mobile = window.matchMedia('(max-width: 600px)');

  function closeMenu(restoreFocus = true) {
    if (!menu.open) return;
    menu.close();
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    if (restoreFocus) toggle.focus();
  }

  if (toggle && menu && typeof menu.showModal === 'function') {
    toggle.closest('.site-header').classList.add('enhanced-nav');
    toggle.addEventListener('click', () => {
      menu.showModal();
      document.body.classList.add('menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation');
      close.focus();
    });
    close.addEventListener('click', () => closeMenu());
    menu.addEventListener('cancel', (event) => { event.preventDefault(); closeMenu(); });
    menu.addEventListener('click', (event) => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      const target = document.querySelector(anchor.getAttribute('href'));
      closeMenu(false);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
    });
    mobile.addEventListener('change', (event) => { if (!event.matches) closeMenu(false); });
  }

  const mint = document.querySelector('#mint-address');
  const button = document.querySelector('#copy-mint');
  const status = document.querySelector('#copy-status');
  if (!mint || !button || !status) return;

  // The static links are rendered from site.config.json by build-site.mjs.
  // Clipboard behavior reads that same rendered value, preserving exact casing.
  button.hidden = false;
  let reset;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(mint.value);
      button.textContent = 'COPIED ↗';
      status.textContent = 'Exact mint address copied.';
      reset = setTimeout(() => { button.textContent = 'COPY ↗'; }, 2400);
    } catch {
      button.textContent = 'TRY AGAIN ↗';
      status.textContent = 'Copy unavailable. The address is selected—copy it manually.';
      mint.focus();
      mint.select();
    } finally {
      button.disabled = false;
    }
  });
})();
