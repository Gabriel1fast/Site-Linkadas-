/* Gera assets/js/presence-map-data.js — geometria do mapa "Presença que ultrapassa fronteiras".
   Fontes: IBGE, Malha Municipal 2022 (UFs, dissolvidas a partir da malha municipal) e
   Natural Earth 1:50m (Chile, Estados Unidos, Suécia; domínio público).
   Uso: cd tools && npm install && npm run build:map */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { geoConicEqualArea, geoTransverseMercator, geoPath, geoCentroid } from 'd3-geo';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const config = read(path.join(here, 'presence-locations.json'));
// Simplificação que preserva a topologia (fronteiras compartilhadas continuam idênticas, sem frestas)
const simplifyTopology = (t, q) => { const p = presimplify(t); return simplify(p, quantile(p, q)); };
const brTopo = simplifyTopology(read(path.join(here, 'data/br-ufs-ibge-2022.topo.json')), 0.12);
const world = simplifyTopology(read(path.join(here, 'node_modules/world-atlas/countries-50m.json')), 0.3);

const round = (n) => Math.round(n * 10) / 10;
const pt = (p) => [round(p[0]), round(p[1])];

/* Remove ilhas oceânicas distantes (Trindade, Martim Vaz, São Pedro e São Paulo) para não
   deslocar o enquadramento; Fernando de Noronha e Atol das Rocas permanecem. */
function filterPolygons(feature, keep) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const kept = polys.filter((rings) => keep(geoCentroid({ type: 'Polygon', coordinates: rings })));
  return { ...feature, geometry: { type: 'MultiPolygon', coordinates: kept } };
}
const brKeep = ([lon]) => lon < -32.2;

// ---------- Brasil ----------
const SIZE = 800;
const PAD = 16;
const ufs = topojson.feature(brTopo, brTopo.objects.ufs).features.map((f) => filterPolygons(f, brKeep));
const outline = filterPolygons({ type: 'Feature', geometry: topojson.merge(brTopo, brTopo.objects.ufs.geometries) }, brKeep);

// Albers equivalente de áreas com paralelos-padrão ajustados ao território brasileiro
const brProjection = geoConicEqualArea().parallels([-2, -22]).rotate([54, 0]).fitExtent([[PAD, PAD], [SIZE - PAD, SIZE - PAD]], outline);
const brPath = geoPath(brProjection).digits(1);

const states = ufs.map((f) => ({
  uf: f.properties.sigla,
  name: f.properties.name,
  d: brPath(f),
  label: pt(brProjection([f.properties.lx, f.properties.ly])),
}));

const locations = config.brasil.map((l) => {
  const uf = ufs.find((f) => f.properties.sigla === l.uf);
  if (!uf) throw new Error(`UF desconhecida: ${l.uf}`);
  const lonlat = l.kind === 'estado' ? [uf.properties.lx, uf.properties.ly] : [l.lon, l.lat];
  const [x, y] = pt(brProjection(lonlat));
  return { id: l.id, name: l.name, uf: l.uf, kind: l.kind, x, y };
});

// Rede de conexões: árvore geradora mínima entre os pontos (nenhum ponto é tratado como "sede")
function minimumSpanningTree(points) {
  const inTree = new Set([0]);
  const edges = [];
  while (inTree.size < points.length) {
    let best = null;
    for (const i of inTree) {
      points.forEach((p, j) => {
        if (inTree.has(j)) return;
        const d = Math.hypot(p.x - points[i].x, p.y - points[i].y);
        if (!best || d < best.d) best = { i, j, d };
      });
    }
    inTree.add(best.j);
    edges.push([best.i, best.j]);
  }
  return edges;
}
const edges = minimumSpanningTree(locations);

// ---------- Exterior ----------
const countries = topojson.feature(world, world.objects.countries).features;
const ABROAD = {
  152: { // Chile continental (sem Ilha de Páscoa e Juan Fernández) — Transversa de Mercator
    size: [96, 300],
    keep: ([lon]) => lon > -77,
    projection: () => geoTransverseMercator().rotate([71, 0]),
  },
  840: { // EUA contíguos — Albers (padrão do U.S. Census Bureau)
    size: [260, 160],
    keep: ([lon, lat]) => lon > -125 && lon < -66 && lat > 24 && lat < 50,
    projection: () => geoConicEqualArea().parallels([29.5, 45.5]).rotate([96, 0]),
  },
  752: { // Suécia — Transversa de Mercator no meridiano de 15° L (SWEREF99 TM)
    size: [130, 280],
    keep: () => true,
    projection: () => geoTransverseMercator().rotate([-15, 0]),
  },
};

const abroad = config.exterior.map((c) => {
  const spec = ABROAD[c.iso];
  const raw = countries.find((f) => Number(f.id) === c.iso);
  if (!spec || !raw) throw new Error(`País sem geometria: ${c.name}`);
  const feature = filterPolygons(raw, spec.keep);
  const projection = spec.projection().fitExtent([[4, 4], [spec.size[0] - 4, spec.size[1] - 4]], feature);
  const out = {
    id: c.id,
    name: c.name,
    size: spec.size,
    d: geoPath(projection).digits(1)(feature),
    anchor: pt(projection(geoCentroid(feature))),
  };
  if (c.city) out.city = { name: c.city.name, ...Object.fromEntries(['x', 'y'].map((k, i) => [k, round(projection([c.city.lon, c.city.lat])[i])])) };
  return out;
});

// ---------- Saída ----------
const data = {
  source: 'IBGE, Malha Municipal 2022 (UFs); Natural Earth 1:50m (Chile, Estados Unidos, Suécia)',
  brazil: { size: [SIZE, SIZE], outline: brPath(outline), states, locations, edges },
  abroad,
};
const banner = '/* Arquivo gerado por tools/build-presence-map.mjs — não editar à mão.\n   Fontes: ' + data.source + '. */\n';
const target = path.join(root, 'assets/js/presence-map-data.js');
fs.writeFileSync(target, `${banner}export default ${JSON.stringify(data)};\n`);
console.log(`ok: ${path.relative(root, target)} (${(fs.statSync(target).size / 1024).toFixed(1)} KB) — ${states.length} UFs, ${locations.length} locais, ${abroad.length} países`);
