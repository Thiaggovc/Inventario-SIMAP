/* Tablero de resumen: la lectura de la situación actual en un vistazo. */

import { h, clear, fmt, fmtFecha, fmtFechaHora, animateNumber, observeReveal, trackPointer, prefersReduced, displayTitle } from '../util.js';
import { store, filterItems, summarize, crossTipoUbicacion, itemTotal, itemPropTotal, itemDescuadre } from '../state.js';
import { filters, filterBar, onFilters, hasActiveFilters, setFilter } from '../filters.js';
import { glassSelect, segmented } from '../ui.js';
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
  seriesFill,
  observeResize,
  donut,
  treemap,
  lollipop,
} from '../charts.js';

/* Cada tarjeta lleva su propia ranura de color: leer cuatro gráficos seguidos
   en el mismo verde los volvía indistinguibles de un vistazo. */
const SLOT_TIPOS = 3;    // ámbar
const SLOT_MEDIDAS = 1;  // naranja
const SLOT_COMPRAS = 2;  // azul profundo
const SLOT_ACUM = 4;     // vino

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
        { class: 'titleblock' },
        h('span', { class: 'kicker kicker--pill' }, data.meta.empresa || 'Grupo SIMAP'),
        h('h1', { class: 'display display--xl' }, displayTitle('Panorama del inventario')),
        h('div', { class: 'rule-grow', style: { width: '160px' } })
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
  const barra = filterBar(data, { note: noteEl });
  shell.append(barra);

  const tiles = h('section', { class: 'tiles' });
  const grid = h('div', { class: 'grid' });
  shell.append(tiles, grid);

  let stopReveal = () => {};
  let prevUnidades = 0;

  const paint = ({ animate = true } = {}) => {
    const items = filterItems(data, filters);
    const s = summarize(data, items, filters.ubicacion);
    renderNote(noteEl, data, items, s);
    renderTiles(tiles, data, s, { animate, from: prevUnidades });
    renderCards(grid, data, items, s, () => paint({ animate: false }));
    prevUnidades = s.unidades;
    stopReveal();
    stopReveal = observeReveal(shell);
    /* Tras el barrido de aparición, lo que quedó fuera de pantalla se resuelve
       igual: gráficos dibujados y cifras escritas, sin animación. */
    requestAnimationFrame(() => {
      for (const el of shell.querySelectorAll('.tile, .card')) el._ensure?.();
    });
  };

  paint();

  /* Al cambiar un filtro las tarjetas se atenúan y vuelven, sin salto ni
     esqueleto en blanco: la lectura anterior se mantiene hasta el relevo. */
  const offFilters = onFilters(() => {
    const bar = shell.querySelector('.filterbar');
    if (bar) {
      bar.classList.remove('is-applying');
      void bar.offsetWidth;
      bar.classList.add('is-applying');
    }
    if (prefersReduced()) {
      paint();
      return;
    }
    tiles.classList.add('is-refreshing');
    grid.classList.add('is-refreshing');
    setTimeout(() => {
      paint();
      tiles.classList.remove('is-refreshing');
      grid.classList.remove('is-refreshing');
    }, 150);
  });

  const stopResize = observeResize(grid);

  clear(root).append(host);
  return () => {
    offFilters();
    stopResize();
    stopReveal();
    barra._dispose();
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

function renderTiles(host, data, s, { animate = true, from = 0 } = {}) {
  clear(host);
  const descuadre = s.descuadres.length;

  host.append(
    tile({
      label: filters.ubicacion ? 'Unidades en la sede' : 'Unidades en inventario',
      num: s.unidades,
      from,
      animate,
      note: `${fmt(s.referencias)} referencias · ${fmt(s.tipologias)} tipologías`,
      hero: true,
      index: 0,
    }),
    tile({ label: 'Tipologías', num: s.tipologias, animate, note: `${fmt(s.medidas)} medidas distintas`, index: 1, acento: 'var(--series-1)' }),
    tile({
      label: 'Sedes y proyectos',
      num: data.ubicaciones.length,
      animate,
      note: s.porUbicacion
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 1)
        .map((u) => `Mayor volumen: ${u.nombre}`)
        .join(''),
      index: 2,
      acento: 'var(--series-3)',
    }),
    tile({
      label: 'Unidades compradas',
      num: s.compradas,
      animate,
      note: `${fmt(s.porCompra.length)} compras fechadas`,
      index: 3,
      acento: 'var(--series-4)',
    }),
    tile({
      label: 'Consistencia',
      value: descuadre ? null : 'OK',
      num: descuadre ? descuadre : null,
      animate,
      note: descuadre
        ? 'referencias con descuadre entre propietario y sede'
        : 'propietario y sede cuadran en todas las referencias',
      alert: descuadre > 0,
      index: 4,
      acento: descuadre ? 'var(--critical)' : 'var(--series-2)',
    })
  );
}

function tile({ label, value, num = null, from = 0, animate = true, note, hero = false, alert = false, index = 0, acento = null }) {
  const valueEl = h(
    'div',
    { class: `tile__value ${hero ? 'tile__value--hero' : ''}` },
    num === null ? value : fmt(num)
  );

  const el = h(
    'article',
    { class: `tile glass reveal ${hero ? 'tile--hero' : ''}`, style: { '--i': index, ...(acento ? { '--acento': acento } : {}) } },
    h('div', { class: 'tile__label' }, label),
    valueEl,
    note ? h('div', { class: `tile__note ${alert ? 'tile__note--alert' : ''}` }, note) : null
  );

  if (num !== null && animate) {
    // El conteo arranca cuando la tarjeta entra en pantalla, no antes…
    el._firstDraw = () => {
      el._ensure = null;
      animateNumber(valueEl, num, { from, duration: hero ? 1100 : 800 });
    };
    /* …pero si se filtra con la página desplazada, la tarjeta nunca entra y la
       cifra se quedaría en el valor anterior. Entonces se escribe sin contar. */
    el._ensure = () => {
      valueEl.textContent = fmt(num);
    };
    valueEl.textContent = fmt(from);
  }

  if (hero) trackPointer(el);
  return el;
}

/* -------------------------------------------------------------- tarjetas */

/* Estado propio del tablero: qué series se miran y cuántas filas se listan.
   Vive fuera de `renderCards` para sobrevivir a los redibujados. */
const vista = {
  sedesOcultas: new Set(),
  topTipos: TOP_TIPOS,
  topMedidas: TOP_MEDIDAS,
  formaReparto: 'barra',   // barra | anillo
  formaCruce: 'apilado',   // apilado | agrupado
  formaTipos: 'barra',     // barra | piruleta | areas
  formaMedidas: 'barra',   // barra | piruleta
  formaAcum: 'area',       // area | linea
  ordenTipos: 'valor',     // valor | nombre
};

/** Elige el dibujante según la forma pedida en la tarjeta. */
function dibujarCategorias(forma, el, opciones) {
  if (forma === 'piruleta') return lollipop(el, opciones);
  if (forma === 'areas') return treemap(el, opciones);
  return barsH(el, opciones);
}

function selectorTop(valor, total, onChange) {
  // El valor vigente entra siempre en la lista: si no, el botón mostraría «—».
  const opciones = [...new Set([10, 15, 25, 40, valor])]
    .filter((n) => n > 0 && n < total)
    .sort((a, b) => a - b);
  opciones.push(total);
  return glassSelect({
    value: valor,
    compact: true,
    buscable: false,
    ariaLabel: 'Cuántas filas mostrar',
    options: opciones.map((n) => ({ value: n, label: n >= total ? `Todas (${fmt(total)})` : `Top ${n}` })),
    onChange: (v) => onChange(Number(v)),
  });
}

function selectorOrden(valor, onChange) {
  return glassSelect({
    value: valor,
    compact: true,
    buscable: false,
    ariaLabel: 'Criterio de orden',
    options: [
      { value: 'valor', label: 'Por volumen' },
      { value: 'nombre', label: 'Alfabético' },
    ],
    onChange,
  });
}

/** Aplica el criterio de orden elegido a una lista ya agregada. */
function ordenar(filas, criterio) {
  if (criterio !== 'nombre') return filas;
  return filas.slice().sort((a, b) => String(a.key).localeCompare(String(b.key), 'es'));
}

function renderCards(grid, data, items, s, repintar) {
  clear(grid);

  // Cada entidad conserva su ranura de color; el degradado sólo aporta volumen.
  const dress = (e, i) => ({ ...e, slot: i, color: seriesColor(i), colorLift: `var(--series-${(i % 5) + 1}-lift)`, fill: seriesFill(i) });
  const ubSeries = data.ubicaciones.map(dress);
  const prSeries = data.propietarios.map(dress);

  const visibles = ubSeries.filter((u) => !vista.sedesOcultas.has(u.id));
  const dependenSede = [];

  /* Apagar una sede la retira de los dos gráficos que la usan, a la vez. */
  const alternarSede = (id) => {
    if (vista.sedesOcultas.has(id)) vista.sedesOcultas.delete(id);
    else if (vista.sedesOcultas.size < ubSeries.length - 1) vista.sedesOcultas.add(id);
    else return;
    repintar();
  };

  /* 1 · reparto por sede ------------------------------------------------- */
  const repartoParts = visibles
    .map((u) => ({ ...u, value: s.porUbicacion.find((x) => x.id === u.id)?.value || 0 }))
    .filter((p) => p.value > 0);
  const totalUb = repartoParts.reduce((a, p) => a + p.value, 0);

  const cardReparto = chartCard({
    title: 'Dónde está el inventario',
    index: 0,
    sub: 'Reparto de unidades entre sedes y proyectos · pulse una sede en la leyenda para apartarla',
    span: 'col-12',
    legendEl: legend(ubSeries, { hidden: vista.sedesOcultas, onToggle: alternarSede }),
    tools: segmented({
      value: vista.formaReparto,
      ariaLabel: 'Forma del gráfico',
      options: [
        { value: 'barra', label: 'Barra', icon: '▭' },
        { value: 'anillo', label: 'Anillo', icon: '◎' },
      ],
      onChange: (v) => {
        vista.formaReparto = v;
        repintar();
      },
    }),
    minHeight: vista.formaReparto === 'anillo',
    render: (el, o) =>
      vista.formaReparto === 'anillo'
        ? donut(el, { parts: repartoParts, unidad: 'unidades', ...o })
        : shareBar(el, { parts: repartoParts, unidad: 'unidades', ...o }),
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
  });
  dependenSede.push(cardReparto);
  grid.append(cardReparto);

  /* 2 · tipologías ------------------------------------------------------- */
  const tipoRows = ordenar(topRows(s.porTipo, vista.topTipos), vista.ordenTipos);
  grid.append(
    chartCard({
      title: 'Existencias por tipología',
      index: 1,
      sub: 'Pulse una tipología para filtrar el tablero por ella',
      span: 'col-8',
      acento: SLOT_TIPOS,
      tools: [
        segmented({
          value: vista.formaTipos,
          ariaLabel: 'Forma del gráfico de tipologías',
          options: [
            { value: 'barra', label: 'Barras', icon: '▤' },
            { value: 'piruleta', label: 'Piruleta', icon: '⊙' },
            { value: 'areas', label: 'Áreas', icon: '▦' },
          ],
          onChange: (v) => {
            vista.formaTipos = v;
            repintar();
          },
        }),
        selectorOrden(vista.ordenTipos, (v) => {
          vista.ordenTipos = v;
          repintar();
        }),
        selectorTop(vista.topTipos, s.porTipo.length, (n) => {
          vista.topTipos = n;
          repintar();
        }),
      ],
      render: (el, o) =>
        dibujarCategorias(vista.formaTipos, el, {
          rows: tipoRows,
          unidad: 'unidades',
          maxLabel: 26,
          slot: SLOT_TIPOS,
          picked: filters.tipos[0] || null,
          onPick: (r) => setFilter({ tipos: filters.tipos[0] === r.key ? [] : [r.key] }),
          ...o,
        }),
      table: () =>
        simpleTable(
          [
            { key: 't', label: 'Tipología', get: (r) => r.key },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
          ],
          s.porTipo,
          { t: 'Total', u: fmt(s.unidades) }
        ),
      note: h('span', { class: 'pick-hint' }, `La tabla incluye las ${fmt(s.porTipo.length)} tipologías completas.`),
    })
  );

  /* 3 · columna estrecha: propietario y consistencia --------------------- */
  const propParts = prSeries
    .map((p) => ({ ...p, value: s.porPropietario.find((x) => x.id === p.id)?.value || 0 }))
    .filter((p) => p.value > 0);
  const totalPr = propParts.reduce((a, p) => a + p.value, 0);

  const cardProp = chartCard({
    title: 'Propiedad de los activos',
    index: 2,
    sub: 'Unidades asignadas a cada propietario',
    span: '',
    minHeight: true,
    legendEl: legend(propParts),
    render: (el, o) =>
      barsH(el, {
        rows: propParts.map((p) => ({ key: p.nombre, value: p.value, slot: p.slot, serie: p.id })),
        unidad: 'unidades',
        maxLabel: 20,
        picked: null,
        onPick: (r) => {
          const dueno = propParts.find((x) => x.nombre === r.key);
          if (dueno) setFilter({ propietario: filters.propietario === dueno.id ? '' : dueno.id });
        },
        ...o,
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
  });

  grid.append(h('div', { class: 'col-stack col-4' }, cardProp, consistencyCard(data, s)));

  /* 4 · tipología × sede ------------------------------------------------- */
  const cross = crossTipoUbicacion(items, data.ubicaciones.filter((u) => !vista.sedesOcultas.has(u.id)), 12);
  const cardCross = chartCard({
    title: 'Tipología por sede',
    index: 3,
    sub: 'Cómo se distribuye cada tipología entre las sedes; el resto se agrupa al final',
    span: 'col-12',
    legendEl: legend(ubSeries, { hidden: vista.sedesOcultas, onToggle: alternarSede }),
    tools: segmented({
      value: vista.formaCruce,
      ariaLabel: 'Disposición de las series',
      options: [
        { value: 'apilado', label: 'Apilado', icon: '▤' },
        { value: 'agrupado', label: 'Agrupado', icon: '▥' },
      ],
      onChange: (v) => {
        vista.formaCruce = v;
        repintar();
      },
    }),
    render: (el, o) =>
      stackedBarsH(el, { rows: cross, series: visibles, unidad: 'unidades', modo: vista.formaCruce, ...o }),
    table: () =>
      simpleTable(
        [
          { key: 't', label: 'Tipología', get: (r) => r.key },
          ...visibles.map((u) => ({ key: u.id, label: u.nombre, num: true, get: (r) => fmt(r.parts[u.id] || 0) })),
          { key: 'tot', label: 'Total', num: true, get: (r) => fmt(r.total) },
        ],
        cross
      ),
  });
  dependenSede.push(cardCross);
  grid.append(cardCross);

  /* 5 · compras ---------------------------------------------------------- */
  const compras = s.porCompra;
  const compraRows = compras.map((c) => ({
    label: fmtFecha(c.fecha, 'mes'),
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
      index: 4,
      sub: 'Unidades adquiridas en cada compra registrada',
      span: 'col-6',
      acento: SLOT_COMPRAS,
      render: (el, o) => columns(el, { rows: compraRows, unidad: 'unidades compradas', slot: SLOT_COMPRAS, ...o }),
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
      index: 5,
      sub: 'Suma progresiva de las unidades adquiridas',
      span: 'col-6',
      acento: SLOT_ACUM,
      tools: segmented({
        value: vista.formaAcum,
        ariaLabel: 'Forma de la serie acumulada',
        options: [
          { value: 'area', label: 'Área', icon: '◣' },
          { value: 'linea', label: 'Línea', icon: '↗' },
        ],
        onChange: (v) => {
          vista.formaAcum = v;
          repintar();
        },
      }),
      render: (el, o) =>
        areaLine(el, {
          points: acumulado,
          unidad: 'unidades acumuladas',
          slot: SLOT_ACUM,
          relleno: vista.formaAcum === 'area',
          ...o,
        }),
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
  const medidaRows = topRows(s.porMedida, vista.topMedidas);
  grid.append(
    chartCard({
      title: 'Medidas con mayor existencia',
      index: 6,
      sub: `${fmt(s.medidas)} medidas distintas en las referencias filtradas`,
      span: 'col-12',
      acento: SLOT_MEDIDAS,
      tools: [
        segmented({
          value: vista.formaMedidas,
          ariaLabel: 'Forma del gráfico de medidas',
          options: [
            { value: 'barra', label: 'Barras', icon: '▤' },
            { value: 'piruleta', label: 'Piruleta', icon: '⊙' },
          ],
          onChange: (v) => {
            vista.formaMedidas = v;
            repintar();
          },
        }),
        selectorTop(vista.topMedidas, s.porMedida.length, (n) => {
          vista.topMedidas = n;
          repintar();
        }),
      ],
      render: (el, o) =>
        dibujarCategorias(vista.formaMedidas, el, {
          rows: medidaRows,
          unidad: 'unidades',
          maxLabel: 26,
          slot: SLOT_MEDIDAS,
          ...o,
        }),
      table: () =>
        simpleTable(
          [
            { key: 'm', label: 'Medida', get: (r) => r.key },
            { key: 'u', label: 'Unidades', num: true, get: (r) => fmt(r.value) },
          ],
          s.porMedida.slice(0, 200)
        ),
      note: s.porMedida.length > 200 ? 'La tabla muestra las 200 medidas de mayor volumen.' : null,
    })
  );
}

function topRows(rows, n) {
  if (rows.length <= n) return rows.map((r) => ({ key: r.key, value: r.value }));
  const head = rows.slice(0, n).map((r) => ({ key: r.key, value: r.value }));
  const tail = rows.slice(n);
  head.push({
    key: `Otras ${tail.length}`,
    value: tail.reduce((a, r) => a + r.value, 0),
    isOther: true,
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
    { class: 'card glass reveal', style: { '--i': 7 } },
    h(
      'header',
      { class: 'card__head' },
      h('div', {}, h('h3', { class: 'card__title' }, 'Control de consistencia'), h('div', { class: 'card__sub' }, 'Contraste entre propietario y sede'))
    ),
    body
  );
}
