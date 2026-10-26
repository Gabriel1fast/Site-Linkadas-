/* Clientes: quando a faixa encosta na base da tela, ela e a Hero ficam presas juntas e a rolagem
   vertical conduz as logos da direita para a esquerda. Só depois que a última logo sai pela
   esquerda a página segue para os Cases (que entram colados à faixa); rolando para cima, o
   percurso se desfaz. No centro: 100% de opacidade e tamanho cheio; nas laterais: pequenas e
   transparentes. */
(function () {
  const section = document.querySelector('[data-clients]');
  const stack = document.querySelector('[data-fold-stack]');
  const pin = section?.querySelector('.clients__pin');
  const track = section?.querySelector('[data-clients-track]');
  const hero = stack?.querySelector('.hero');
  if (!section || !stack || !pin || !track || !hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return; // mantém a versão estática

  const items = Array.from(track.querySelectorAll('[data-client]'));
  const MIN_SCALE = 0.4;
  const SCROLL_PER_PX = 0.75; // px de rolagem por px de deslocamento horizontal

  let viewportW = 0;
  let viewportH = 0;
  let bandH = 0;
  let distance = 0;
  let centers = [];
  let frame = 0;

  section.classList.remove('is-static');
  stack.classList.add('is-pinned');

  function measure() {
    viewportW = document.documentElement.clientWidth;
    viewportH = window.innerHeight;
    track.style.transform = 'none';
    bandH = pin.offsetHeight;
    centers = items.map((item) => item.offsetLeft + item.offsetWidth / 2);
    // Percurso: a faixa entra inteira pela direita e sai inteira pela esquerda
    distance = viewportW + track.scrollWidth;

    // Faixa presa na base da tela; Hero presa logo acima, com a base visível e colada à faixa
    pin.style.top = `${viewportH - bandH}px`;
    stack.style.setProperty('--hero-stick', `${viewportH - bandH - hero.offsetHeight}px`);
    section.style.height = `${Math.round(bandH + distance * SCROLL_PER_PX)}px`;
    update();
  }

  function update() {
    frame = 0;
    const scrollable = section.offsetHeight - bandH;
    // 0 quando a faixa encosta na base da tela; 1 quando o fim da seção chega à base
    const passed = viewportH - bandH - section.getBoundingClientRect().top;
    const progress = Math.min(1, Math.max(0, passed / scrollable));
    const x = viewportW - progress * distance;
    track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;

    const half = viewportW / 2;
    items.forEach((item, i) => {
      const d = Math.min(1, Math.abs(x + centers[i] - half) / half);
      const t = 1 - d;
      const eased = t * t * (3 - 2 * t);
      item.style.opacity = eased.toFixed(3);
      item.style.transform = `scale(${(MIN_SCALE + (1 - MIN_SCALE) * eased).toFixed(3)})`;
    });
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

  // Só trabalha enquanto a seção está perto da tela
  let active = false;
  new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    if (active) schedule();
  }, { rootMargin: '200px 0px' }).observe(section);

  window.addEventListener('scroll', () => { if (active) schedule(); }, { passive: true });
  // No celular a barra do navegador altera só a altura: não recalcula para a página não "pular"
  window.addEventListener('resize', () => {
    if (document.documentElement.clientWidth !== viewportW) measure();
  });
  // Remede quando as imagens carregarem (larguras reais) e quando a Hero mudar de altura
  items.forEach((item) => {
    const img = item.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', measure, { once: true });
  });
  new ResizeObserver(() => measure()).observe(hero);
  measure();
})();
