/* Gráficos SVG propios — sin librerías externas.
 *
 * Reglas fijas del sistema visual:
 *  · marcas delgadas (≤ 24 px), extremo de dato redondeado, base recta
 *  · degradado de cristal por serie: el matiz sigue siendo el de la entidad,
 *    el degradado sólo aporta volumen — nunca codifica magnitud
 *  · separación de 2 px del color de superficie entre marcas contiguas
 *  · rejilla y ejes en línea de 1 px sólida, siempre recesiva
 *  · etiquetas directas selectivas; el texto nunca lleva el color de la serie
 *  · leyenda siempre presente con dos o más series
 *  · toda tarjeta tiene su vista de tabla equivalente
 */

import { h, svg, clear, fmt, fmtCompact, prefersReduced } from './util.js';

export const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5'];

/** Color categórico por posición fija: la identidad sigue a la entidad, nunca al rango. */
export function seriesColor(i) {
  return `var(${SERIES_VARS[i % SERIES_VARS.length]})`;
}

/** Relleno degradado equivalente al color de la ranura. */
export function seriesFill(i) {
  return `url(#simap-grad-${(i % SERIES_VARS.length) + 1})`;
}

const BAR_MAX = 22;
const GAP = 2;
const R = 4;

const DUR_MARK = 720;
const STAGGER = 45;

/* ------------------------------------------- definiciones compartidas --- */

let defsReady = false;

/**
 * Degradados, brillo especular y filtro de resplandor, una sola vez por
 * documento. Los tonos vienen de las variables CSS, así que el cambio de tema
 * los actualiza sin volver a dibujar.
 */
export function ensureDefs() {
  if (defsReady) return;
  defsReady = true;

  const grads = SERIES_VARS.map((v, i) =>
    svg(
      'linearGradient',
      { id: `simap-grad-${i + 1}`, x1: '0', y1: '0', x2: '0.35', y2: '1' },
      svg('stop', { offset: '0%', 'stop-color': `var(${v}-lift)` }),
      svg('stop', { offset: '52%', 'stop-color': `var(${v})` }),
      svg('stop', { offset: '100%', 'stop-color': `var(${v})` })
    )
  );

  const host = svg(
    'svg',
    { id: 'simap-defs', width: '0', height: '0', 'aria-hidden': 'true', focusable: 'false',
      style: 'position:absolute;width:0;height:0;overflow:hidden' },
    svg(
      'defs',
      {},
      grads,
      // Velo especular: la lámina de luz que da el aspecto de cristal.
      svg(
        'linearGradient',
        { id: 'simap-gloss', x1: '0', y1: '0', x2: '0.2', y2: '1' },
        svg('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': '0.42' }),
        svg('stop', { offset: '46%', 'stop-color': '#ffffff', 'stop-opacity': '0.06' }),
        svg('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': '0' })
      ),
      svg(
        'filter',
        { id: 'simap-glow', x: '-30%', y: '-60%', width: '160%', height: '220%' },
        svg('feDropShadow', {
          dx: '0', dy: '0', stdDeviation: '5',
          'flood-color': 'var(--brand)', 'flood-opacity': '0.55',
        })
      )
    )
  );

  document.body.append(host);
}

/* -------------------------------------------------------------- tooltip -- */

let tipEl = null;

function tip() {
  if (!tipEl) {
    tipEl = h('div', { class: 'tip', role: 'presentation' });
    document.body.append(tipEl);
  }
  return tipEl;
}

export function showTip(evt, { title, rows = [], total = null }) {
  const el = tip();
  clear(el);
  el.append(h('div', { class: 'tip__title' }, title));
  for (const r of rows) {
    el.append(
      h(
        'div',
        { class: 'tip__row' },
        h('span', { class: 'tip__key' }, r.color ? h('span', { class: 'tip__dot', style: { background: r.color } }) : null, r.label),
        h('span', { class: 'tip__val' }, r.value)
      )
    );
  }
  if (total) {
    el.append(
      h(
        'div',
        { class: 'tip__row tip__total' },
        h('span', { class: 'tip__key' }, total.label),
        h('span', { class: 'tip__val' }, total.value)
      )
    );
  }
  el.dataset.show = 'true';
  moveTip(evt);
}

export function moveTip(evt) {
  const el = tip();
  const w = el.offsetWidth || 180;
  const hgt = el.offsetHeight || 70;
  let x = Math.min(Math.max(evt.clientX, w / 2 + 8), window.innerWidth - w / 2 - 8);
  let y = evt.clientY - 14;
  const below = y - hgt < 14;
  if (below) y = evt.clientY + 6;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.transform = `translate(-50%, ${below ? '10px' : '-100%'}) scale(1)`;
}

export function hideTip() {
  if (tipEl) {
    tipEl.dataset.show = 'false';
    tipEl.style.transform = tipEl.style.transform.replace(/scale\([^)]*\)/, 'scale(0.94)');
  }
}

/* ---------------------------------------------------- foco interactivo -- */

/**
 * Conecta una zona sensible con su fila: realza la marca señalada y atenúa
 * las demás. El área activa siempre supera los 24 px de alto.
 */
function bindRow(root, hit, row, tipData) {
  const enter = (e) => {
    root.classList.add('is-hovering');
    row.classList.add('is-active');
    showTip(e, tipData());
  };
  const leave = () => {
    root.classList.remove('is-hovering');
    row.classList.remove('is-active');
    hideTip();
  };
  hit.addEventListener('mouseenter', enter);
  hit.addEventListener('mousemove', moveTip);
  hit.addEventListener('mouseleave', leave);
  hit.addEventListener('focus', (e) => {
    const b = hit.getBoundingClientRect();
    enter({ clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 });
  });
  hit.addEventListener('blur', leave);
  hit.setAttribute('tabindex', '0');
  hit.setAttribute('role', 'img');
}

/* ---------------------------------------------------------- animación -- */

function grow(el, { axis = 'x', delay = 0, animate = true }) {
  if (!animate || prefersReduced() || !el.animate) return;
  el.style.transformBox = 'fill-box';
  el.style.transformOrigin = axis === 'x' ? '0% 50%' : '50% 100%';
  el.animate(
    [
      { transform: axis === 'x' ? 'scaleX(0.001)' : 'scaleY(0.001)', opacity: 0.35 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: DUR_MARK, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
  );
}

function fadeUp(el, { delay = 0, animate = true, dy = 6 } = {}) {
  if (!animate || prefersReduced() || !el.animate) return;
  el.animate(
    [
      { opacity: 0, transform: `translateY(${dy}px)` },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 460, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
  );
}

/* ------------------------------------------------------------ geometría -- */

function barPath(x, y, w, hgt, side) {
  const r = Math.max(0, Math.min(R, side === 'right' || side === 'left' ? w : hgt, (side === 'top' || side === 'bottom' ? w : hgt) / 2));
  if (r < 0.6) return `M${x},${y}h${w}v${hgt}h${-w}Z`;
  if (side === 'right') {
    return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${hgt - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}Z`;
  }
  if (side === 'left') {
    return `M${x + w},${y}h${-(w - r)}a${r},${r} 0 0 0 ${-r},${r}v${hgt - 2 * r}a${r},${r} 0 0 0 ${r},${r}h${w - r}Z`;
  }
  if (side === 'top') {
    return `M${x},${y + hgt}v${-(hgt - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${hgt - r}Z`;
  }
  return `M${x},${y}v${hgt - r}a${r},${r} 0 0 0 ${r},${r}h${w - 2 * r}a${r},${r} 0 0 0 ${r},${-r}v${-(hgt - r)}Z`;
}

/** Marca de cristal: relleno degradado más su velo especular. */
function glassMark(d, fill) {
  return [
    svg('path', { class: 'chart__mark', d, fill }),
    svg('path', { class: 'chart__gloss', d, fill: 'url(#simap-gloss)', 'pointer-events': 'none' }),
  ];
}

export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

function textWidth(s, size = 11) {
  return String(s).length * size * 0.58;
}

let probe = null;

/**
 * Tinta legible sobre un relleno de color.
 * Es la única excepción a «el texto nunca lleva el color de la serie»: una
 * etiqueta dentro de la marca elige blanco o negro según la luminancia real
 * del relleno, de modo que siempre cumpla contraste en ambos temas.
 */
function inkOn(cssColor) {
  if (!probe) {
    probe = h('span', { style: { position: 'absolute', opacity: '0', pointerEvents: 'none' } });
    document.body.append(probe);
  }
  probe.style.color = '';
  probe.style.color = cssColor;
  const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color);
  if (!m) return '#ffffff';
  const [r, g, b] = m[1].split(',').map((v) => parseFloat(v) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contraste frente a blanco y frente a la tinta oscura; gana el mayor.
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#ffffff' : '#0d1014';
}

/* ------------------------------------------------- barras horizontales -- */

export function barsH(host, { rows, unidad = 'unidades', slot = 0, maxLabel = 30, animate = true }) {
  ensureDefs();
  clear(host);
  if (!rows.length) return emptyState(host);

  const rowH = 31;
  const padT = 8;
  const padB = 26;
  const labelW = Math.min(230, Math.max(120, ...rows.map((r) => Math.min(maxLabel, String(r.key).length) * 6.6 + 12)));
  const valueW = 64;
  const width = Math.max(host.clientWidth || 640, 420);
  const plotW = Math.max(90, width - labelW - valueW);
  const height = padT + rows.length * rowH + padB;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const ticks = niceTicks(max);
  const scale = (v) => (v / ticks[ticks.length - 1]) * plotW;

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-label': `Barras: ${rows.length} categorías, máximo ${fmt(max)} ${unidad}`,
  });

  for (const t of ticks) {
    const x = labelW + scale(t);
    root.append(svg('line', { class: 'chart__grid', x1: x, y1: padT, x2: x, y2: padT + rows.length * rowH }));
    root.append(svg('text', { class: 'chart__tick', x, y: height - 9, 'text-anchor': 'middle' }, fmtCompact(t)));
  }
  root.append(svg('line', { class: 'chart__axis', x1: labelW, y1: padT, x2: labelW, y2: padT + rows.length * rowH }));

  rows.forEach((r, i) => {
    const bh = Math.min(BAR_MAX, rowH - 8);
    const y = padT + i * rowH + (rowH - bh) / 2;
    const w = Math.max(r.value > 0 ? 2 : 0, scale(r.value));
    const label = String(r.key);
    const shown = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
    const fill = r.slot !== undefined ? seriesFill(r.slot) : seriesFill(slot);
    const swatch = r.slot !== undefined ? seriesColor(r.slot) : seriesColor(slot);

    const marks = glassMark(barPath(labelW, y, w, bh, 'right'), fill);
    const val = svg('text', { class: 'chart__val', x: labelW + w + 9, y: y + bh / 2 + 4 }, fmt(r.value));
    const hit = svg('rect', { class: 'chart__hit', x: 0, y: padT + i * rowH, width: labelW + plotW + valueW, height: rowH });

    const row = svg(
      'g',
      { class: 'chart__row' },
      svg('text', { class: 'chart__cat', x: labelW - 11, y: y + bh / 2 + 4, 'text-anchor': 'end' }, shown, svg('title', {}, label)),
      marks,
      val,
      hit
    );

    marks.forEach((m) => grow(m, { axis: 'x', delay: i * STAGGER, animate }));
    fadeUp(val, { delay: i * STAGGER + 220, animate });

    bindRow(root, hit, row, () => ({
      title: label,
      rows: [{ label: unidad, value: fmt(r.value), color: swatch }, ...(r.extra || [])],
    }));

    root.append(row);
  });

  host.append(root);
}

/* -------------------------------------------- barras apiladas por serie -- */

export function stackedBarsH(host, { rows, series, unidad = 'unidades', maxLabel = 34, animate = true }) {
  ensureDefs();
  clear(host);
  if (!rows.length || !series.length) return emptyState(host);

  const rowH = 33;
  const padT = 8;
  const padB = 26;
  const labelW = Math.min(250, Math.max(130, ...rows.map((r) => Math.min(maxLabel, String(r.key).length) * 6.6 + 12)));
  const valueW = 68;
  const width = Math.max(host.clientWidth || 700, 460);
  const plotW = Math.max(100, width - labelW - valueW);
  const height = padT + rows.length * rowH + padB;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const ticks = niceTicks(max);
  const scale = (v) => (v / ticks[ticks.length - 1]) * plotW;

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-label': `Barras apiladas por ${series.map((s) => s.nombre).join(', ')}`,
  });

  for (const t of ticks) {
    const x = labelW + scale(t);
    root.append(svg('line', { class: 'chart__grid', x1: x, y1: padT, x2: x, y2: padT + rows.length * rowH }));
    root.append(svg('text', { class: 'chart__tick', x, y: height - 9, 'text-anchor': 'middle' }, fmtCompact(t)));
  }
  root.append(svg('line', { class: 'chart__axis', x1: labelW, y1: padT, x2: labelW, y2: padT + rows.length * rowH }));

  rows.forEach((r, i) => {
    const bh = Math.min(BAR_MAX, rowH - 10);
    const y = padT + i * rowH + (rowH - bh) / 2;
    const label = String(r.key);
    const shown = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
    const active = series.filter((s) => (r.parts[s.id] || 0) > 0);

    const segsG = svg('g', { class: 'chart__segs' });
    let x = labelW;
    active.forEach((s, k) => {
      const v = r.parts[s.id] || 0;
      const isLast = k === active.length - 1;
      // El hueco de 2 px lo aporta la superficie: nunca un borde dibujado.
      const raw = scale(v);
      const w = Math.max(1.5, isLast ? raw : raw - GAP);
      segsG.append(...glassMark(barPath(x, y, w, bh, isLast ? 'right' : 'square'), s.fill));
      x += raw;
    });

    const val = svg('text', { class: 'chart__val', x: labelW + scale(r.total) + 9, y: y + bh / 2 + 4 }, fmt(r.total));
    const hit = svg('rect', { class: 'chart__hit', x: 0, y: padT + i * rowH, width: labelW + plotW + valueW, height: rowH });

    const row = svg(
      'g',
      { class: 'chart__row' },
      svg('text', { class: 'chart__cat', x: labelW - 11, y: y + bh / 2 + 4, 'text-anchor': 'end' }, shown, svg('title', {}, label)),
      segsG,
      val,
      hit
    );

    grow(segsG, { axis: 'x', delay: i * STAGGER, animate });
    fadeUp(val, { delay: i * STAGGER + 240, animate });

    bindRow(root, hit, row, () => ({
      title: label,
      rows: active.map((s) => ({ label: s.nombre, value: fmt(r.parts[s.id]), color: s.color })),
      total: { label: `Total ${unidad}`, value: fmt(r.total) },
    }));

    root.append(row);
  });

  host.append(root);
}

/* ----------------------------------------------- reparto 100 % en línea -- */

export function shareBar(host, { parts, unidad = 'unidades', animate = true }) {
  ensureDefs();
  clear(host);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return emptyState(host);

  const width = Math.max(host.clientWidth || 600, 360);
  const bh = 52;
  const height = bh + 36;
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-label': 'Reparto porcentual entre sedes',
  });

  let x = 0;
  parts.forEach((p, i) => {
    const raw = (p.value / total) * width;
    const isLast = i === parts.length - 1;
    const w = Math.max(1.5, isLast ? raw : raw - GAP);
    const pct = (p.value / total) * 100;

    const marks = glassMark(barPath(x, 0, w, bh, i === 0 ? 'left' : isLast ? 'right' : 'square'), p.fill);
    const seg = svg('g', { class: 'chart__row' }, marks);

    // Sólo se rotula dentro del segmento si el texto cabe con holgura.
    const txt = `${pct.toFixed(1)}%`;
    if (w > textWidth(txt, 11) + 20) {
      const t = svg(
        'text',
        { class: 'chart__inlabel', x: x + w / 2, y: bh / 2 + 4, 'text-anchor': 'middle', fill: inkOn(p.color) },
        txt
      );
      seg.append(t);
      fadeUp(t, { delay: 260 + i * 90, animate });
    }
    const nameW = textWidth(p.nombre, 11);
    if (raw > nameW + 12) {
      const n = svg('text', { class: 'chart__cat', x: x + raw / 2, y: bh + 20, 'text-anchor': 'middle' }, p.nombre);
      seg.append(n);
      fadeUp(n, { delay: 300 + i * 90, animate });
    }

    const hit = svg('rect', { class: 'chart__hit', x, y: 0, width: Math.max(raw, 6), height: bh + 26 });
    seg.append(hit);

    marks.forEach((m) => grow(m, { axis: 'x', delay: i * 110, animate }));

    bindRow(root, hit, seg, () => ({
      title: p.nombre,
      rows: [
        { label: unidad, value: fmt(p.value), color: p.color },
        { label: 'Participación', value: `${pct.toFixed(1)} %` },
      ],
      total: { label: 'Total', value: fmt(total) },
    }));

    root.append(seg);
    x += raw;
  });

  host.append(root);
}

/* ---------------------------------------------------------- columnas ---- */

export function columns(host, { rows, unidad = 'unidades', slot = 0, animate = true }) {
  ensureDefs();
  clear(host);
  if (!rows.length) return emptyState(host);

  const width = Math.max(host.clientWidth || 640, 420);
  const padL = 48;
  const padR = 14;
  const padT = 24;
  const plotH = 190;
  const plotW = width - padL - padR;
  const band = plotW / rows.length;
  // Con bandas estrechas las fechas se giran en vez de pisarse unas a otras.
  const rotate = band < Math.max(...rows.map((r) => String(r.label).length)) * 6.4;
  const axisH = rotate ? 62 : 34;
  const height = padT + plotH + axisH;
  const bw = Math.min(BAR_MAX, Math.max(6, band - 14));
  const max = Math.max(...rows.map((r) => r.value), 1);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const yOf = (v) => padT + plotH - (v / top) * plotH;

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-label': `Columnas: ${unidad} por periodo`,
  });

  for (const t of ticks) {
    const y = yOf(t);
    root.append(svg('line', { class: 'chart__grid', x1: padL, y1: y, x2: width - padR, y2: y }));
    root.append(svg('text', { class: 'chart__tick', x: padL - 9, y: y + 3.5, 'text-anchor': 'end' }, fmtCompact(t)));
  }
  root.append(svg('line', { class: 'chart__axis', x1: padL, y1: padT + plotH, x2: width - padR, y2: padT + plotH }));

  const peak = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);

  rows.forEach((r, i) => {
    const cx = padL + band * i + band / 2;
    const x = cx - bw / 2;
    const y = yOf(r.value);
    const bh = Math.max(r.value > 0 ? 2 : 0, padT + plotH - y);
    const marks = glassMark(barPath(x, y, bw, bh, 'top'), seriesFill(slot));
    const hit = svg('rect', { class: 'chart__hit', x: padL + band * i, y: padT, width: band, height: plotH + axisH });

    const col = svg(
      'g',
      { class: 'chart__row' },
      marks,
      // Etiqueta directa sólo en el máximo: el resto lo llevan el eje y el tooltip.
      r === peak ? svg('text', { class: 'chart__val', x: cx, y: y - 9, 'text-anchor': 'middle' }, fmt(r.value)) : null,
      rotate
        ? svg(
            'text',
            { class: 'chart__tick', x: cx, y: padT + plotH + 14, 'text-anchor': 'end', transform: `rotate(-42 ${cx} ${padT + plotH + 14})` },
            r.label
          )
        : svg('text', { class: 'chart__tick', x: cx, y: padT + plotH + 16, 'text-anchor': 'middle' }, r.label),
      hit
    );

    marks.forEach((m) => grow(m, { axis: 'y', delay: i * (STAGGER - 10), animate }));

    bindRow(root, hit, col, () => ({
      title: r.title || r.label,
      rows: [{ label: unidad, value: fmt(r.value), color: seriesColor(slot) }, ...(r.extra || [])],
    }));

    root.append(col);
  });

  host.append(root);
}

/* -------------------------------------------------------------- área ---- */

export function areaLine(host, { points, unidad = 'unidades', slot = 0, animate = true }) {
  ensureDefs();
  clear(host);
  if (points.length < 2) return emptyState(host);

  const width = Math.max(host.clientWidth || 640, 420);
  const padL = 52;
  const padR = 60;
  const padT = 22;
  const plotH = 172;
  const axisH = 34;
  const height = padT + plotH + axisH;
  const plotW = width - padL - padR;
  const max = Math.max(...points.map((p) => p.value), 1);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const xOf = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yOf = (v) => padT + plotH - (v / top) * plotH;
  const color = seriesColor(slot);

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-label': `Acumulado de ${unidad}`,
  });

  for (const t of ticks) {
    const y = yOf(t);
    root.append(svg('line', { class: 'chart__grid', x1: padL, y1: y, x2: padL + plotW, y2: y }));
    root.append(svg('text', { class: 'chart__tick', x: padL - 9, y: y + 3.5, 'text-anchor': 'end' }, fmtCompact(t)));
  }
  root.append(svg('line', { class: 'chart__axis', x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH }));

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i)},${yOf(p.value)}`).join('');

  const fillPath = svg('path', {
    d: `${line}L${xOf(points.length - 1)},${padT + plotH}L${xOf(0)},${padT + plotH}Z`,
    fill: seriesFill(slot),
    'fill-opacity': 0.16,
  });
  const linePath = svg('path', {
    d: line,
    fill: 'none',
    stroke: color,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });
  root.append(fillPath, linePath);

  // Trazo progresivo: la línea se dibuja de izquierda a derecha.
  if (animate && !prefersReduced() && linePath.getTotalLength) {
    const len = linePath.getTotalLength();
    linePath.style.strokeDasharray = `${len}`;
    linePath.style.strokeDashoffset = `${len}`;
    linePath.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 1100,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both',
    });
    fadeUp(fillPath, { delay: 200, animate, dy: 14 });
  }

  const cursor = svg('g', { class: 'chart__cursor', opacity: '0', 'pointer-events': 'none' });
  const cLine = svg('line', { class: 'chart__grid', y1: padT, y2: padT + plotH, stroke: color, 'stroke-opacity': '0.5' });
  const cDot = svg('circle', { r: 5.5, fill: color, stroke: 'var(--paper)', 'stroke-width': 2.5 });
  cursor.append(cLine, cDot);

  const last = points[points.length - 1];
  const endDot = svg('circle', { cx: xOf(points.length - 1), cy: yOf(last.value), r: 4.5, fill: color, stroke: 'var(--paper)', 'stroke-width': 2 });
  const endVal = svg('text', { class: 'chart__val', x: xOf(points.length - 1) + 11, y: yOf(last.value) + 4 }, fmt(last.value));
  root.append(endDot, endVal);
  fadeUp(endDot, { delay: 900, animate });
  fadeUp(endVal, { delay: 980, animate });

  const step = Math.ceil(points.length / 6);
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      root.append(svg('text', { class: 'chart__tick', x: xOf(i), y: padT + plotH + 17, 'text-anchor': 'middle' }, p.label));
    }
  });

  root.append(cursor);

  // Capa de punto más cercano: no hay que acertar sobre el vértice.
  const hw = plotW / points.length;
  points.forEach((p, i) => {
    const hit = svg('rect', { class: 'chart__hit', x: xOf(i) - hw / 2, y: padT, width: Math.max(hw, 24), height: plotH });
    const show = (e) => {
      cursor.setAttribute('opacity', '1');
      cLine.setAttribute('x1', xOf(i));
      cLine.setAttribute('x2', xOf(i));
      cDot.setAttribute('cx', xOf(i));
      cDot.setAttribute('cy', yOf(p.value));
      showTip(e, { title: p.title || p.label, rows: [{ label: unidad, value: fmt(p.value), color }] });
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', () => {
      cursor.setAttribute('opacity', '0');
      hideTip();
    });
    hit.addEventListener('focus', () => {
      const b = hit.getBoundingClientRect();
      show({ clientX: b.left + b.width / 2, clientY: b.top + 20 });
    });
    hit.addEventListener('blur', () => {
      cursor.setAttribute('opacity', '0');
      hideTip();
    });
    hit.setAttribute('tabindex', '0');
    root.append(hit);
  });

  host.append(root);
}

/* ------------------------------------------------------------- leyenda -- */

export function legend(series, { line = false } = {}) {
  return h(
    'div',
    { class: 'legend', role: 'list' },
    series.map((s, i) =>
      h(
        'span',
        { class: 'legend__item', role: 'listitem', style: { '--i': i } },
        h('span', {
          class: `legend__swatch ${line ? 'legend__swatch--line' : ''}`,
          style: { background: `linear-gradient(150deg, ${s.colorLift || s.color}, ${s.color})` },
        }),
        s.nombre
      )
    )
  );
}

function emptyState(host) {
  host.append(h('div', { class: 'chart-empty' }, 'Sin datos para el filtro aplicado.'));
}

/* -------------------------------------------------------- tarjeta base -- */

/**
 * Tarjeta de gráfico con su gemela en tabla.
 * La tabla es la vía de lectura garantizada: ningún valor depende del tooltip
 * ni del color, que es además el alivio exigido por los tonos claros.
 */
export function chartCard({ title, sub, span = 'col-6', legendEl, render, table, note, index = 0 }) {
  const body = h('div', { class: 'card__body' });
  const plot = h('div', {});
  const tableWrap = h('div', { class: 'table-wrap hidden' });
  let showingTable = false;
  let drawn = false;

  const toggle = h('button', { class: 'btn btn--sm', type: 'button', 'aria-pressed': 'false' }, 'Ver tabla');

  const draw = ({ animate = false } = {}) => {
    if (showingTable) return;
    render(plot, { animate });
    drawn = true;
  };

  toggle.addEventListener('click', () => {
    showingTable = !showingTable;
    toggle.textContent = showingTable ? 'Ver gráfico' : 'Ver tabla';
    toggle.setAttribute('aria-pressed', String(showingTable));
    plot.classList.toggle('hidden', showingTable);
    if (legendEl) legendEl.classList.toggle('hidden', showingTable);
    tableWrap.classList.toggle('hidden', !showingTable);
    if (showingTable) {
      clear(tableWrap).append(table());
      tableWrap.classList.remove('swap-in');
      void tableWrap.offsetWidth;
      tableWrap.classList.add('swap-in');
    } else {
      draw({ animate: true });
      plot.classList.remove('swap-in');
      void plot.offsetWidth;
      plot.classList.add('swap-in');
    }
  });

  if (legendEl) body.append(legendEl);
  body.append(plot, tableWrap);
  if (note) body.append(h('p', { class: 'small muted', style: { marginTop: '13px' } }, note));

  const card = h(
    'section',
    { class: `card glass reveal ${span}`, style: { '--i': index } },
    h(
      'header',
      { class: 'card__head' },
      h('div', {}, h('h3', { class: 'card__title' }, title), sub ? h('div', { class: 'card__sub' }, sub) : null),
      h('div', { class: 'chart-tools' }, toggle)
    ),
    body
  );

  card._redraw = () => draw({ animate: false });
  // El primer trazo se anima cuando la tarjeta entra en pantalla.
  card._firstDraw = () => {
    if (!drawn) draw({ animate: true });
  };
  return card;
}

/** Tabla simple a partir de columnas declaradas. */
export function simpleTable(cols, rows, footer) {
  return h(
    'table',
    { class: 'data' },
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.num ? 'n' : '' }, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c) => h('td', { class: c.num ? 'n' : 'wrap' }, c.get(r)))))),
    footer ? h('tfoot', {}, h('tr', {}, cols.map((c) => h('td', { class: c.num ? 'n' : '' }, footer[c.key] ?? '')))) : null
  );
}

/**
 * Redibuja los gráficos cuando cambia el ancho disponible o el tema (sin
 * re-animar). El cambio de tema importa porque la tinta de las etiquetas
 * interiores se elige a partir de la luminancia real del relleno.
 */
export function observeResize(root) {
  let last = root.clientWidth;
  let raf = 0;

  const redraw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // Al rehacer el trazo desaparece la marca señalada: el globo debe irse con ella.
      hideTip();
      for (const card of root.querySelectorAll('.card')) {
        if (typeof card._redraw === 'function') card._redraw();
      }
    });
  };

  const ro = new ResizeObserver(() => {
    if (Math.abs(root.clientWidth - last) < 2) return;
    last = root.clientWidth;
    redraw();
  });
  ro.observe(root);
  window.addEventListener('simap:redraw', redraw);

  return () => {
    ro.disconnect();
    window.removeEventListener('simap:redraw', redraw);
  };
}
