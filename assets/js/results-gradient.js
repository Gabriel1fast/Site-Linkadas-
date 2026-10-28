/* Resultados — fundo de gradiente fluido guiado pela rolagem (WebGL puro)
   Cada etapa da seção (abertura, cases 01–04, CTA) tem uma composição luminosa própria;
   o shader interpola continuamente entre elas conforme o progresso do scroll.
   Apenas cores oficiais do Design System. */
import { whenNear } from './lib/perf.js';

const PALETTE = {
  black: [0, 0, 0],
  deep: hex('#18072B'),
  violet: hex('#8B2AC2'),
  magenta: hex('#C51AD8'),
  gray: hex('#3F3857'),
  offwhite: hex('#F5EFE8'),
};

function hex(value) {
  const n = parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* Composições por etapa: base + três manchas de luz [x, y (0 = topo), raio, intensidade, cor]
   A luz principal acompanha o lado das imagens de cada case. */
const STAGES = [
  { base: ['black', 'deep', 0.25], blobs: [[0.78, 0.3, 0.55, 0.3, 'violet'], [0.18, 0.85, 0.45, 0.12, 'magenta'], [0.5, 0.65, 0.7, 0.22, 'gray']] },
  { base: ['black', 'deep', 0.42], blobs: [[0.74, 0.48, 0.55, 0.5, 'violet'], [0.92, 0.85, 0.38, 0.34, 'magenta'], [0.15, 0.25, 0.55, 0.22, 'gray']] },
  { base: ['black', 'deep', 0.5], blobs: [[0.26, 0.5, 0.52, 0.46, 'magenta'], [0.08, 0.12, 0.45, 0.36, 'violet'], [0.82, 0.8, 0.55, 0.24, 'gray']] },
  { base: ['black', 'deep', 0.55], blobs: [[0.76, 0.55, 0.56, 0.5, 'violet'], [0.58, 0.12, 0.36, 0.3, 'magenta'], [0.12, 0.75, 0.5, 0.26, 'deep']] },
  { base: ['black', 'deep', 0.55], blobs: [[0.28, 0.46, 0.56, 0.48, 'magenta'], [0.14, 0.88, 0.46, 0.38, 'violet'], [0.3, 0.22, 0.3, 0.1, 'offwhite']] },
  { base: ['black', 'deep', 0.38], blobs: [[0.5, 0.78, 0.5, 0.46, 'magenta'], [0.5, 0.3, 0.6, 0.24, 'violet'], [0.85, 0.6, 0.45, 0.16, 'gray']] },
];

/* Fundadoras: roxo profundo quase preto, luz atrás de cada retrato e depois no fechamento */
const FOUNDERS_STAGES = [
  { base: ['black', 'deep', 0.65], blobs: [[0.27, 0.42, 0.5, 0.5, 'violet'], [0.73, 0.42, 0.5, 0.46, 'magenta'], [0.5, 0.9, 0.6, 0.2, 'gray']] },
  { base: ['black', 'deep', 0.6], blobs: [[0.5, 0.62, 0.52, 0.46, 'magenta'], [0.18, 0.28, 0.5, 0.3, 'violet'], [0.82, 0.28, 0.5, 0.3, 'violet']] },
];
const STAGE_SETS = { results: STAGES, founders: FOUNDERS_STAGES };

const VERTEX = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT = `
  precision mediump float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec4 uBlob[3];
  uniform vec3 uColor[3];

  // Ruído de valor suave + fbm para deformar o espaço de forma orgânica
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = uTime;

    vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t * 0.035)), fbm(p * 1.3 + vec2(5.2, 1.3) - t * 0.03));
    vec2 r = vec2(fbm(p * 1.6 + q * 1.8 + vec2(1.7, 9.2) + t * 0.02), fbm(p * 1.6 + q * 1.8 + vec2(8.3, 2.8) - t * 0.025));
    vec2 w = p + (r - 0.5) * 0.42;

    vec3 col = uBase;
    for (int i = 0; i < 3; i++) {
      vec2 c = uBlob[i].xy;
      c += vec2(sin(t * 0.07 + float(i) * 2.1), cos(t * 0.05 + float(i) * 1.7)) * 0.035;
      c.x *= aspect;
      float d = length(w - c) / uBlob[i].z;
      col += uColor[i] * exp(-d * d * 1.8) * uBlob[i].w;
    }
    // Veios de luz muito sutis acompanhando o fluxo
    col += uColor[0] * smoothstep(0.62, 0.95, fbm(w * 2.4 - t * 0.02)) * 0.05;

    // Dither para evitar faixas no gradiente
    col += (hash(gl_FragCoord.xy + t) - 0.5) / 128.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Intensidade global das manchas: luz ambiente, nunca competindo com o texto
const INTENSITY = 0.68;

const lerp = (a, b, t) => a + (b - a) * t;
const mixColor = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const smooth = (t) => t * t * (3 - 2 * t);

function resolveStage(stage) {
  const [from, to, amount] = stage.base;
  return {
    base: mixColor(PALETTE[from], PALETTE[to], amount),
    blobs: stage.blobs.map(([x, y, radius, strength, color]) => ({ x, y, radius, strength: strength * INTENSITY, color: PALETTE[color] })),
  };
}

class ScrollGradient {
  constructor(sticky, canvas, section, stages = STAGES) {
    this.sticky = sticky;
    this.canvas = canvas;
    this.section = section;
    this.stages = stages.map(resolveStage);
    this.anchors = [];
    this.position = 0;
    this.target = 0;
    this.time = 0;
    this.last = performance.now();
    this.running = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL indisponível');
    this.gl = gl;
    this.program = this.createProgram(VERTEX, FRAGMENT);
    gl.useProgram(this.program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = Object.fromEntries(['uRes', 'uTime', 'uBase', 'uBlob', 'uColor'].map((name) => [name, gl.getUniformLocation(this.program, name)]));

    this.tick = this.tick.bind(this);
    this.measure = this.measure.bind(this);
    this.onScroll = this.onScroll.bind(this);

    new ResizeObserver(() => { this.resize(); this.measure(); }).observe(sticky);
    new ResizeObserver(this.measure).observe(section);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    new IntersectionObserver(([entry]) => (entry.isIntersecting ? this.start() : this.stop())).observe(section);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));

    this.resize();
    this.measure();
    this.position = this.target;
    this.draw();
  }

  createProgram(vs, fs) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  // Meia resolução: o gradiente é suave por natureza e o custo cai para 1/4
  resize() {
    const { clientWidth: w, clientHeight: h } = this.sticky;
    if (!w || !h) return;
    const scale = 0.5;
    this.canvas.width = Math.max(1, Math.round(w * scale));
    this.canvas.height = Math.max(1, Math.round(h * scale));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.running) this.draw();
  }

  // Âncoras: centro vertical de cada etapa (em px dentro da seção). Seções podem marcar as suas
  // com [data-fluid-anchor]; nos Cases: abertura, cada case e o CTA.
  measure() {
    const top = this.section.getBoundingClientRect().top + window.scrollY;
    const marked = this.section.querySelectorAll('[data-fluid-anchor]');
    const points = marked.length ? [...marked] : [
      this.section.querySelector('.results__header'),
      ...this.section.querySelectorAll('[data-case]'),
      this.section.querySelector('.results__cta'),
    ].filter(Boolean);
    this.anchors = points.map((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top + window.scrollY - top + rect.height / 2;
    });
    this.onScroll();
  }

  onScroll() {
    if (!this.anchors.length) return;
    const top = this.section.getBoundingClientRect().top;
    const y = window.innerHeight / 2 - top;
    const a = this.anchors;
    let index = 0;
    if (y <= a[0]) index = 0;
    else if (y >= a[a.length - 1]) index = a.length - 1;
    else {
      let i = 0;
      while (i < a.length - 2 && y > a[i + 1]) i++;
      // Cases lado a lado têm a mesma altura: evita divisão por zero entre âncoras coincidentes
      index = i + (y - a[i]) / Math.max(1, a[i + 1] - a[i]);
    }
    this.target = Math.min(index, this.stages.length - 1);
    if (!this.running) {
      this.position = this.target;
      this.draw();
    }
  }

  draw() {
    const gl = this.gl;
    const i = Math.min(Math.floor(this.position), this.stages.length - 2);
    const f = smooth(Math.min(1, Math.max(0, this.position - i)));
    const A = this.stages[i];
    const B = this.stages[i + 1];

    const blob = [];
    const color = [];
    for (let k = 0; k < 3; k++) {
      const a = A.blobs[k];
      const b = B.blobs[k];
      blob.push(lerp(a.x, b.x, f), 1 - lerp(a.y, b.y, f), lerp(a.radius, b.radius, f), lerp(a.strength, b.strength, f));
      color.push(...mixColor(a.color, b.color, f));
    }

    gl.uniform2f(this.uniforms.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.uTime, this.time);
    gl.uniform3fv(this.uniforms.uBase, mixColor(A.base, B.base, f));
    gl.uniform4fv(this.uniforms.uBlob, blob);
    gl.uniform3fv(this.uniforms.uColor, color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // ~30 fps: movimento lento não precisa de mais, e a rolagem fica livre
  tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const delta = Math.min((now - this.last) / 1000, 0.1);
    if (delta < 1 / 32) return;
    this.last = now;
    if (!this.reducedMotion.matches) this.time += delta;
    // Amortecimento: transições contínuas mesmo com rolagem brusca
    this.position += (this.target - this.position) * Math.min(1, delta * (this.reducedMotion.matches ? 10 : 2.6));
    this.draw();
  }
}

function initResultsGradient() {
  // [data-fluid-bg="<conjunto>"] reaproveita o mesmo fundo em outras seções
  document.querySelectorAll('[data-results-bg], [data-fluid-bg]').forEach((sticky) => {
    const canvas = sticky.querySelector('canvas');
    const section = sticky.closest('section');
    if (!canvas || !section) return;
    // Só cria o contexto WebGL quando a seção se aproxima da tela
    whenNear(section, () => {
      try {
        new ScrollGradient(sticky, canvas, section, STAGE_SETS[sticky.dataset.fluidBg] || STAGES);
        requestAnimationFrame(() => sticky.classList.add('is-ready'));
      } catch (error) {
        console.warn('[fundo fluido] WebGL indisponível; mantendo o fundo em CSS.', error);
      }
    });
  });
}

initResultsGradient();
