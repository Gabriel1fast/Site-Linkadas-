/* Fundos em vídeo: Hero (fitas de vidro), 6ª dobra (lâminas de luz) e 7ª dobra (portal).
   Os vídeos são loops gerados a partir das cenas 3D originais (tools/bg-video), com superamostragem:
   bordas lisas e movimento fluido em qualquer aparelho, sem o custo de renderizar 3D no navegador.
   - versão vertical (1080×1920) para celulares e horizontal (1920×1080) para telas largas, em MP4 H.264
     (decodificado por hardware em todos os aparelhos; o VP9 borrava os degradês escuros);
   - a Hero carrega de imediato; as outras só quando a seção se aproxima; cada vídeo só reproduz enquanto visível;
   - rolagem e cursor movem o vídeo apenas com transform, que a GPU compõe sem recalcular a página.
   Com "reduzir movimento" ativado no sistema, os vídeos (lentos e contínuos) seguem tocando, mas sem
   zoom/paralaxe de rolagem e cursor. */
import { whenNear } from './lib/perf.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const variant = () => (window.innerWidth / window.innerHeight < 1 ? 'mobile' : 'desktop');

/* Efeito de cada fundo. p: progresso da seção na tela (0 → 1); m: cursor suavizado (-1 → 1). */
const EFFECTS = {
  // Fitas: acompanham o cursor de leve, como a cena 3D fazia
  hero: {
    eager: true,
    pointer: true,
    transform: (p, m) => `translate3d(${(m.x * -1.2).toFixed(3)}%, ${(m.y * -0.8).toFixed(3)}%, 0) scale(1.04)`,
  },
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
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
let frame = 0;
let last = 0;

function update(now) {
  frame = 0;
  const vh = window.innerHeight;
  // Cursor suavizado (independente da taxa de quadros); continua animando até alcançar o alvo
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  const k = 1 - Math.exp(-dt * 3);
  mouse.x += (mouse.tx - mouse.x) * k;
  mouse.y += (mouse.ty - mouse.y) * k;
  const settling = Math.abs(mouse.tx - mouse.x) + Math.abs(mouse.ty - mouse.y) > 0.002;

  active.forEach((item) => {
    const p = item.effect.progress ? Math.min(1, Math.max(0, item.effect.progress(item.section.getBoundingClientRect(), vh))) : 0;
    const key = `${p.toFixed(4)}|${item.effect.pointer ? `${mouse.x.toFixed(3)},${mouse.y.toFixed(3)}` : ''}`;
    if (key === item.key) return;
    item.key = key;
    item.video.style.transform = item.effect.transform(p, mouse);
  });
  if (settling) schedule();
  else last = 0;
}
function schedule() { if (!frame && !reducedMotion) frame = requestAnimationFrame(update); }

function setup(video) {
  const section = video.closest('section');
  const effect = EFFECTS[video.dataset.bgVideo];
  if (!section || !effect) return;
  const base = video.dataset.src;
  const item = { video, section, effect, key: '', variant: '' };

  const load = () => {
    const v = variant();
    if (v === item.variant) return;
    item.variant = v;
    video.poster = `${base}-${v}.webp`;
    video.src = `${base}-${v}.mp4`;
    video.load();
    if (active.has(item)) video.play().catch(() => {});
  };

  // O primeiro quadro (igual ao pôster) já pode aparecer
  video.addEventListener('loadeddata', () => video.parentElement.classList.add('is-ready'), { once: true });

  // Hero: de imediato. Demais: com antecedência (uma tela e meia antes)
  if (effect.eager) load();
  else whenNear(section, load, '150%');

  // Reproduz só enquanto visível
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      active.add(item);
      schedule();
      if (item.variant) video.play().catch(() => {});
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
    resizeTimer = setTimeout(() => { if (item.variant) load(); }, 300);
  });
}

document.querySelectorAll('video[data-bg-video]').forEach(setup);
window.addEventListener('scroll', schedule, { passive: true });
if (finePointer) {
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    schedule();
  }, { passive: true });
}
