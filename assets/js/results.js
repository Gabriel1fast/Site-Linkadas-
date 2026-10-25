/* Resultados: revelação ao rolar, abas de cases e paralaxe da composição */
(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Revelação ao rolar
  const revealItems = document.querySelectorAll('.reveal-scroll');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-in'));
  }

  const root = document.querySelector('[data-cases]');
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('[data-case-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-case-panel]'));
  let active = 0;

  // Abas: o avanço automático acompanha o fim da barra de progresso (CSS)
  function select(index, { focus = false } = {}) {
    active = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => {
      const on = i === active;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel, i) => {
      const on = i === active;
      panel.classList.toggle('is-active', on);
      panel.inert = !on;
    });
    if (focus) tabs[active].focus();
    root.dispatchEvent(new CustomEvent('cases:change', { detail: { index: active } }));
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.querySelector('.case-chip__progress')?.addEventListener('animationend', () => {
      if (i === active) select(active + 1);
    });
  });

  root.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (event.key in keys) select(active + keys[event.key], { focus: true });
    else if (event.key === 'Home') select(0, { focus: true });
    else if (event.key === 'End') select(tabs.length - 1, { focus: true });
    else return;
    event.preventDefault();
  });

  // Pausa enquanto o usuário interage ou a seção está fora da tela
  let hovering = false;
  let focused = false;
  let inView = false;
  const syncPause = () => root.classList.toggle('is-paused', hovering || focused || !inView);
  root.addEventListener('pointerenter', () => { hovering = true; syncPause(); });
  root.addEventListener('pointerleave', () => { hovering = false; syncPause(); });
  root.addEventListener('focusin', () => { focused = true; syncPause(); });
  root.addEventListener('focusout', () => { focused = false; syncPause(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncPause(); }, { threshold: 0.25 }).observe(root);
  }
  syncPause();

  // Paralaxe sutil das camadas
  if (!reducedMotion.matches && window.matchMedia('(hover: hover)').matches) {
    let frame;
    root.addEventListener('pointermove', (event) => {
      const rect = root.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--px', x.toFixed(3));
        root.style.setProperty('--py', y.toFixed(3));
      });
    });
    root.addEventListener('pointerleave', () => {
      root.style.setProperty('--px', '0');
      root.style.setProperty('--py', '0');
    });
  }
})();
