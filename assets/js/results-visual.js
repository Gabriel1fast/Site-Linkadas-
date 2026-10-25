/* Resultados — elemento tridimensional do palco: laço de vidro contínuo com anéis orbitais
   (mesmo material de vidro da Hero, para continuidade visual entre as dobras). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { readPalette, createRibbonGeometry, createGlassMaterial, webglAvailable } from './lib/glass.js';

// Curva em laço contínuo (lemniscata com profundidade)
class LoopCurve extends THREE.Curve {
  constructor(size = 2.4, depth = 0.9) {
    super();
    this.size = size;
    this.depth = depth;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const d = 1 + Math.sin(a) ** 2;
    return target.set(
      (this.size * Math.cos(a)) / d,
      (this.size * Math.sin(a) * Math.cos(a)) / d,
      this.depth * Math.sin(a),
    );
  }
}

class ResultsGlassScene {
  constructor(canvas, stage, casesRoot) {
    this.canvas = canvas;
    this.stage = stage;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.running = false;
    this.visible = false;
    this.hue = 0;
    this.hueTarget = 0;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 0.8, 0.1, 100);
    this.camera.position.set(0, 0, 13);

    this.palette = readPalette();
    this.materials = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.buildShapes();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 0.4));

    this.onResize = this.onResize.bind(this);
    this.tick = this.tick.bind(this);
    new ResizeObserver(this.onResize).observe(stage);

    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.visible ? this.start() : this.stop();
    }).observe(stage);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));

    casesRoot?.addEventListener('cases:change', (event) => {
      this.hueTarget = event.detail.index * 1.4;
      if (!this.running) this.renderStill();
    });
    casesRoot?.addEventListener('pointermove', (event) => {
      const rect = casesRoot.getBoundingClientRect();
      this.pointerTarget.set(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
    }, { passive: true });
    casesRoot?.addEventListener('pointerleave', () => this.pointerTarget.set(0, 0));

    this.onResize();
  }

  material(options) {
    const material = createGlassMaterial(this.palette, { wave: 0, ...options });
    this.materials.push(material);
    return material;
  }

  buildShapes() {
    // Laço principal: fita de vidro com meia-torção ao longo do percurso
    this.loop = new THREE.Mesh(
      createRibbonGeometry(new LoopCurve(2.5, 0.95), {
        segments: 480,
        radial: 40,
        width: 1.05,
        thickness: 0.16,
        closed: true,
        twist: (u) => u * Math.PI * 3,
      }),
      this.material({ intensity: 1, sweep: 1.2 }),
    );
    this.group.add(this.loop);

    // Anéis orbitais finos — profundidade e sensação de movimento
    const circle = (r) => new THREE.EllipseCurve(0, 0, r, r).getPoints(96).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const ring = (r, width, options) => new THREE.Mesh(
      createRibbonGeometry(new THREE.CatmullRomCurve3(circle(r), true), { segments: 220, radial: 16, width, thickness: width * 0.4, closed: true }),
      this.material(options),
    );
    this.orbitA = ring(3.3, 0.07, { intensity: 0.75, hue: 1.8, sweep: 2 });
    this.orbitA.rotation.set(1.15, 0.25, 0);
    this.orbitB = ring(2.75, 0.045, { intensity: 0.6, hue: 3.2, sweep: 2.6 });
    this.orbitB.rotation.set(1.35, -0.5, 0.4);
    this.group.add(this.orbitA, this.orbitB);

    this.group.rotation.set(0.35, -0.3, 0.55);
    this.baseY = 0;
  }

  onResize() {
    const { clientWidth: w, clientHeight: h } = this.stage;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Desktop: laço deslocado para a área livre do palco (cartões flutuam à direita e embaixo).
    // Coluna única: cartões ficam abaixo do palco, então o laço é centralizado.
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    this.group.position.x = stacked ? 0 : -0.45;
    this.baseY = stacked ? 0.35 : 0.7;
    if (!this.running) this.renderStill();
  }

  update(delta) {
    this.elapsed += delta;
    const t = this.elapsed;
    this.hue += (this.hueTarget - this.hue) * Math.min(1, delta * 1.5 || 1);
    this.pointer.lerp(this.pointerTarget, Math.min(1, delta * 2.5));

    this.loop.rotation.y = t * 0.18;
    this.loop.rotation.x = Math.sin(t * 0.3) * 0.12;
    this.orbitA.rotation.z = t * 0.22;
    this.orbitB.rotation.z = -t * 0.16;
    this.group.rotation.x = 0.35 + this.pointer.y * 0.12;
    this.group.rotation.y = -0.3 + this.pointer.x * 0.18;
    this.group.position.y = this.baseY + Math.sin(t * 0.6) * 0.1;

    for (const material of this.materials) {
      material.uniforms.uTime.value = t;
      material.uniforms.uHue.value = this.hue + (material.userData.hueOffset ??= material.uniforms.uHue.value);
    }
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

function initResultsVisual() {
  const stage = document.querySelector('[data-results-visual]');
  const canvas = stage?.querySelector('[data-results-canvas]');
  if (!stage || !canvas || !webglAvailable()) return;

  try {
    const scene = new ResultsGlassScene(canvas, stage, document.querySelector('[data-cases]'));
    scene.renderStill();
    requestAnimationFrame(() => stage.classList.add('is-ready'));
  } catch (error) {
    console.warn('[resultados] WebGL indisponível; mantendo o fundo em CSS.', error);
  }
}

initResultsVisual();
