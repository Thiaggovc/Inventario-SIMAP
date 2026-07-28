/* Tablero de resumen: la lectura de la situación actual en un vistazo. */

import { h, clear, fmt, fmtFecha, fmtFechaHora } from '../util.js';
import { store, filterItems, summarize, crossTipoUbicacion, itemTotal, itemPropTotal, itemDescuadre } from '../state.js';
import { filters, filterBar, onFilters, hasActiveFilters, setFilter } from '../filters.js';
import {
  barsH,
  stackedBarsH,
  shareBar,
  columns,
  areaLine,
  legend,
  chartCard,
  simpleTable,
  seriesColor,
  observeResize,
} from '../charts.js';

const TOP_TIPOS = 14;
const TOP_MEDIDAS = 12;

export function renderResumen(root) {
  const data = store.data;
  const host = h('div', { class: 'view' });
  const shell = h('div', { class: 'shell' });
  host.append(shell);

  const head = h(
    'header',
    { class: 'view__head' },
    h(
      'div',
      { class: 'view__headrow' },
      h(
        'div',
        {},
        h('div', { class: 'kicker' }, data.meta.empresa || 'Grupo SIMAP'),
        h('h1', { class: 'display' }, 'Panorama del inventario'),
      ),
      h('div', { class: 'meta-line' })
    ),
    h(
      'p',
      { class: 'deck' },
      'Existencias de formaletería consolidadas por tipología, medida, propietario, sede y fecha de compra. ',
      'Cada tarjeta admite lectura en tabla; los filtros de arriba afectan a todo el tablero.'
    )
  );
  shell.append(head);

  const metaLine = head.querySelector('.meta-line');
  metaLine.append(
    h('span', {}, 'Elaborado por ', h('b', {}, data.meta.elaboradoPor || '—')),
    h('span', {}, 'Revisado por ', h('b', {}, data.meta.revisadoPor || '—')),
    h('span', {}, 'Actualizado ', h('b', {}, fmtFechaHora(data.meta.actualizado)))
  );

  const noteEl = h('div', { class: 'filterbar__note' });
  shell.append(filterBar(data, { note: noteEl }));

  const tiles = h('section', { class: 'tiles' });
  const grid = h('div', { class: 'grid' });
  shell.append(tiles, grid);

  const paint = () => {
    const items = filterItems(data, filters);
    const s = summarize(data, items, filters.ubicacion);
    renderNote(noteEl, data, items, s);
    renderTiles(tiles, data, s);
    renderCards(grid, data, items, s);
  };

  paint();
  const offFilters = onFilters(paint);
  const stopResize = observeResize(grid);

  clear(root).append(host);
  return () => {
    offFilters();
    stopResize();
  };
}

/* --------------------------------------------------------------- notas -- */

function renderNote(el, data, items, s) {
  clear(el);
  const sede = data.ubicaciones.find((u) => u.id === filters.ubicacion);
  el.append(
    h(
      'span',
      {},
      `${fmt(items.length)} de ${fmt(data.items.length)} referencias en pantalla`,
      sede ? ` · cantidades limitadas a ${sede.nombre}` : ' · cantidades sumadas en todas las sedes'
    ),
    hasActiveFilters()
      ? h('span', {}, 'Filtro activo')
      : h('span', {}, 'Sin filtros')
  );
}

/* --------------------------------------------------------------- tiles -- */

function renderTiles(host, data, s) {
  clear(host);
  const descuadre = s.descuadres.length;

  host.append(
    tile({
      label: filters.ubicacion ? 'Unidades en la sede' : 'Unidades en inventario',
      value: fmt(s.unidades),
      note: `${fmt(s.referencias)} referencias · ${fmt(s.tipologias)} tipologías`,
      hero: true,
    }),
    tile({ label: 'Tipologías', value: fmt(s.tipologias), note: `${fmt(s.medidas)} medidas distintas` }),
    tile({
      label: 'Sedes y proyectos',
      value: fmt(data.ubicaciones.length),
      note: s.porUbicacion
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 1)
        .map((u) => `Mayor volumen: ${u.nombre}`)
        .join(''),
    }),
    tile({
      label: 'Unidades compradas',
      value: fmt(s.compradas),
      note: `${fmt(s.porCompra.length)} compras fechadas`,
    }),
    tile({
      label: 'Consistencia',
      value: descuadre ? fmt(descuadre) : 'OK',
      note: descuadre
        ? `referencias con descuadre entre propietario y sede`
        : 'propietario y sede cuadran en todas las referencias',
      alert: descuadre > 0,
    })
  );
}

function tile({ label, value, note, hero = false, alert = false }) {
  return h(
    'article',
    { class: `tile ${hero ? 'tile--hero' : ''}` },
    h('div', { class: 'tile__label' }, label),
    h('div', { class: `tile__value ${hero ? 'tile__value--hero' : ''}` }, value),
    note ? h('div', { class: `tile__note ${alert ? 'tile__note--alert' : ''}` }, note) : null
  );
}

/* -------------------------------------------------------------- tarjetas */

function renderCards(grid, data, items, s) {
  clear(grid);

  const ubSeries = data.ubicaciones.map((u, i) => ({ ...u, color: seriesColor(i) }));
  const prSeries = data.propietarios.map((p, i) => ({ ...p, color: seriesColor(i) }));

  /* 1 · reparto por sede ------------------------------------------------- */
  const repartoParts = ubSeries
    .map((u) => ({ ...u, value: s.porUbicacion.find((x) => x.id === u.id)?.value || 0 }))
    .filter((p) => p.value > 0);
  const totalUb = repartoParts.reduce((a, p) => a + p.value, 0);

  grid.append(
    chartCard({
      title: 'Dónde está el inventario',
      sub: 'Reparto de unidades entre sedes y proyectos, sobre las referencias filtradas',
      span: 'col-12',
      legendEl: legend(ubSeries),
      render: (el) => shareBar(el, { parts: repartoParts, unidad: 'unidades' }),
      table: () =>
        simpleTable(
          [
            { key: 'sede', label: 'Sede / proyecto', get: (r) => r.nombre },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
            { key: 'p', label: 'Participación', num: true, get: (r) => (totalUb ? ((r.value / totalUb) * 100).toFixed(1) + ' %' : '—') },
          ],
          repartoParts,
          { sede: 'Total', u: fmt(totalUb), p: '100,0 %' }
        ),
    })
  );

  /* 2 · tipologías ------------------------------------------------------- */
  const tipoRows = topRows(s.porTipo, TOP_TIPOS);
  grid.append(
    chartCard({
      title: 'Existencias por tipología',
      sub: `Las ${Math.min(TOP_TIPOS, s.porTipo.length)} tipologías de mayor volumen`,
      span: 'col-8',
      render: (el) => barsH(el, { rows: tipoRows, unidad: 'unidades', maxLabel: 34 }),
      table: () =>
        simpleTable(
          [
            { key: 't', label: 'Tipología', get: (r) => r.key },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
          ],
          s.porTipo,
          { t: 'Total', u: fmt(s.unidades) }
        ),
      note: s.porTipo.length > TOP_TIPOS ? `La tabla incluye las ${s.porTipo.length} tipologías completas.` : null,
    })
  );

  /* 3 · propietario ------------------------------------------------------ */
  const propParts = prSeries
    .map((p) => ({ ...p, value: s.porPropietario.find((x) => x.id === p.id)?.value || 0 }))
    .filter((p) => p.value > 0);
  const totalPr = propParts.reduce((a, p) => a + p.value, 0);

  grid.append(
    chartCard({
      title: 'Propiedad de los activos',
      sub: 'Unidades asignadas a cada propietario',
      span: 'col-4',
      legendEl: legend(propParts),
      render: (el) =>
        barsH(el, {
          rows: propParts.map((p) => ({ key: p.nombre, value: p.value, color: p.color })),
          unidad: 'unidades',
          maxLabel: 18,
        }),
      table: () =>
        simpleTable(
          [
            { key: 'p', label: 'Propietario', get: (r) => r.nombre },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
            { key: 's', label: 'Part.', num: true, get: (r) => (totalPr ? ((r.value / totalPr) * 100).toFixed(1) + ' %' : '—') },
          ],
          propParts,
          { p: 'Total', u: fmt(totalPr), s: '100,0 %' }
        ),
    })
  );

  /* 4 · tipología × sede ------------------------------------------------- */
  const cross = crossTipoUbicacion(items, data.ubicaciones, 12);
  grid.append(
    chartCard({
      title: 'Tipología por sede',
      sub: 'Cómo se distribuye cada tipología entre las sedes; el resto se agrupa al final',
      span: 'col-12',
      legendEl: legend(ubSeries),
      render: (el) => stackedBarsH(el, { rows: cross, series: ubSeries, unidad: 'unidades' }),
      table: () =>
        simpleTable(
          [
            { key: 't', label: 'Tipología', get: (r) => r.key },
            ...ubSeries.map((u) => ({ key: u.id, label: u.nombre, num: true, get: (r) => fmt(r.parts[u.id] || 0) })),
            { key: 'tot', label: 'Total', num: true, get: (r) => fmt(r.total) },
          ],
          cross
        ),
    })
  );

  /* 5 · compras ---------------------------------------------------------- */
  const compras = s.porCompra;
  const compraRows = compras.map((c) => ({
    label: fmtFecha(c.fecha, 'mes'),
    label2: '',
    title: `${c.etiqueta} · ${fmtFecha(c.fecha)}`,
    value: c.value,
  }));

  let acc = 0;
  const acumulado = compras.map((c) => {
    acc += c.value;
    return { label: fmtFecha(c.fecha, 'anio'), title: `Hasta ${fmtFecha(c.fecha)}`, value: acc };
  });

  grid.append(
    chartCard({
      title: 'Compras por fecha',
      sub: 'Unidades adquiridas en cada compra registrada',
      span: 'col-6',
      render: (el) => columns(el, { rows: compraRows, unidad: 'unidades compradas' }),
      table: () =>
        simpleTable(
          [
            { key: 'c', label: 'Compra', get: (r) => r.etiqueta },
            { key: 'f', label: 'Fecha', get: (r) => fmtFecha(r.fecha) },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
          ],
          compras,
          { c: 'Total', f: '', u: fmt(s.compradas) }
        ),
      note: 'El registro de compras es histórico: no todas las unidades compradas siguen en inventario.',
    }),
    chartCard({
      title: 'Compras acumuladas',
      sub: 'Suma progresiva de las unidades adquiridas',
      span: 'col-6',
      render: (el) => areaLine(el, { points: acumulado, unidad: 'unidades acumuladas' }),
      table: () =>
        simpleTable(
          [
            { key: 'f', label: 'Fecha', get: (r) => r.title.replace('Hasta ', '') },
            { key: 'u', label: 'Acumulado', num: true, get: (r) => fmt(r.value) },
          ],
          acumulado
        ),
    })
  );

  /* 6 · medidas ---------------------------------------------------------- */
  const medidaRows = topRows(s.porMedida, TOP_MEDIDAS);
  grid.append(
    chartCard({
      title: 'Medidas con mayor existencia',
      sub: `${fmt(s.medidas)} medidas distintas en las referencias filtradas`,
      span: 'col-8',
      render: (el) => barsH(el, { rows: medidaRows, unidad: 'unidades', maxLabel: 30 }),
      table: () =>
        simpleTable(
          [
            { key: 'm', label: 'Medida', get: (r) => r.key },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
          ],
          s.porMedida.slice(0, 120)
        ),
      note: s.porMedida.length > 120 ? 'La tabla muestra las 120 medidas de mayor volumen.' : null,
    }),
    consistencyCard(data, s)
  );
}

function topRows(rows, n) {
  if (rows.length <= n) return rows.map((r) => ({ key: r.key, value: r.value }));
  const head = rows.slice(0, n).map((r) => ({ key: r.key, value: r.value }));
  const tail = rows.slice(n);
  head.push({
    key: `Otras ${tail.length}`,
    value: tail.reduce((a, r) => a + r.value, 0),
  });
  return head;
}

/* ------------------------------------------------------- consistencia --- */

function consistencyCard(data, s) {
  const body = h('div', { class: 'card__body stack' });
  const total = s.descuadres.length;

  if (!total && !s.sinUbicar.length) {
    body.append(
      h('div', { class: 'note' }, 'Todas las referencias filtradas cuadran: el total por propietario coincide con el total ubicado.')
    );
  }

  if (total) {
    body.append(
      h(
        'div',
        { class: 'note note--warn' },
        h('b', {}, `${fmt(total)} referencias con descuadre. `),
        'La suma asignada a los propietarios no coincide con las unidades ubicadas en sedes. Provienen del archivo original y conviene revisarlas en campo.'
      )
    );
    const rows = s.descuadres.slice(0, 8);
    body.append(
      h(
        'div',
        { class: 'table-wrap' },
        simpleTable(
          [
            {
              key: 't',
              label: 'Referencia',
              get: (it) =>
                h(
                  'div',
                  {},
                  h('b', {}, it.tipo),
                  h('div', { class: 'small muted' }, `${it.medida} · sedes ${fmt(itemTotal(it))} · propietario ${fmt(itemPropTotal(it))}`)
                ),
            },
            {
              key: 'd',
              label: 'Dif.',
              num: true,
              get: (it) =>
                h('span', { class: 'chip chip--bad' }, (itemDescuadre(it) > 0 ? '+' : '') + fmt(itemDescuadre(it))),
            },
          ],
          rows
        )
      )
    );
    if (total > rows.length) {
      body.append(
        h(
          'button',
          {
            class: 'btn btn--sm',
            type: 'button',
            onclick: () => {
              setFilter({ soloDescuadre: true });
              location.hash = '#/inventario';
            },
          },
          `Ver las ${fmt(total)} en el inventario`
        )
      );
    }
  }

  if (s.sinUbicar.length) {
    body.append(
      h(
        'div',
        { class: 'note note--warn' },
        h('b', {}, `${fmt(s.sinUbicar.length)} referencias con compras pero sin existencias ubicadas. `),
        'Corresponden a material comprado que ya no figura en ninguna sede.'
      )
    );
  }

  return h(
    'section',
    { class: 'card col-4' },
    h(
      'header',
      { class: 'card__head' },
      h('div', {}, h('h3', { class: 'card__title' }, 'Control de consistencia'), h('div', { class: 'card__sub' }, 'Contraste entre propietario y sede'))
    ),
    body
  );
}
