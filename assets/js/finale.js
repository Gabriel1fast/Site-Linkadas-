/* 7ª dobra — portal de vidro 3D com túnel de anéis e grade em perspectiva (Three.js).
   Mesmo material de vidro e bloom da Hero: o site abre e fecha com a mesma linguagem visual.
   A rolagem aproxima a câmera do portal e faz os anéis do túnel avançarem. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { readPalette, createRibbonGeometry, createGlassMaterial, webglAvailable } from './lib/glass.js';
import { tier, QUALITY, deviceDpr, createLoop, whenNear } from './lib/perf.js';

const DETAIL = tier === 'high' ? 1 : 0.5;
const seg = (n) => Math.round(n * DETAIL);

const section = document.querySelector('[data-finale]');
const visual = section?.querySelector('[data-finale-visual]');
const canvas = section?.querySelector('[data-finale-canvas]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const circle = (r, n = 128) => new THREE.CatmullRomCurve3(
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0); }),
  true,
);

/* Grade em perspectiva com linhas antisserrilhadas (derivadas de tela) que somem no horizonte */
const gridMaterial = (palette) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uFlow: { value: 0 }, cViolet: { value: palette.violet }, cMagenta: { value: palette.magenta } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime, uFlow;
    uniform vec3 cViolet, cMagenta;
    varying vec3 vWorld;
    void main() {
      vec2 g = vec2(vWorld.x, vWorld.z + uFlow) / 1.6;
      vec2 w = fwidth(g);
      vec2 dist = abs(fract(g - 0.5) - 0.5) / w;                  // distância à linha, em pixels
      float core = 1.0 - smoothstep(0.0, 1.2, min(dist.x, dist.y)); // linha nítida (~1px, antisserrilhada)
      float halo = exp(-min(dist.x, dist.y) * 0.6) * 0.18;           // brilho suave ao redor
      // Anti-moiré: quando a célula fica menor que alguns pixels (longe), a grade se dissolve
      float lod = 1.0 - smoothstep(0.06, 0.22, max(w.x, w.y));
      float d = length(vWorld.xz);
      float fade = exp(-max(-vWorld.z, 0.0) * 0.045) * smoothstep(26.0, 6.0, abs(vWorld.x));
      fade *= smoothstep(18.0, 4.0, vWorld.z) * lod;
      vec3 col = mix(cViolet, cMagenta, smoothstep(30.0, 0.0, d)) * (core * 0.42 + halo) * fade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  extensions: { derivatives: true },
});

/* Anel desenhado por função de distância num plano: borda antisserrilhada em qualquer espessura
   (substitui geometria fina demais, que ficava pontilhada). Um brilho percorre o anel. */
const ringMaterial = (palette, { radius, width, intensity = 1, speed = 0.3, phase = 0 }) => new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uIntensity: { value: intensity },
    cViolet: { value: palette.violet }, cMagenta: { value: palette.magenta }, cOff: { value: palette.offwhite },
  },
  vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform float uTime, uIntensity;
    uniform vec3 cViolet, cMagenta, cOff;
    varying vec2 vP;
    void main() {
      float r = length(vP);
      float d = abs(r - ${radius.toFixed(3)});
      float fw = fwidth(r);
      float core = 1.0 - smoothstep(${(width / 2).toFixed(4)}, ${(width / 2).toFixed(4)} + fw * 1.5, d);
      float halo = exp(-d / (${width.toFixed(4)} * 2.0 + fw * 1.5)) * 0.22;
      float a = atan(vP.y, vP.x);
      float sweep = pow(0.5 + 0.5 * cos(a - uTime * ${speed.toFixed(3)} - ${phase.toFixed(3)}), 6.0);
      vec3 col = mix(cViolet, cMagenta, 0.35 + 0.65 * sweep) * (core * 0.9 + halo) + cOff * core * sweep * 0.5;
      gl_FragColor = vec4(col * uIntensity, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  extensions: { derivatives: true },
});

/* Brilho atrás do portal (disco com gradiente radial) */
const glowMaterial = (palette) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, cViolet: { value: palette.violet }, cMagenta: { value: palette.magenta }, cOff: { value: palette.offwhite } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 cViolet, cMagenta, cOff;
    varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      float core = exp(-r * r * 9.0);
      float halo = exp(-r * r * 2.2) * (0.85 + 0.15 * sin(uTime * 0.8));
      vec3 col = cViolet * halo * 0.32 + cMagenta * core * 0.38 + cOff * exp(-r * r * 40.0) * 0.08;
      gl_FragColor = vec4(col * smoothstep(1.0, 0.7, r), 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

class FinaleScene {
  constructor() {
    this.palette = readPalette();
    this.materials = [];
    this.time = 0;
    this.p = 0;
    this.target = 0;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();

    this.resScale = 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    this.build();

    // Pós-processamento: multisampling só em computadores (o antialias nativo não se aplica ao composer)
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? QUALITY.msaa : 0 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(QUALITY.bloomRes, QUALITY.bloomRes), 0.85, 0.5, 0.38);
    this.composer.addPass(this.bloom);

    new ResizeObserver(() => this.resize()).observe(visual);
    this.resize();
  }

  glass(options) {
    const m = createGlassMaterial(this.palette, { wave: 0, ...options });
    this.materials.push(m);
    return m;
  }

  build() {
    // Portal principal: anel largo de vidro, de frente para a câmera
    this.portal = new THREE.Mesh(
      createRibbonGeometry(circle(5.2), { segments: seg(520), radial: seg(40), width: 0.55, thickness: 0.18, closed: true, twist: () => 0 }),
      this.glass({ intensity: 0.95, sweep: 1.4 }),
    );
    this.portal.position.set(0, 0.35, 0);
    this.scene.add(this.portal);

    // Anel interno fino, girando em outro eixo (sensação de mecanismo)
    this.inner = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 9.6), ringMaterial(this.palette, { radius: 4.5, width: 0.035, intensity: 0.55, speed: 0.5 }));
    this.inner.position.copy(this.portal.position);
    this.scene.add(this.inner);

    // Brilho atrás do portal
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), glowMaterial(this.palette));
    this.glow.position.set(0, 0.35, -1.5);
    this.scene.add(this.glow);

    // Túnel: anéis finos que se afastam no horizonte e avançam com a rolagem
    this.tunnel = [];
    const ringGeo = new THREE.PlaneGeometry(11, 11);
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMaterial(this.palette, { radius: 5.2, width: 0.022, intensity: 0.38, speed: 0.25, phase: i * 0.9 }));
      ring.position.set(0, 0.35, -3 - i * 3.2);
      this.tunnel.push(ring);
      this.scene.add(ring);
    }

    // Grade em perspectiva
    this.gridMat = gridMaterial(this.palette);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 1, 1), this.gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(0, -3.4, -20);
    this.scene.add(grid);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = visual;
    if (!w || !h) return;
    const dpr = deviceDpr() * this.resScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Em telas estreitas, recua a câmera para o portal caber
    this.distanceFactor = THREE.MathUtils.clamp(1.25 / this.camera.aspect, 1, 2.2);
    this.camera.updateProjectionMatrix();
    this.update(0);
    this.render();
  }

  update(dt) {
    this.time += dt;
    // Amortecimento independente da taxa de quadros
    this.p += (this.target - this.p) * (dt ? 1 - Math.exp(-dt * 3) : 1);
    this.pointer.lerp(this.pointerTarget, dt ? 1 - Math.exp(-dt * 2.5) : 1);
    const t = this.time;
    const p = this.p;

    // Câmera avança em direção ao portal conforme a rolagem
    const z = (15 - p * 5.5) * this.distanceFactor;
    this.camera.position.set(this.pointer.x * 0.8, 0.9 + this.pointer.y * -0.4, z);
    this.camera.lookAt(0, 0.2, -6);

    this.portal.rotation.z = t * 0.05 + p * 0.6;
    this.inner.rotation.set(Math.sin(t * 0.3) * 0.25, Math.sin(t * 0.22) * 0.5, 0);

    // Anéis do túnel fluem em direção ao portal (ciclo contínuo)
    const flow = t * 0.6 + p * 14;
    this.tunnel.forEach((ring, i) => {
      const z0 = -((i * 3.2 + flow) % 32) - 2.5;
      ring.position.z = z0;
      const s = 1 + Math.sin(i + t * 0.2) * 0.03;
      ring.scale.setScalar(s);
      // Entra suave perto do portal e some cedo na distância (o centro, atrás do texto, fica limpo)
      ring.material.uniforms.uIntensity.value = 0.3 * THREE.MathUtils.smoothstep(-z0, 2.5, 6) * (1 - THREE.MathUtils.smoothstep(-z0, 7, 18));
    });
    this.gridMat.uniforms.uFlow.value = flow * 0.6;
    this.glow.material.uniforms.uTime.value = t;
    this.inner.material.uniforms.uTime.value = t;
    this.tunnel.forEach((ring) => { ring.material.uniforms.uTime.value = t; });
    for (const m of this.materials) m.uniforms.uTime.value = t;
  }

  render() { this.composer.render(); }
}

function init() {
  if (!section || !visual || !canvas || !webglAvailable()) return;
  let scene;
  try {
    scene = new FinaleScene();
    requestAnimationFrame(() => visual.classList.add('is-ready'));
  } catch (error) {
    console.warn('[final] WebGL indisponível; mantendo o fundo em CSS.', error);
    return;
  }

  const measure = () => {
    const vh = window.innerHeight;
    const r = section.getBoundingClientRect();
    // 0 quando a seção entra pela base; 1 quando está inteira na tela
    scene.target = Math.min(1, Math.max(0, (vh - r.top) / vh));
  };
  measure();
  scene.p = scene.target;

  if (reducedMotion.matches) { scene.update(0); scene.render(); return; }

  window.addEventListener('scroll', measure, { passive: true });
  section.addEventListener('pointermove', (e) => {
    scene.pointerTarget.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  createLoop({
    el: section,
    frame: (dt) => { scene.update(dt); scene.render(); },
    onScale: (scale) => { scene.resScale = scale; scene.resize(); },
  });
}

// A cena só é criada quando o visitante se aproxima do fim da página
if (section) whenNear(section, init);
