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
