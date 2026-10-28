/* Cena da Hero (fitas de vidro) — usada só para gerar o vídeo de fundo (tools/bg-video/render.cjs).
   Para o vídeo emendar sem corte, todos os movimentos se repetem exatamente a cada LOOP segundos:
   as frequências originais foram arredondadas para múltiplos de 2π/LOOP (mesmo ritmo, quase idêntico). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { readPalette, createRibbonGeometry, createGlassMaterial } from './glass.js';

export const LOOP = 20;
const W = (2 * Math.PI) / LOOP; // 1 ciclo por loop
const seg = (n) => n;
const QUALITY = { msaa: 8 };
let SS = 1;
let CONTENT = 0.62; // fração da altura ocupada pelo conteúdo (até o CTA); as fitas ficam no espaço abaixo

/* Material de vidro com tempo periódico: o shader original usa uTime com várias velocidades; aqui cada
   termo recebe uma fase que dá voltas inteiras no loop. */
function periodicGlass(palette, options) {
  const m = createGlassMaterial(palette, options);
  const sweepTurns = Math.max(1, Math.round(0.035 * (options.sweep ?? 1) * LOOP));
  m.vertexShader = m.vertexShader
    .replace('uTime * 0.42', `uTime * ${(W * 1).toFixed(6)}`)
    .replace('uTime * 0.31', `uTime * ${(W * 1).toFixed(6)}`)
    .replace('uTime * 0.33', `uTime * ${(W * 1).toFixed(6)}`);
  m.fragmentShader = m.fragmentShader
    .replace('uTime * 0.16', `uTime * ${(W * 1).toFixed(6)}`)
    .replace('uTime * 0.035 * uSweep', `uTime * ${(sweepTurns / LOOP).toFixed(6)}`);
  return m;
}

class GlassRibbonScene {
  constructor(canvas, container, anchor) {
    this.canvas = canvas;
    this.container = container;
    this.anchor = anchor;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.elapsed = 0;
    this.visible = true;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.resScale = 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
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

    // Pós-processamento: multisampling só em computadores (o antialias nativo não se aplica ao composer)
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? QUALITY.msaa : 0 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.5, 0.42);
    // Com superamostragem, o bloom é calculado no tamanho final do vídeo: o brilho fica igual ao do site
    const setBloomSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => setBloomSize(Math.round(w / SS), Math.round(h / SS));
    this.composer.addPass(this.bloom);

    this.onResize();
  }

  createMaterial(options) {
    const material = periodicGlass(this.palette, options);
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
      createRibbonGeometry(ringCurve, { segments: seg(640), radial: seg(48), width: 0.62, thickness: 0.09, closed: true, twist: () => Math.PI / 2 + 0.25 }),
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
        segments: seg(1000),
        radial: seg(56),
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
      createRibbonGeometry(threadCurve, { segments: seg(800), radial: seg(24), width: 0.14, thickness: 0.06, twist: (u) => u * 4 }),
      this.createMaterial({ intensity: 0.7, hue: 2.4, sweep: 1.4 }),
    );
    this.group.add(thread);
  }

  onResize() {
    const { width: w, height: h } = this.canvas;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Enquadramento igual ao do site: a composição ocupa o espaço livre abaixo do conteúdo
    const visibleH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const visibleW = visibleH * this.camera.aspect;
    const contentBottom = h * CONTENT;
    const free = Math.max(h - contentBottom, h * 0.25);
    const freeWorld = (free / h) * visibleH;
    const scale = THREE.MathUtils.clamp(Math.max(visibleW / 13.5, freeWorld / 3.6), 0.5, 1.3);
    this.group.scale.setScalar(scale);
    const centerPx = Math.min(contentBottom + free * 0.55, h * 0.86);
    this.baseY = (0.5 - centerPx / h) * visibleH;
    this.group.position.y = this.baseY;
  }

  update(t) {
    this.group.rotation.y = Math.sin(t * W) * 0.05;
    this.group.position.y = this.baseY + Math.sin(t * W) * 0.08;
    for (const material of this.materials) material.uniforms.uTime.value = t;
  }

  render() {
    this.composer.render();
  }
}

export function createHeroScene(canvas, { ss = 1, content = 0.62 } = {}) {
  SS = ss;
  CONTENT = content;
  const scene = new GlassRibbonScene(canvas, null, null);
  return (time) => {
    scene.update(time);
    scene.render();
  };
}
