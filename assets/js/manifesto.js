/* Manifesto: a seção prende na tela e o texto acende palavra a palavra conforme a rolagem
   (rolando para cima, as palavras voltam a apagar). */
(function () {
  const section = document.querySelector('[data-manifesto]');
  const text = section?.querySelector('[data-manifesto-text]');
  if (!section || !text) return;
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
  // Margem no fim: a última palavra acende antes de a seção soltar
  text.style.setProperty('--n', index + 2);
  section.classList.add('is-scrubbing');

  let frame = 0;
  function update() {
    frame = 0;
    const rect = section.getBoundingClientRect();
    const scrollable = section.offsetHeight - window.innerHeight;
    const p = Math.min(1, Math.max(0, -rect.top / scrollable));
    section.style.setProperty('--p', p.toFixed(4));
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
})();
