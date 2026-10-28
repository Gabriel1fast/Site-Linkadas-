/* Linkadas — material de vidro procedural compartilhado (Three.js)
   Paleta oficial, geometria de fita com espessura e shader de vidro
   (Fresnel + reflexão/refração de um estúdio de luz nas cores da marca). */
import * as THREE from 'three';

// Paleta oficial do Design System (lida dos tokens CSS, com os valores oficiais como garantia)
const TOKENS = {
  deep: ['--color-purple-deep', '#18072B'],
  magenta: ['--color-magenta', '#C51AD8'],
  violet: ['--color-violet', '#8B2AC2'],
  gray: ['--color-purple-gray', '#3F3857'],
  offwhite: ['--color-offwhite', '#F5EFE8'],
};

export function readPalette() {
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
export function createRibbonGeometry(curve, {
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

export const vertexShader = /* glsl */ `
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

export const fragmentShader = /* glsl */ `
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

export function createGlassMaterial(palette, { intensity = 1, hue = 0, sweep = 1, wave = 1 } = {}) {
  const { deep, magenta, violet, gray, offwhite } = palette;
  return new THREE.ShaderMaterial({
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
}

export function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
  } catch {
    return false;
  }
}
