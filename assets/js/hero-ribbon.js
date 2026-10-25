/* Hero — elemento tridimensional: fitas de vidro líquido (Three.js)
   Material de vidro procedural (Fresnel + reflexão/refração de um estúdio de luz
   nas cores oficiais), iluminação cinematográfica com bloom e movimento contínuo. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Paleta oficial do Design System (lida dos tokens CSS, com os valores oficiais como garantia)
const TOKENS = {
  deep: ['--color-purple-deep', '#18072B'],
  magenta: ['--color-magenta', '#C51AD8'],
  violet: ['--color-violet', '#8B2AC2'],
  gray: ['--color-purple-gray', '#3F3857'],
  offwhite: ['--color-offwhite', '#F5EFE8'],
};

function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const palette = {};
  for (const [key, [name, fallback]] of Object.entries(TOKENS)) {
    const value = styles.getPropertyValue(name).trim() || fallback;
    const n = parseInt(value.replace('#', ''), 16);
    palette[key] = new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  return palette;
}

/* Geometria: tubo de seção elíptica achatada (fita com espessura) ao longo de uma curva */
function createRibbonGeometry(curve, {
  segments = 360,
  radial = 36,
  width = 1,
  thickness = 0.1,
  closed = false,
  twist = () => 0,
  taper = () => 1,
} = {}) {
  const frames = curve.computeFrenetFrames(segments, closed);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(closed ? u % 1 : u, c);
    const angle = twist(u);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    n.copy(N).multiplyScalar(ca).addScaledVector(B, sa);
    b.copy(B).multiplyScalar(ca).addScaledVector(N, -sa);
    const t = taper(u);
    const w = (width * t) / 2;
    const h = (thickness * t) / 2;

    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      p.copy(c).addScaledVector(n, ct * w).addScaledVector(b, st * h);
      nrm.copy(n).multiplyScalar(ct * h).addScaledVector(b, st * w).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(nrm.x, nrm.y, nrm.z);
      uvs.push(u, j / radial);
    }
  }

  const ring = radial + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const d = (i + 1) * ring + j;
      indices.push(a, d, a + 1, d, d + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vUv;

  void main() {
    vec3 p = position;
    // Ondulação lenta: o vidro "respira" como um líquido
    p.y += (sin(p.x * 0.55 + uTime * 0.42) * 0.16 + sin(p.x * 1.25 - uTime * 0.31 + p.z) * 0.05) * uWave;
    p.z += cos(p.x * 0.38 + uTime * 0.33) * 0.14 * uWave;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 cDeep;
  uniform vec3 cMagenta;
  uniform vec3 cViolet;
  uniform vec3 cGray;
  uniform vec3 cOff;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uHue;
  uniform float uSweep;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vUv;

  // Estúdio de luz procedural — apenas cores oficiais
  vec3 studio(vec3 r) {
    vec3 c = mix(cDeep, cViolet, smoothstep(-0.7, 0.7, r.x)) * 0.32;
    c += cOff * pow(max(dot(r, normalize(vec3(-0.45, 0.8, 0.4))), 0.0), 28.0) * 2.4;      // softbox principal
    c += cOff * pow(max(dot(r, normalize(vec3(0.25, 0.55, 0.8))), 0.0), 140.0) * 4.0;    // reflexo especular nítido
    c += cMagenta * pow(max(dot(r, normalize(vec3(0.85, 0.15, 0.5))), 0.0), 14.0) * 1.7; // recorte magenta
    c += cViolet * pow(max(dot(r, normalize(vec3(-0.9, -0.2, 0.3))), 0.0), 9.0) * 1.2;   // contra-luz violeta
    c += mix(cMagenta, cOff, 0.4) * exp(-pow(r.y * 7.0 - 1.2, 2.0)) * 0.55;             // faixa de horizonte
    c += cViolet * pow(max(-r.y, 0.0), 2.0) * 0.45;
    return c;
  }

  void main() {
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);

    vec3 reflection = studio(reflect(-V, N));
    vec3 refraction = studio(refract(-V, N, 0.67));

    // Tom do corpo do vidro variando ao longo da fita
    float g = sin(vUv.x * 6.2831 * 1.1 + uTime * 0.16 + uHue) * 0.5 + 0.5;
    vec3 body = mix(cViolet, cMagenta, smoothstep(0.15, 0.85, g));
    body = mix(body, cOff, smoothstep(0.82, 1.0, g) * 0.35);

    // Luz que percorre a fita
    float s = fract(vUv.x - uTime * 0.035 * uSweep) - 0.5;
    float sweep = exp(-s * s * 60.0);

    vec3 col = refraction * body * 0.24
             + reflection * (0.05 + 0.95 * fres)
             + body * fres * 0.6
             + mix(cMagenta, cOff, 0.6) * sweep * (0.08 + fres) * 0.6
             + cDeep * 0.25;

    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

class GlassRibbonScene {
  constructor(canvas, container, anchor) {
    this.canvas = canvas;
    this.container = container;
    this.anchor = anchor;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.running = false;
    this.visible = true;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 0, 14);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.palette = readPalette();
    this.materials = [];
    this.buildShapes();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.4);
    this.composer.addPass(this.bloom);

    this.onResize = this.onResize.bind(this);
    this.onPointer = this.onPointer.bind(this);
    this.tick = this.tick.bind(this);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    document.fonts?.ready.then(this.onResize);
    window.addEventListener('pointermove', this.onPointer, { passive: true });

    this.intersection = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.visible ? this.start() : this.stop();
    });
    this.intersection.observe(container);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    this.reducedMotion.addEventListener?.('change', () => (this.reducedMotion.matches ? this.renderStill() : this.start()));

    this.onResize();
  }

  createMaterial({ intensity = 1, hue = 0, sweep = 1, wave = 1 } = {}) {
    const { deep, magenta, violet, gray, offwhite } = this.palette;
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        cDeep: { value: deep },
        cMagenta: { value: magenta },
        cViolet: { value: violet },
        cGray: { value: gray },
        cOff: { value: offwhite },
        uTime: { value: 0 },
        uWave: { value: wave },
        uIntensity: { value: intensity },
        uHue: { value: hue },
        uSweep: { value: sweep },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(material);
    return material;
  }

  buildShapes() {
    // 1. Anel de vidro — grande aro elíptico inclinado (lado esquerdo)
    const ringPoints = [];
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(t) * 4.6, 0, Math.sin(t) * 2.3));
    }
    const ringCurve = new THREE.CatmullRomCurve3(ringPoints, true, 'centripetal');
    const ring = new THREE.Mesh(
      createRibbonGeometry(ringCurve, { segments: 320, radial: 32, width: 0.62, thickness: 0.09, closed: true, twist: () => Math.PI / 2 + 0.25 }),
      this.createMaterial({ intensity: 0.95, hue: 1.4, sweep: 0.8, wave: 0.6 }),
    );
    ring.rotation.set(0.5, 0.18, -0.16);
    ring.position.set(-4.4, -0.15, -0.6);
    this.group.add(ring);

    // 2. Fita principal — curva fluida que atravessa a composição com torção
    const ribbonCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-11, -2.4, -2.5),
      new THREE.Vector3(-7.2, -1.6, -0.6),
      new THREE.Vector3(-3.6, 0.15, 1.2),
      new THREE.Vector3(0.2, 0.55, 1.4),
      new THREE.Vector3(3.6, -0.55, 0.3),
      new THREE.Vector3(6.6, 0.4, -1.0),
      new THREE.Vector3(9.4, 1.6, -0.4),
      new THREE.Vector3(12.5, 0.8, -2.6),
    ], false, 'centripetal');
    const ribbon = new THREE.Mesh(
      createRibbonGeometry(ribbonCurve, {
        segments: 520,
        radial: 40,
        width: 1.25,
        thickness: 0.13,
        twist: (u) => 0.35 + u * Math.PI * 1.65,
      }),
      this.createMaterial({ intensity: 1.0, hue: 0, sweep: 1 }),
    );
    this.group.add(ribbon);

    // 3. Filete de vidro — detalhe fino que acompanha a fita e dá profundidade
    const threadCurve = new THREE.CatmullRomCurve3(
      ribbonCurve.points.map((v, i) => v.clone().add(new THREE.Vector3(0, -0.75 + Math.sin(i * 1.3) * 0.35, -1.4))),
      false,
      'centripetal',
    );
    const thread = new THREE.Mesh(
      createRibbonGeometry(threadCurve, { segments: 420, radial: 20, width: 0.14, thickness: 0.06, twist: (u) => u * 4 }),
      this.createMaterial({ intensity: 0.7, hue: 2.4, sweep: 1.4 }),
    );
    this.group.add(thread);
  }

  onPointer(event) {
    this.pointerTarget.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  }

  onResize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 700 ? 1.5 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Enquadramento: a composição ocupa o espaço livre abaixo do conteúdo (CTA)
    const visibleH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const visibleW = visibleH * this.camera.aspect;
    const containerTop = this.container.getBoundingClientRect().top;
    const contentBottom = this.anchor ? this.anchor.getBoundingClientRect().bottom - containerTop : h * 0.62;
    const free = Math.max(h - contentBottom, h * 0.25);
    const freeWorld = (free / h) * visibleH;
    const scale = THREE.MathUtils.clamp(Math.max(visibleW / 13.5, freeWorld / 3.6), 0.5, 1.3);
    this.group.scale.setScalar(scale);
    const centerPx = Math.min(contentBottom + free * 0.55, h * 0.86);
    this.baseY = (0.5 - centerPx / h) * visibleH;
    this.group.position.y = this.baseY;

    if (!this.running) this.renderStill();
  }

  update(delta) {
    this.elapsed += delta;
    this.pointer.lerp(this.pointerTarget, Math.min(1, delta * 2.2));
    const t = this.elapsed;
    this.group.rotation.y = Math.sin(t * 0.12) * 0.06 + this.pointer.x * 0.1;
    this.group.rotation.x = this.pointer.y * 0.05;
    this.group.position.y = this.baseY + Math.sin(t * 0.35) * 0.08;
    for (const material of this.materials) material.uniforms.uTime.value = t;
  }

  render() {
    this.composer.render();
  }

  renderStill() {
    this.update(0);
    this.render();
  }

  start() {
    if (this.running || !this.visible || document.hidden) return;
    if (this.reducedMotion.matches) {
      this.renderStill();
      return;
    }
    this.running = true;
    this.clock.getDelta();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  tick() {
    if (!this.running) return;
    this.update(Math.min(this.clock.getDelta(), 0.05));
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  }
}

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
  } catch {
    return false;
  }
}

function initHeroVisual() {
  const container = document.querySelector('[data-hero-visual]');
  const canvas = container?.querySelector('[data-hero-canvas]');
  const anchor = document.querySelector('[data-hero-anchor]');
  if (!container || !canvas) return;

  if (!webglAvailable()) {
    container.classList.add('is-fallback');
    return;
  }

  try {
    const scene = new GlassRibbonScene(canvas, container, anchor);
    // Primeiro frame já desenhado antes do fade-in, para evitar piscar
    scene.update(0);
    scene.render();
    scene.start();
    requestAnimationFrame(() => container.classList.add('is-ready'));
  } catch (error) {
    console.warn('[hero] WebGL indisponível, usando fallback.', error);
    container.classList.add('is-fallback');
  }
}

initHeroVisual();
