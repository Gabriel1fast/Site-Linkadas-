/* Gera assets/img/presence/topo-lines.svg — curvas de nível decorativas para o fundo da seção
   (ruído procedural determinístico, sem dados reais). Uso: cd tools && npm run build:textures */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contours } from 'd3-contour';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../assets/img/presence/topo-lines.svg');

// Ruído de valor suave com semente fixa (resultado idêntico a cada execução)
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const G = 64;
const lattice = Array.from({ length: G * G }, rand);
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const v = (i, j) => lattice[((j % G + G) % G) * G + ((i % G + G) % G)];
  const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * xf;
  const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * xf;
  return a + (b - a) * yf;
}
const fbm = (x, y) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < 4; o++) { s += a * noise(x * f, y * f); f *= 2; a *= 0.5; } return s; };

const W = 120, H = 75; // grade; o SVG é escalado para 1600x1000
const values = new Float64Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const wx = i / 17 + 0.6 * fbm(i / 30, j / 30), wy = j / 17 + 0.6 * fbm(i / 30 + 9, j / 30 + 3);
  values[j * W + i] = fbm(wx, wy);
}
const levels = Array.from({ length: 16 }, (_, k) => 0.24 + k * 0.032);
const polys = contours().size([W, H]).smooth(true).thresholds(levels)(values);
const S = 1600 / W;
const fmt = (n) => Math.round(n * S).toString();
const paths = polys.map((p, k) => {
  const d = p.coordinates.flat().map((ring) => 'M' + ring.map(([x, y]) => fmt(x) + ',' + fmt(y)).join('L') + 'Z').join('');
  return d ? `<path d="${d}" stroke-opacity="${k % 4 === 0 ? 0.55 : 0.28}"/>` : '';
}).join('');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#3F3857" stroke-width="1">${paths}</g></svg>\n`);
console.log('ok:', path.relative(path.resolve(here, '..'), out), (fs.statSync(out).size / 1024).toFixed(1), 'KB');
