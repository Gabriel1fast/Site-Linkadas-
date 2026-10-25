/* Hero — elemento tridimensional: fitas de vidro líquido (Three.js)
   Material de vidro procedural (Fresnel + reflexão/refração de um estúdio de luz
   nas cores oficiais), iluminação cinematográfica com bloom e movimento contínuo. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { readPalette, createRibbonGeometry, createGlassMaterial, webglAvailable } from './lib/glass.js';

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

  createMaterial(options) {
    const material = createGlassMaterial(this.palette, options);
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
