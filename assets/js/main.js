/* Interações globais: entrada da página e estado da navbar */
(function () {
  const root = document.documentElement;

  requestAnimationFrame(() => root.classList.add('is-loaded'));

  const navbar = document.querySelector('[data-navbar]');
  if (navbar) {
    const update = () => navbar.classList.toggle('is-scrolled', window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }
})();
