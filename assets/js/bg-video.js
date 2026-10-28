/* Fundos em vídeo das duas últimas dobras (6ª: lâminas de luz; 7ª: portal).
   Os vídeos são loops curtos gerados a partir das cenas 3D originais (tools/bg-video). Mais leve que WebGL:
   - o vídeo só é baixado quando a seção se aproxima e só reproduz enquanto está na tela;
   - versão vertical (1080×1920) para celulares e horizontal (1920×1080) para telas largas, em MP4 H.264
     (decodificado por hardware em todos os aparelhos; o VP9 borrava os degradês escuros);
   - a rolagem move o vídeo apenas com transform (zoom/paralaxe), que a GPU compõe sem recalcular a página. */
import { whenNear } from './lib/perf.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const variant = () => (window.innerWidth / window.innerHeight < 1 ? 'mobile' : 'desktop');

/* Efeito de rolagem de cada fundo. p: progresso da seção na tela (0 → 1). */
const EFFECTS = {
  // Lâminas de luz: deslizam e giram de leve, como a cena original fazia com a rolagem
  approach: {
    progress: (r, vh) => (vh - r.top) / (vh + r.height),
    transform: (p) => `translate3d(0, ${((0.5 - p) * 5).toFixed(3)}%, 0) scale(${(1.1 + p * 0.06).toFixed(4)}) rotate(${((0.5 - p) * 1.6).toFixed(3)}deg)`,
  },
  // Portal: a câmera "avança" em direção a ele conforme a seção entra
  finale: {
    progress: (r, vh) => (vh - r.top) / vh,
    transform: (p) => `scale(${(1 + p * 0.14).toFixed(4)})`,
  },
};

const active = new Set();
let frame = 0;

function update() {
  frame = 0;
  const vh = window.innerHeight;
  active.forEach((item) => {
    const p = Math.min(1, Math.max(0, item.effect.progress(item.section.getBoundingClientRect(), vh)));
    if (Math.abs(p - item.p) < 0.0005) return;
    item.p = p;
    item.video.style.transform = item.effect.transform(p);
  });
}
const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

function setup(video) {
  const section = video.closest('section');
  const effect = EFFECTS[video.dataset.bgVideo];
  if (!section || !effect) return;
  const base = video.dataset.src;
  const item = { video, section, effect, p: -1, variant: '' };

  const load = () => {
    const v = variant();
    if (v === item.variant) return;
    item.variant = v;
    video.poster = `${base}-${v}.webp`;
    if (reducedMotion) return; // só a imagem estática
    video.src = `${base}-${v}.mp4`;
    video.load();
  };

  video.addEventListener('playing', () => video.parentElement.classList.add('is-ready'), { once: true });
  // Sem vídeo (movimento reduzido) a imagem estática entra no lugar
  if (reducedMotion) video.parentElement.classList.add('is-ready');

  // Baixa com antecedência (uma tela e meia antes) e reproduz só enquanto visível
  whenNear(section, load, '150%');
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      active.add(item);
      schedule();
      if (!reducedMotion) video.play().catch(() => {});
    } else {
      active.delete(item);
      video.pause();
    }
  }).observe(section);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    schedule();
    clearTimeout(resizeTimer);
    // Girou o aparelho: troca para a versão (vertical/horizontal) adequada, se o vídeo já foi carregado
    resizeTimer = setTimeout(() => { if (item.variant) { load(); if (active.has(item)) video.play().catch(() => {}); } }, 300);
  });
}

document.querySelectorAll('video[data-bg-video]').forEach(setup);
window.addEventListener('scroll', schedule, { passive: true });
