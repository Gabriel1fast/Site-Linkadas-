/* Interações globais: abertura no topo, links internos, entrada da página e estado da navbar */
(function () {
  const root = document.documentElement;

  // A página sempre abre na primeira dobra: o navegador não restaura a última posição de rolagem
  // e um "#secao" que tenha ficado no endereço (de um clique anterior) é descartado.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  // Durante a abertura a rolagem suave fica desligada, para nada "deslizar" até uma âncora
  root.style.scrollBehavior = 'auto';
  const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  toTop();
  // As seções presas (logos, manifesto) ajustam a altura depois que imagens e fontes carregam;
  // reafirma o topo no fim do carregamento, a menos que a pessoa já tenha começado a rolar.
  let userScrolled = false;
  ['wheel', 'touchstart', 'keydown'].forEach((type) => window.addEventListener(type, () => { userScrolled = true; }, { once: true, passive: true }));
  window.addEventListener('load', () => {
    if (!userScrolled) toTop();
    requestAnimationFrame(() => {
      if (!userScrolled) toTop();
      root.style.scrollBehavior = '';
    });
  }, { once: true });
  window.addEventListener('pageshow', (e) => { if (e.persisted) toTop(); });

  // Links internos (#diagnostico, #solucoes...): rolagem suave até a seção, sem alterar o endereço
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    event.preventDefault();
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  requestAnimationFrame(() => root.classList.add('is-loaded'));

  const navbar = document.querySelector('[data-navbar]');
  if (navbar) {
    const update = () => navbar.classList.toggle('is-scrolled', window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }
})();
