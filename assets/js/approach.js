/* 6ª dobra — fundo de lâminas de luz curvas (WebGL puro) que se movem com a rolagem,
   e cartões de solução que entram um de cada vez. Apenas cores oficiais do Design System. */

const section = document.querySelector('[data-approach]');
const canvas = section?.querySelector('[data-approach-canvas]');
const solutions = section?.querySelector('[data-solutions]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const hex = (v) => { const n = parseInt(v.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const C = { deep: hex('#18072B'), violet: hex('#8B2AC2'), magenta: hex('#C51AD8'), offwhite: hex('#F5EFE8') };

const VERTEX = 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }';

/* Duas lâminas de luz inspiradas na referência:
   1) um "canto" arredondado de luz (borda que vem da esquerda, curva e sobe);
   2) um grande arco que varre do centro para baixo e para a direita.
   Cada lâmina tem uma borda intensa, um núcleo quente (magenta → off-white) e um volume de luz
   que se dissolve para dentro. Formas e posições se deslocam com a rolagem (uP). */
const FRAGMENT = `
  precision mediump float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uP;
  uniform vec3 cDeep, cViolet, cMagenta, cOff;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  // Distância assinada a um quadrante com canto arredondado (interior: acima e à direita do canto)
  float cornerSdf(vec2 p, vec2 k, float r) {
    vec2 v = k - p;
    return length(max(v + r, 0.0)) + min(max(v.x + r, v.y + r), 0.0) - r;
  }

  vec3 glow(float d, vec3 hot, vec3 body, float spread, float strength) {
    float line = exp(-abs(d) * 110.0) + exp(-abs(d) * 26.0) * 0.45;
    float inside = d < 0.0 ? exp(d * spread) : 0.0;
    float core = d < 0.0 ? exp(d * 14.0) : 0.0;
    return (hot * (line * 0.9 + core * 0.55) + body * inside * 0.9) * strength;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = uTime;
    float s = uP;

    vec3 col = cDeep * 0.22 * smoothstep(0.0, 1.0, uv.y);

    // 1) Canto de luz superior — gira levemente e sobe com a rolagem
    vec2 k = vec2(aspect * (0.50 - 0.06 * s), 0.50 + 0.08 * s + 0.015 * sin(t * 0.2));
    vec2 q = rot(-0.18 + 0.12 * s) * (p - k) + k;
    float d1 = cornerSdf(q, k, 0.24 + 0.03 * sin(t * 0.13));
    col += glow(d1, mix(cMagenta, cOff, 0.3), mix(cDeep, cViolet, 0.75), 2.6, 0.75);

    // 2) Grande arco inferior — centro fora da tela, passa pelo ponto de encontro com a lâmina 1
    vec2 c2 = vec2(aspect * (1.32 - 0.12 * s), 1.42 + 0.10 * s + 0.02 * cos(t * 0.1));
    vec2 meet = k + vec2(0.02, -0.02);
    float r2 = length(meet - c2);
    float d2 = length(p - c2) - r2;
    float along = smoothstep(-0.1, 0.5, p.x - meet.x); // mais intenso à direita do encontro
    col += glow(d2, mix(cMagenta, cOff, 0.5), mix(cViolet, cMagenta, 0.45), 1.8, 1.0) * (0.35 + 0.65 * along);
    // Reflexo violeta frio logo abaixo da borda do arco
    col += cViolet * exp(-abs(d2 - 0.022) * 80.0) * 0.7 * along;

    // Área do texto (esquerda) mais escura, para leitura
    col *= mix(0.35, 1.0, smoothstep(0.12, 0.6, uv.x));
    // Telas estreitas: o texto ocupa toda a largura, então a luz fica mais contida
    col *= mix(0.42, 1.0, smoothstep(0.7, 1.2, aspect));
    col = 1.0 - exp(-col * 1.35);
    col += (hash(gl_FragCoord.xy + t) - 0.5) / 160.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

class LightSheets {
  constructor(canvas) {
    this.canvas = canvas;
    this.sticky = canvas.parentElement;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL indisponível');
    this.gl = gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    this.u = Object.fromEntries(['uRes', 'uTime', 'uP', 'cDeep', 'cViolet', 'cMagenta', 'cOff'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    gl.uniform3fv(this.u.cDeep, C.deep);
    gl.uniform3fv(this.u.cViolet, C.violet);
    gl.uniform3fv(this.u.cMagenta, C.magenta);
    gl.uniform3fv(this.u.cOff, C.offwhite);
    this.time = 0;
    this.p = 0;
    new ResizeObserver(() => this.resize()).observe(this.sticky);
    this.resize();
  }

  // Meia resolução: a luz é suave por natureza
  resize() {
    const { clientWidth: w, clientHeight: h } = this.sticky;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * 0.5);
    this.canvas.height = Math.round(h * 0.5);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.draw();
  }

  draw() {
    const { gl, u } = this;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uP, this.p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function init() {
  if (!section) return;

  let sheets = null;
  if (canvas) {
    try {
      sheets = new LightSheets(canvas);
      requestAnimationFrame(() => canvas.parentElement.classList.add('is-ready'));
    } catch (error) {
      console.warn('[abordagem] WebGL indisponível; mantendo o fundo em CSS.', error);
    }
  }

  if (reducedMotion.matches) return; // cartões visíveis e fundo estático

  // Progresso da seção (0 ao entrar pela base da tela, 1 ao sair pelo topo) move as lâminas;
  // o dos cartões vai de 0 (lista entrando) a 1 (lista perto do centro da tela)
  let target = 0;
  let last = performance.now();
  let running = false;
  let raf = 0;

  function measure() {
    const vh = window.innerHeight;
    const r = section.getBoundingClientRect();
    target = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
    if (solutions) {
      const l = solutions.getBoundingClientRect();
      section.style.setProperty('--c-progress', Math.min(1, Math.max(0, (vh * 0.95 - l.top) / (l.height + vh * 0.12))).toFixed(4));
    }
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    if (dt < 1 / 32) return; // ~30 fps
    last = now;
    if (sheets) {
      sheets.time += dt;
      sheets.p += (target - sheets.p) * Math.min(1, dt * 3); // movimento amortecido
      sheets.draw();
    }
  }

  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);
  new IntersectionObserver(([entry]) => {
    running = entry.isIntersecting && !document.hidden;
    if (running) { last = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
  }).observe(section);
  measure();
  if (sheets) { sheets.p = target; sheets.draw(); }
}

init();
