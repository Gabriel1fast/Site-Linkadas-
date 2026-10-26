/* 5ª dobra: duas etapas presas na tela, guiadas pela rolagem (e reversíveis ao subir).
   1) Manifesto: o texto acende palavra a palavra.
   2) Especialidades: os quadros entram um a um da direita para a esquerda; depois, o CTA. */
(function () {
  const section = document.querySelector('[data-manifesto]');
  const intro = section?.querySelector('[data-manifesto-intro]');
  const text = section?.querySelector('[data-manifesto-text]');
  const specialties = section?.querySelector('[data-specialties]');
  if (!section || !intro || !text || !specialties) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Envolve cada palavra num <span>, preservando os trechos de ênfase (<em>)
  let index = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const span = document.createElement('span');
          span.className = 'manifesto__word';
          span.style.setProperty('--i', index++);
          span.textContent = part;
          frag.append(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        wrap(child);
      }
    });
  };
  wrap(text);
  // Margem no fim: a última palavra acende antes de a etapa soltar
  text.style.setProperty('--n', index + 2);
  section.classList.add('is-scrubbing');

  // Progresso 0→1 enquanto a etapa está presa na tela
  const progress = (el) => {
    const scrollable = el.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, -el.getBoundingClientRect().top / scrollable));
  };

  let frame = 0;
  function update() {
    frame = 0;
    section.style.setProperty('--p', progress(intro).toFixed(4));
    specialties.style.setProperty('--s', progress(specialties).toFixed(4));
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
})();
