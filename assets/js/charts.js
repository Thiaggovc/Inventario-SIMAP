/* Gráficos SVG propios — sin librerías externas.
 *
 * Reglas fijas del sistema visual:
 *  · marcas delgadas (≤ 24 px), extremo de dato redondeado 4 px, base recta
 *  · separación de 2 px del color de superficie entre marcas contiguas
 *  · rejilla y ejes en línea de 1 px sólida, siempre recesiva
 *  · etiquetas directas selectivas; el texto nunca lleva el color de la serie
 *  · leyenda siempre presente con dos o más series
 *  · toda tarjeta tiene su vista de tabla equivalente
 */

import { h, svg, clear, fmt, fmtCompact } from './util.js';

export const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5'];

/** Color categórico por posición fija: la identidad sigue a la entidad, nunca al rango. */
export function seriesColor(i) {
  return `var(${SERIES_VARS[i % SERIES_VARS.length]})`;
}

const BAR_MAX = 22;
const GAP = 2;
const R = 4;

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
        h(
          'span',
          { class: 'tip__key' },
          r.color ? h('span', { class: 'tip__dot', style: { background: r.color } }) : null,
          r.label
        ),
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
  const pad = 14;
  const w = el.offsetWidth || 180;
  const hgt = el.offsetHeight || 70;
  let x = evt.clientX;
  let y = evt.clientY - 12;
  x = Math.min(Math.max(x, w / 2 + 6), window.innerWidth - w / 2 - 6);
  if (y - hgt < pad) {
    el.style.transform = 'translate(-50%, 14px)';
    y = evt.clientY;
  } else {
    el.style.transform = 'translate(-50%, -100%)';
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function hideTip() {
  if (tipEl) tipEl.dataset.show = 'false';
}

/* ------------------------------------------------------------ geometría -- */

/** Rectángulo con las esquinas del extremo de dato redondeadas. */
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

/** Marcas de eje en números redondos. */
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

/** Ancho aproximado del texto, para no dibujar etiquetas que no caben. */
function textWidth(s, size = 11) {
  return String(s).length * size * 0.58;
}

/* ------------------------------------------------- barras horizontales -- */

/**
 * Barras horizontales de una sola serie (magnitud por categoría nominal).
 * Todas las barras comparten el color de la ranura 1: la longitud ya codifica
 * el valor, así que el matiz no vuelve a codificarlo.
 */
export function barsH(host, { rows, unidad = 'unidades', color = seriesColor(0), maxLabel = 30 }) {
  clear(host);
  if (!rows.length) return emptyState(host);

  const rowH = 30;
  const padT = 8;
  const padB = 26;
  const labelW = Math.min(230, Math.max(120, ...rows.map((r) => Math.min(maxLabel, String(r.key).length) * 6.6 + 12)));
  const valueW = 62;
  const width = Math.max(host.clientWidth || 640, 420);
  const plotW = Math.max(90, width - labelW - valueW);
  const height = padT + rows.length * rowH + padB;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const ticks = niceTicks(max);
  const scale = (v) => (v / ticks[ticks.length - 1]) * plotW;

  const g = [];

  for (const t of ticks) {
    const x = labelW + scale(t);
    g.push(svg('line', { class: 'chart__grid', x1: x, y1: padT, x2: x, y2: padT + rows.length * rowH }));
    g.push(svg('text', { class: 'chart__tick', x, y: height - 9, 'text-anchor': 'middle' }, fmtCompact(t)));
  }
  g.push(
    svg('line', {
      class: 'chart__axis',
      x1: labelW,
      y1: padT,
      x2: labelW,
      y2: padT + rows.length * rowH,
    })
  );

  rows.forEach((r, i) => {
    const bh = Math.min(BAR_MAX, rowH - 8);
    const y = padT + i * rowH + (rowH - bh) / 2;
    const w = Math.max(r.value > 0 ? 2 : 0, scale(r.value));
    const label = String(r.key);
    const shown = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;

    const row = svg(
      'g',
      { class: 'chart__row' },
      svg(
        'text',
        { class: 'chart__cat', x: labelW - 10, y: y + bh / 2 + 4, 'text-anchor': 'end' },
        shown,
        svg('title', {}, label)
      ),
      svg('path', { class: 'chart__mark', d: barPath(labelW, y, w, bh, 'right'), fill: r.color || color }),
      svg('text', { class: 'chart__val', x: labelW + w + 8, y: y + bh / 2 + 4 }, fmt(r.value)),
      svg('rect', {
        class: 'chart__hit',
        x: 0,
        y: padT + i * rowH,
        width: labelW + plotW + valueW,
        height: rowH,
      })
    );
    const hit = row.lastChild;
    hit.addEventListener('mouseenter', (e) =>
      showTip(e, {
        title: label,
        rows: [{ label: unidad, value: fmt(r.value), color: r.color || color }, ...(r.extra || [])],
      })
    );
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', hideTip);
    g.push(row);
  });

  host.append(
    svg('svg', {
      class: 'chart',
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: 'img',
      'aria-label': `Barras: ${rows.length} categorías, máximo ${fmt(max)} ${unidad}`,
    }, g)
  );
}

/* -------------------------------------------- barras apiladas por serie -- */

export function stackedBarsH(host, { rows, series, unidad = 'unidades', maxLabel = 34 }) {
  clear(host);
  if (!rows.length || !series.length) return emptyState(host);

  const rowH = 32;
  const padT = 8;
  const padB = 26;
  const labelW = Math.min(250, Math.max(130, ...rows.map((r) => Math.min(maxLabel, String(r.key).length) * 6.6 + 12)));
  const valueW = 66;
  const width = Math.max(host.clientWidth || 700, 460);
  const plotW = Math.max(100, width - labelW - valueW);
  const height = padT + rows.length * rowH + padB;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const ticks = niceTicks(max);
  const scale = (v) => (v / ticks[ticks.length - 1]) * plotW;

  const g = [];
  for (const t of ticks) {
    const x = labelW + scale(t);
    g.push(svg('line', { class: 'chart__grid', x1: x, y1: padT, x2: x, y2: padT + rows.length * rowH }));
    g.push(svg('text', { class: 'chart__tick', x, y: height - 9, 'text-anchor': 'middle' }, fmtCompact(t)));
  }
  g.push(svg('line', { class: 'chart__axis', x1: labelW, y1: padT, x2: labelW, y2: padT + rows.length * rowH }));

  rows.forEach((r, i) => {
    const bh = Math.min(BAR_MAX, rowH - 9);
    const y = padT + i * rowH + (rowH - bh) / 2;
    const label = String(r.key);
    const shown = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
    const active = series.filter((s) => (r.parts[s.id] || 0) > 0);

    const segs = [];
    let x = labelW;
    active.forEach((s, k) => {
      const v = r.parts[s.id] || 0;
      const isLast = k === active.length - 1;
      // El hueco de 2 px lo aporta la superficie: nunca un borde dibujado.
      const raw = scale(v);
      const w = Math.max(1.5, isLast ? raw : raw - GAP);
      segs.push(
        svg('path', {
          class: 'chart__mark',
          d: barPath(x, y, w, bh, isLast ? 'right' : 'square'),
          fill: s.color,
        })
      );
      x += raw;
    });

    const row = svg(
      'g',
      { class: 'chart__row' },
      svg('text', { class: 'chart__cat', x: labelW - 10, y: y + bh / 2 + 4, 'text-anchor': 'end' }, shown, svg('title', {}, label)),
      segs,
      svg('text', { class: 'chart__val', x: labelW + scale(r.total) + 8, y: y + bh / 2 + 4 }, fmt(r.total)),
      svg('rect', { class: 'chart__hit', x: 0, y: padT + i * rowH, width: labelW + plotW + valueW, height: rowH })
    );
    const hit = row.lastChild;
    hit.addEventListener('mouseenter', (e) =>
      showTip(e, {
        title: label,
        rows: series
          .filter((s) => (r.parts[s.id] || 0) > 0)
          .map((s) => ({ label: s.nombre, value: fmt(r.parts[s.id]), color: s.color })),
        total: { label: `Total ${unidad}`, value: fmt(r.total) },
      })
    );
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', hideTip);
    g.push(row);
  });

  host.append(
    svg('svg', {
      class: 'chart',
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: 'img',
      'aria-label': `Barras apiladas por ${series.map((s) => s.nombre).join(', ')}`,
    }, g)
  );
}

/* ----------------------------------------------- reparto 100 % en línea -- */

/** Una sola barra parte-del-todo, con etiqueta directa en cada segmento que quepa. */
export function shareBar(host, { parts, unidad = 'unidades' }) {
  clear(host);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return emptyState(host);

  const width = Math.max(host.clientWidth || 600, 360);
  const bh = 42;
  const height = bh + 34;
  const g = [];
  let x = 0;

  parts.forEach((p, i) => {
    const raw = (p.value / total) * width;
    const isLast = i === parts.length - 1;
    const w = Math.max(1.5, isLast ? raw : raw - GAP);
    const pct = (p.value / total) * 100;
    const seg = svg('g', { class: 'chart__row' });
    seg.append(
      svg('path', {
        class: 'chart__mark',
        d: barPath(x, 0, w, bh, i === 0 ? 'left' : isLast ? 'right' : 'square'),
        fill: p.color,
      })
    );

    // Sólo se rotula dentro del segmento si el texto cabe con holgura.
    const txt = `${pct.toFixed(1)}%`;
    if (w > textWidth(txt, 11) + 18) {
      seg.append(
        svg(
          'text',
          {
            class: 'chart__inlabel',
            x: x + w / 2,
            y: bh / 2 + 4,
            'text-anchor': 'middle',
            fill: p.onDark === false ? 'var(--ink)' : '#ffffff',
          },
          txt
        )
      );
    }
    const nameW = textWidth(p.nombre, 11);
    if (raw > nameW + 10) {
      seg.append(
        svg('text', { class: 'chart__cat', x: x + raw / 2, y: bh + 18, 'text-anchor': 'middle' }, p.nombre)
      );
    }
    seg.append(svg('rect', { class: 'chart__hit', x, y: 0, width: Math.max(raw, 6), height: bh + 24 }));
    const hit = seg.lastChild;
    hit.addEventListener('mouseenter', (e) =>
      showTip(e, {
        title: p.nombre,
        rows: [
          { label: unidad, value: fmt(p.value), color: p.color },
          { label: 'Participación', value: `${pct.toFixed(1)}%` },
        ],
        total: { label: 'Total', value: fmt(total) },
      })
    );
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', hideTip);
    g.push(seg);
    x += raw;
  });

  host.append(
    svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Reparto porcentual' }, g)
  );
}

/* ---------------------------------------------------------- columnas ---- */

/** Columnas sobre eje temporal ordenado (una serie). */
export function columns(host, { rows, unidad = 'unidades', color = seriesColor(0) }) {
  clear(host);
  if (!rows.length) return emptyState(host);

  const width = Math.max(host.clientWidth || 640, 420);
  const padL = 46;
  const padR = 14;
  const padT = 22;
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

  const g = [];
  for (const t of ticks) {
    const y = yOf(t);
    g.push(svg('line', { class: 'chart__grid', x1: padL, y1: y, x2: width - padR, y2: y }));
    g.push(svg('text', { class: 'chart__tick', x: padL - 8, y: y + 3.5, 'text-anchor': 'end' }, fmtCompact(t)));
  }
  g.push(svg('line', { class: 'chart__axis', x1: padL, y1: padT + plotH, x2: width - padR, y2: padT + plotH }));

  const peak = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);

  rows.forEach((r, i) => {
    const cx = padL + band * i + band / 2;
    const x = cx - bw / 2;
    const y = yOf(r.value);
    const bh = Math.max(r.value > 0 ? 2 : 0, padT + plotH - y);
    const col = svg(
      'g',
      { class: 'chart__row' },
      svg('path', { class: 'chart__mark', d: barPath(x, y, bw, bh, 'top'), fill: r.color || color }),
      // Etiqueta directa sólo en el máximo: el resto lo llevan el eje y el tooltip.
      r === peak ? svg('text', { class: 'chart__val', x: cx, y: y - 7, 'text-anchor': 'middle' }, fmt(r.value)) : null,
      rotate
        ? svg(
            'text',
            {
              class: 'chart__tick',
              x: cx,
              y: padT + plotH + 14,
              'text-anchor': 'end',
              transform: `rotate(-42 ${cx} ${padT + plotH + 14})`,
            },
            r.label
          )
        : svg('text', { class: 'chart__tick', x: cx, y: padT + plotH + 16, 'text-anchor': 'middle' }, r.label),
      svg('rect', { class: 'chart__hit', x: padL + band * i, y: padT, width: band, height: plotH + axisH })
    );
    const hit = col.lastChild;
    hit.addEventListener('mouseenter', (e) =>
      showTip(e, {
        title: r.title || r.label,
        rows: [{ label: unidad, value: fmt(r.value), color: r.color || color }, ...(r.extra || [])],
      })
    );
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', hideTip);
    g.push(col);
  });

  host.append(
    svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `Columnas: ${unidad} por periodo` }, g)
  );
}

/* -------------------------------------------------------------- área ---- */

/** Serie acumulada: línea de 2 px, relleno al 10 %, punto final marcado. */
export function areaLine(host, { points, unidad = 'unidades', color = seriesColor(0) }) {
  clear(host);
  if (points.length < 2) return emptyState(host);

  const width = Math.max(host.clientWidth || 640, 420);
  const padL = 50;
  const padR = 58;
  const padT = 20;
  const plotH = 170;
  const axisH = 34;
  const height = padT + plotH + axisH;
  const plotW = width - padL - padR;
  const max = Math.max(...points.map((p) => p.value), 1);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const xOf = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yOf = (v) => padT + plotH - (v / top) * plotH;

  const g = [];
  for (const t of ticks) {
    const y = yOf(t);
    g.push(svg('line', { class: 'chart__grid', x1: padL, y1: y, x2: padL + plotW, y2: y }));
    g.push(svg('text', { class: 'chart__tick', x: padL - 8, y: y + 3.5, 'text-anchor': 'end' }, fmtCompact(t)));
  }
  g.push(svg('line', { class: 'chart__axis', x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH }));

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i)},${yOf(p.value)}`).join('');
  g.push(
    svg('path', {
      d: `${line}L${xOf(points.length - 1)},${padT + plotH}L${xOf(0)},${padT + plotH}Z`,
      fill: color,
      'fill-opacity': 0.1,
    })
  );
  g.push(svg('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  const last = points[points.length - 1];
  g.push(
    svg('circle', {
      cx: xOf(points.length - 1),
      cy: yOf(last.value),
      r: 4.5,
      fill: color,
      stroke: 'var(--paper)',
      'stroke-width': 2,
    })
  );
  g.push(
    svg('text', { class: 'chart__val', x: xOf(points.length - 1) + 10, y: yOf(last.value) + 4 }, fmt(last.value))
  );

  const step = Math.ceil(points.length / 6);
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      g.push(svg('text', { class: 'chart__tick', x: xOf(i), y: padT + plotH + 17, 'text-anchor': 'middle' }, p.label));
    }
    const hw = plotW / points.length;
    const hit = svg('rect', { class: 'chart__hit', x: xOf(i) - hw / 2, y: padT, width: Math.max(hw, 24), height: plotH });
    hit.addEventListener('mouseenter', (e) => {
      showTip(e, { title: p.title || p.label, rows: [{ label: unidad, value: fmt(p.value), color }] });
    });
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', hideTip);
    g.push(hit);
  });

  host.append(
    svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `Acumulado de ${unidad}` }, g)
  );
}

/* ------------------------------------------------------------- leyenda -- */

export function legend(series, { line = false } = {}) {
  return h(
    'div',
    { class: 'legend', role: 'list' },
    series.map((s) =>
      h(
        'span',
        { class: 'legend__item', role: 'listitem' },
        h('span', { class: `legend__swatch ${line ? 'legend__swatch--line' : ''}`, style: { background: s.color } }),
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
export function chartCard({ title, sub, span = 'col-6', legendEl, render, table, note }) {
  const body = h('div', { class: 'card__body' });
  const plot = h('div', {});
  const tableWrap = h('div', { class: 'table-wrap hidden' });
  let showingTable = false;

  const toggle = h(
    'button',
    { class: 'btn btn--sm', type: 'button', 'aria-pressed': 'false' },
    'Ver tabla'
  );

  const draw = () => {
    if (showingTable) return;
    render(plot);
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
    } else {
      draw();
    }
  });

  if (legendEl) body.append(legendEl);
  body.append(plot, tableWrap);
  if (note) body.append(h('p', { class: 'small muted', style: { marginTop: '12px' } }, note));

  const card = h(
    'section',
    { class: `card ${span}` },
    h(
      'header',
      { class: 'card__head' },
      h('div', {}, h('h3', { class: 'card__title' }, title), sub ? h('div', { class: 'card__sub' }, sub) : null),
      h('div', { class: 'chart-tools' }, toggle)
    ),
    body
  );

  card._redraw = draw;
  return card;
}

/** Tabla simple a partir de columnas declaradas. */
export function simpleTable(cols, rows, footer) {
  return h(
    'table',
    { class: 'data' },
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.num ? 'n' : '' }, c.label)))),
    h(
      'tbody',
      {},
      rows.map((r) => h('tr', {}, cols.map((c) => h('td', { class: c.num ? 'n' : 'wrap' }, c.get(r)))))
    ),
    footer ? h('tfoot', {}, h('tr', {}, cols.map((c) => h('td', { class: c.num ? 'n' : '' }, footer[c.key] ?? '')))) : null
  );
}

/** Redibuja los gráficos cuando cambia el ancho disponible. */
export function observeResize(root) {
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      for (const card of root.querySelectorAll('.card')) {
        if (typeof card._redraw === 'function') card._redraw();
      }
    });
  });
  ro.observe(root);
  return () => ro.disconnect();
}
