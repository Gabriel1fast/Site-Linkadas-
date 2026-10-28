/* 6ª dobra — cartões de solução que entram um de cada vez conforme a rolagem.
   O fundo (lâminas de luz) é um vídeo em loop controlado por bg-video.js. */

const section = document.querySelector('[data-approach]');
const solutions = section?.querySelector('[data-solutions]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function init() {
  if (!section || !solutions || reducedMotion.matches) return; // sem animação: cartões visíveis

  // Progresso dos cartões: vai de 0 (lista entrando) a 1 (lista perto do centro da tela)
  let progress = '';
  let pending = 0;
  function measure() {
    pending = 0;
    const vh = window.innerHeight;
    const l = solutions.getBoundingClientRect();
    // Só os cartões dependem do valor (e só é escrito quando muda): o resto da seção não recalcula estilo
    const next = Math.min(1, Math.max(0, (vh * 0.95 - l.top) / (l.height + vh * 0.12))).toFixed(3);
    if (next !== progress) solutions.style.setProperty('--c-progress', (progress = next));
  }
  // Uma medição por quadro, no máximo, durante a rolagem
  const schedule = () => { if (!pending) pending = requestAnimationFrame(measure); };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  measure();
}

init();
