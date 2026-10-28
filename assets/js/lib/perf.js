/* Desempenho — perfil do aparelho, inicialização preguiçosa e resolução adaptativa
   compartilhados por todas as cenas WebGL do site. */

const nav = navigator;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const small = Math.min(window.screen.width, window.screen.height) < 820;
const lowMemory = (nav.deviceMemory || 8) <= 4;
const fewCores = (nav.hardwareConcurrency || 8) <= 4;

/* 'low'  → celulares e aparelhos modestos: resolução ~1x, sem multisampling, 30 fps
   'high' → computadores: até 1.5x, multisampling 4x, 60 fps */
export const tier = coarse || small || lowMemory || fewCores ? 'low' : 'high';

export const QUALITY = tier === 'high'
  ? { maxDpr: 1.5, msaa: 4, bloomRes: 384, fps: 60 }
  : { maxDpr: 1, msaa: 0, bloomRes: 192, fps: 30 };

export const deviceDpr = () => Math.min(window.devicePixelRatio || 1, QUALITY.maxDpr);

/* Executa `init` só quando o elemento chega perto da tela (uma única vez) */
export function whenNear(el, init, margin = '600px') {
  if (!('IntersectionObserver' in window)) { init(); return; }
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    init();
  }, { rootMargin: `${margin} 0px` });
  io.observe(el);
}

/* Laço de animação com limite de fps e resolução adaptativa:
   se os quadros ficarem lentos, reduz a escala de pixels (até 50%); se sobrar folga, recupera. */
export function createLoop({ el, frame, onScale, fps = QUALITY.fps, minScale = 0.5 }) {
  let running = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let slow = 0;
  let fast = 0;
  let scale = 1;
  const interval = 1000 / fps;

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const elapsed = now - last;
    if (elapsed < interval - 2) return;
    last = now;
    const dt = Math.min(elapsed / 1000, 0.1);
    const t0 = performance.now();
    frame(dt);
    acc = performance.now() - t0;

    // Governador: quadro acima do orçamento por vários ciclos → reduz; muito abaixo → recupera
    const budget = interval * 0.85;
    if (elapsed > interval * 1.6 || acc > budget) { slow++; fast = 0; } else if (elapsed < interval * 1.15) { fast++; slow = 0; }
    if (slow > 12 && scale > minScale) { scale = Math.max(minScale, scale - 0.15); slow = 0; onScale?.(scale); }
    if (fast > 240 && scale < 1) { scale = Math.min(1, scale + 0.1); fast = 0; onScale?.(scale); }
  }

  const start = () => {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop())).observe(el);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  return { start, stop, get scale() { return scale; } };
}

/* Executa `fn` quando o navegador estiver ocioso (entre quadros, sem disputar com a rolagem) */
export const idle = (fn, timeout = 1500) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 200));

/* Prepara a cena com bastante antecedência (a uma tela e meia de distância), em momento ocioso:
   o custo de criação não cai no instante em que a seção entra na tela. */
export function whenApproaching(el, init, margin = '150%') {
  whenNear(el, () => idle(init), margin);
}

/* Compila um programa WebGL sem travar a página: com KHR_parallel_shader_compile o driver compila
   em segundo plano e a promessa resolve quando estiver pronto (sem a extensão, resolve no quadro seguinte). */
export function compileProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  return new Promise((resolve, reject) => {
    const check = () => {
      if (ext && !gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) { requestAnimationFrame(check); return; }
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) { resolve(program); return; }
      reject(new Error(shaders.map((s) => gl.getShaderInfoLog(s)).join('\n') || gl.getProgramInfoLog(program)));
    };
    requestAnimationFrame(check);
  });
}
