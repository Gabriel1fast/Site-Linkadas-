/* Resultados: revelação ao rolar e paralaxe das composições de imagens */
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

  // Imagens dos cases: baixadas e decodificadas antes de entrarem na tela (sem "pipocar" ao rolar).
  // Começam logo após o carregamento da página, em momento ocioso, ou antes se a seção se aproximar.
  const slotImages = Array.from(document.querySelectorAll('.media-slot > img'));
  const reveal = (img) => img.parentElement.classList.add('is-loaded');
  slotImages.forEach((img) => {
    if (img.complete && img.naturalWidth) reveal(img);
    else img.addEventListener('load', () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => reveal(img)), { once: true });
    img.addEventListener('error', () => reveal(img), { once: true });
  });
  let preloaded = false;
  const preload = () => {
    if (preloaded) return;
    preloaded = true;
    slotImages.forEach((img) => { img.loading = 'eager'; });
  };
  const casesSection = document.querySelector('#resultados');
  if (casesSection && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); preload(); } }, { rootMargin: '2000px 0px' });
    io.observe(casesSection);
  }
  const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 2500 }) : (fn) => setTimeout(fn, 1200);
  window.addEventListener('load', () => idle(preload), { once: true });

  // Paralaxe: --p vai de -1 (case abaixo da tela) a 1 (case acima), 0 no centro da viewport
  const cases = Array.from(document.querySelectorAll('[data-case]'));
  if (!cases.length || reducedMotion.matches) return;

  const visible = new Set();
  let frame = 0;

  function update() {
    frame = 0;
    const vh = window.innerHeight;
    visible.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const p = Math.max(-1, Math.min(1, (vh / 2 - center) / (vh / 2 + rect.height / 2)));
      el.style.setProperty('--p', p.toFixed(4));
    });
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
    schedule();
  });
  cases.forEach((el) => observer.observe(el));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
})();
