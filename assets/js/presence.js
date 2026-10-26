/* Presença — mapa interativo do Brasil com locais atendidos e conexões internacionais.
   Sequência guiada pela rolagem: mapa surge → fronteiras desenhadas → pontos acendem →
   conexões se traçam → países do exterior entram. Hover (mouse) ou toque mostram detalhes. */
import MAP from './presence-map-data.js';
import { STATE_COMPANIES, LOCATION_COMPANIES, ABROAD_COMPANIES } from './presence-content.js';

const section = document.querySelector('[data-presence]');
const stage = section?.querySelector('[data-presence-stage]');
const svg = section?.querySelector('[data-presence-map]');
const labelsEl = section?.querySelector('[data-presence-labels]');
const tooltip = section?.querySelector('[data-presence-tooltip]');

const NS = 'http://www.w3.org/2000/svg';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const BR = MAP.brazil;
const ABROAD = Object.fromEntries(MAP.abroad.map((c) => [c.id, c]));
const UF_NAMES = Object.fromEntries(BR.states.map((s) => [s.uf, s.name]));

/* Composições: posição (x, y) de cada país no sistema de coordenadas do SVG e do seu rótulo */
const LAYOUTS = {
  wide: {
    viewBox: [0, 0, 1120, 820],
    brazil: [0, 10],
    abroad: {
      chile: { at: [860, 0], label: [978, 150, 'start'] },
      eua: { at: [830, 330], label: [960, 520, 'center'] },
      suecia: { at: [885, 545], label: [1028, 742, 'start'] },
    },
  },
  tall: {
    viewBox: [0, 0, 800, 1300],
    brazil: [0, 0],
    abroad: {
      chile: { at: [60, 850], label: [108, 1175, 'top'] },
      eua: { at: [215, 920], label: [345, 1175, 'top'] },
      suecia: { at: [575, 850], label: [640, 1175, 'top'] },
    },
  },
};

const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const range = (p, a, b) => clamp01((p - a) / (b - a));

// Curva suave entre dois pontos (arco levemente abaulado)
function arc([x1, y1], [x2, y2], bend = 0.18) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return `M${x1},${y1} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${x2},${y2}`;
}

function build() {
  // ---------- defs ----------
  const defs = el('defs');
  defs.innerHTML = `
    <clipPath id="pr-clip"><path d="${BR.outline}"/></clipPath>
    <linearGradient id="pr-side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8B2AC2"/><stop offset="1" stop-color="#18072B"/>
    </linearGradient>
    <linearGradient id="pr-top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A55BD6"/><stop offset=".55" stop-color="#B84BD9"/><stop offset="1" stop-color="#D36BE3"/>
    </linearGradient>
    <linearGradient id="pr-link" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#C51AD8"/><stop offset="1" stop-color="#8B2AC2"/>
    </linearGradient>
    <filter id="pr-shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#18072B" flood-opacity=".28"/>
    </filter>
    <filter id="pr-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3.2"/>
    </filter>`;
  svg.append(defs);

  // ---------- Brasil ----------
  const brazil = el('g', { class: 'pr-brazil' });
  const body = el('g', { class: 'pr-body' });
  body.append(
    el('path', { class: 'pr-side', d: BR.outline, transform: 'translate(0 7)' }),
    el('path', { class: 'pr-top', d: BR.outline, filter: 'url(#pr-shadow)' }),
    el('image', { class: 'pr-relief', href: 'assets/img/presence/relief.webp', x: 0, y: 0, width: BR.size[0], height: BR.size[1], 'clip-path': 'url(#pr-clip)', preserveAspectRatio: 'none' }),
  );
  const states = el('g', { class: 'pr-states' });
  BR.states.forEach((s) => {
    states.append(el('path', { class: 'pr-state', d: s.d, 'data-uf': s.uf, pathLength: 1 }));
  });
  body.append(states, el('path', { class: 'pr-outline', d: BR.outline }));
  brazil.append(body);

  // Conexões internas (árvore geradora mínima gerada no build)
  const links = el('g', { class: 'pr-links' });
  BR.edges.forEach(([a, b], i) => {
    const A = BR.locations[a];
    const B = BR.locations[b];
    const d = arc([A.x, A.y], [B.x, B.y], 0.22);
    links.append(
      el('path', { class: 'pr-link-glow', d, pathLength: 1, style: `--i:${i}` }),
      el('path', { class: 'pr-link', d, pathLength: 1, style: `--i:${i}` }),
    );
  });
  brazil.append(links);

  // Pontos
  const points = el('g', { class: 'pr-points' });
  BR.locations.forEach((l, i) => {
    const g = el('g', {
      class: 'pr-point', 'data-location': l.id, style: `--i:${i}`,
      transform: `translate(${l.x} ${l.y})`, tabindex: 0, role: 'button',
      'aria-label': `${l.name}${l.kind === 'cidade' ? ` (${l.uf})` : ''}`,
    });
    g.append(
      el('circle', { class: 'pr-point__hit', r: 16 }),
      el('circle', { class: 'pr-point__pulse', r: 7 }),
      el('circle', { class: 'pr-point__glow', r: 9, filter: 'url(#pr-glow)' }),
      el('circle', { class: 'pr-point__core', r: 4.4 }),
    );
    points.append(g);
  });
  brazil.append(points);
  svg.append(brazil);

  // ---------- Exterior ----------
  const abroad = el('g', { class: 'pr-abroad' });
  const abroadLinks = el('g', { class: 'pr-abroad-links' });
  MAP.abroad.forEach((c, i) => {
    const g = el('g', { class: 'pr-country', 'data-country': c.id, style: `--i:${i}`, tabindex: 0, role: 'button', 'aria-label': c.city ? `${c.name} — ${c.city.name}` : c.name });
    g.append(el('path', { class: 'pr-country__side', d: c.d, transform: 'translate(0 4)' }), el('path', { class: 'pr-country__top', d: c.d }));
    const dot = c.city ? [c.city.x, c.city.y] : c.anchor;
    const marker = el('g', { class: 'pr-country__dot', transform: `translate(${dot[0]} ${dot[1]})` });
    marker.append(el('circle', { class: 'pr-point__pulse', r: 6 }), el('circle', { class: 'pr-point__glow', r: 8, filter: 'url(#pr-glow)' }), el('circle', { class: 'pr-point__core', r: 4 }));
    g.append(marker);
    abroad.append(g);
    abroadLinks.append(
      el('path', { class: 'pr-link-glow', 'data-to': c.id, pathLength: 1, style: `--i:${i}` }),
      el('path', { class: 'pr-link pr-link--abroad', 'data-to': c.id, pathLength: 1, style: `--i:${i}` }),
    );

    const label = document.createElement('div');
    label.className = 'presence__label';
    label.dataset.country = c.id;
    label.style.setProperty('--i', i);
    label.innerHTML = `<span class="presence__label-name">${c.name}</span>${c.city ? `<span class="presence__label-city">${c.city.name}</span>` : ''}<span class="presence__label-rule" aria-hidden="true"></span>`;
    labelsEl.append(label);
  });
  svg.append(abroadLinks, abroad);
}

let currentLayout = null;
function layout() {
  const name = stage.clientWidth >= 640 ? 'wide' : 'tall';
  if (name === currentLayout) return;
  currentLayout = name;
  const L = LAYOUTS[name];
  const [vx, vy, vw, vh] = L.viewBox;
  svg.setAttribute('viewBox', L.viewBox.join(' '));
  stage.style.setProperty('--aspect', `${vw} / ${vh}`);
  stage.dataset.layout = name;
  svg.querySelector('.pr-brazil').setAttribute('transform', `translate(${L.brazil.join(' ')})`);

  MAP.abroad.forEach((c) => {
    const spec = L.abroad[c.id];
    svg.querySelector(`.pr-country[data-country="${c.id}"]`).setAttribute('transform', `translate(${spec.at.join(' ')})`);
    const dot = c.city ? [c.city.x, c.city.y] : c.anchor;
    const target = [spec.at[0] + dot[0], spec.at[1] + dot[1]];
    // Origem: local brasileiro mais próximo do destino (apenas composição visual)
    const origin = BR.locations.reduce((best, l) => {
      const p = [l.x + L.brazil[0], l.y + L.brazil[1]];
      const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
      return !best || d < best.d ? { p, d } : best;
    }, null).p;
    svg.querySelectorAll(`[data-to="${c.id}"]`).forEach((path) => path.setAttribute('d', arc(origin, target, name === 'wide' ? -0.16 : 0.16)));

    const label = labelsEl.querySelector(`[data-country="${c.id}"]`);
    const [lx, ly, align] = spec.label;
    label.style.left = `${((lx - vx) / vw) * 100}%`;
    label.style.top = `${((ly - vy) / vh) * 100}%`;
    label.dataset.align = align;
  });
}

// ---------- Rolagem: progresso da revelação ----------
let frame = 0;
function setProgress(p) {
  const s = section.style;
  s.setProperty('--p-map', range(p, 0, 0.3).toFixed(3));
  s.setProperty('--p-borders', range(p, 0.14, 0.5).toFixed(3));
  s.setProperty('--p-points', range(p, 0.38, 0.7).toFixed(3));
  s.setProperty('--p-links', range(p, 0.55, 0.84).toFixed(3));
  s.setProperty('--p-abroad', range(p, 0.72, 1).toFixed(3));
  section.classList.toggle('is-live', p > 0.7);
}
function onScroll() {
  frame = 0;
  const rect = stage.getBoundingClientRect();
  const vh = window.innerHeight;
  // 0 quando o mapa começa a entrar pela base da tela; 1 quando seu topo chega a ~38% da altura
  setProgress(clamp01((vh - rect.top) / (vh * 0.62)));
}

// ---------- Tooltip ----------
let pinned = null; // elemento selecionado por toque/clique
function list(title, items) {
  return items?.length ? `<p class="presence__tip-title">${title}</p><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
}
function contentFor(target) {
  if (target.dataset.uf) {
    const uf = target.dataset.uf;
    const places = BR.locations.filter((l) => l.uf === uf).map((l) => l.name);
    return `<p class="presence__tip-name">${UF_NAMES[uf]} <span>${uf}</span></p>${list('Locais atendidos', places)}${list('Empresas atendidas', STATE_COMPANIES[uf])}`;
  }
  if (target.dataset.location) {
    const l = BR.locations.find((x) => x.id === target.dataset.location);
    const kind = l.kind === 'cidade' ? `Cidade · ${UF_NAMES[l.uf]}` : 'Estado';
    return `<p class="presence__tip-name">${l.name}${l.kind === 'cidade' ? ` <span>${l.uf}</span>` : ''}</p><p class="presence__tip-kind">${kind}</p>${list('Empresas atendidas', LOCATION_COMPANIES[l.id])}`;
  }
  const c = ABROAD[target.dataset.country];
  return `<p class="presence__tip-name">${c.name}</p>${c.city ? `<p class="presence__tip-kind">${c.city.name}</p>` : ''}${list('Empresas atendidas', ABROAD_COMPANIES[c.id])}`;
}

function anchorOf(target) {
  // Pontos e países: ancora no marcador; estados: no ponto de referência do IBGE
  const node = target.matches('.pr-country') ? target.querySelector('.pr-country__dot') : target;
  if (target.dataset.uf) {
    const s = BR.states.find((x) => x.uf === target.dataset.uf);
    const m = svg.getScreenCTM();
    const off = LAYOUTS[currentLayout].brazil;
    const p = new DOMPoint(s.label[0] + off[0], s.label[1] + off[1]).matrixTransform(m);
    return [p.x, p.y];
  }
  const r = node.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function show(target, at) {
  section.querySelectorAll('.is-active').forEach((n) => n !== target && n.classList.remove('is-active'));
  target.classList.add('is-active');
  const id = target.dataset.location;
  section.querySelectorAll('.presence__place').forEach((b) => b.classList.toggle('is-active', !!id && b.dataset.location === id));
  if (id) svg.querySelector(`.pr-point[data-location="${id}"]`)?.classList.add('is-active');

  tooltip.innerHTML = contentFor(target);
  const box = stage.getBoundingClientRect();
  const [x, y] = at || anchorOf(target);
  tooltip.style.left = `${x - box.left}px`;
  tooltip.style.top = `${y - box.top}px`;
  tooltip.classList.add('is-visible');
  tooltip.dataset.flip = x - box.left > box.width - 220 ? 'left' : 'right';
}
function hide(force = false) {
  if (pinned && !force) return;
  pinned = null;
  tooltip.classList.remove('is-visible');
  section.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
}

function interactive(target) {
  return target?.closest?.('.pr-point, .pr-country, .pr-state, .presence__place');
}
function resolve(node) {
  // Botões da lista apontam para o ponto correspondente no mapa
  return node.matches('.presence__place') ? svg.querySelector(`.pr-point[data-location="${node.dataset.location}"]`) : node;
}

function bindEvents() {
  section.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const node = interactive(e.target);
    if (node && !pinned) show(resolve(node), node.matches('.pr-state') ? [e.clientX, e.clientY] : null);
  });
  section.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || pinned) return;
    const node = interactive(e.target);
    if (node?.matches('.pr-state')) show(node, [e.clientX, e.clientY]);
  });
  section.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!interactive(e.relatedTarget)) hide();
  });
  // Toque/clique: fixa o tooltip; tocar fora ou de novo no mesmo item fecha
  section.addEventListener('click', (e) => {
    const node = interactive(e.target);
    if (!node) { hide(true); return; }
    const target = resolve(node);
    if (pinned === target) { hide(true); return; }
    pinned = target;
    show(target, node.matches('.pr-state') ? [e.clientX, e.clientY] : null);
  });
  section.addEventListener('focusin', (e) => {
    const node = interactive(e.target);
    if (node && !node.matches('.pr-state')) show(resolve(node));
  });
  section.addEventListener('focusout', (e) => { if (!interactive(e.relatedTarget)) hide(true); });
  section.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide(true);
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pr-point, .pr-country')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  document.addEventListener('click', (e) => { if (pinned && !section.contains(e.target)) hide(true); });
}

function init() {
  if (!section || !svg || !MAP) return;
  build();
  layout();
  bindEvents();
  section.classList.add('is-ready');
  new ResizeObserver(() => { layout(); if (pinned) hide(true); }).observe(stage);

  if (reducedMotion.matches) {
    setProgress(1);
    return;
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(onScroll); };
  let active = false;
  new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    section.classList.toggle('is-visible', active);
    if (active) schedule();
  }, { rootMargin: '150px 0px' }).observe(section);
  window.addEventListener('scroll', () => { if (active) schedule(); }, { passive: true });
  onScroll();
}

init();
