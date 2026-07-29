/* Filtro único que gobierna todas las tarjetas y la tabla de inventario.
 * Una sola fila de controles por encima de todo lo que afecta. */

import { h, debounce } from './util.js';
import { glassSelect } from './ui.js';

export const filters = {
  q: '',
  tipos: [],
  ubicacion: '',
  propietario: '',
  compra: '',
  soloDescuadre: false,
  soloConStock: false,
};

const subs = new Set();

export function onFilters(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function fire() {
  for (const fn of subs) fn(filters);
}

export function setFilter(patch) {
  Object.assign(filters, patch);
  fire();
}

export function resetFilters() {
  Object.assign(filters, {
    q: '', tipos: [], ubicacion: '', propietario: '', compra: '',
    soloDescuadre: false, soloConStock: false,
  });
  fire();
}

export const hasActiveFilters = () =>
  !!(filters.q || filters.tipos.length || filters.ubicacion || filters.propietario ||
     filters.compra || filters.soloDescuadre || filters.soloConStock);

/** Cuántos filtros hay puestos, para avisarlo en la propia barra. */
export const countActiveFilters = () =>
  [filters.q, filters.tipos.length, filters.ubicacion, filters.propietario, filters.compra,
   filters.soloDescuadre, filters.soloConStock].filter(Boolean).length;

/** Construye la barra de filtros para una vista. */
export function filterBar(data, { showDescuadre = true, note } = {}) {
  const qInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Tipología, medida o nota…',
    value: filters.q,
    'aria-label': 'Buscar referencias',
    oninput: debounce((e) => setFilter({ q: e.target.value }), 200),
  });

  const tipoSel = glassSelect({
    value: filters.tipos[0] || '',
    ariaLabel: 'Filtrar por tipología',
    placeholder: `Todas (${data.tipos.length})`,
    options: [
      { value: '', label: `Todas (${data.tipos.length})` },
      ...data.tipos.map((t) => ({ value: t, label: t })),
    ],
    onChange: (v) => setFilter({ tipos: v ? [v] : [] }),
  });

  const ubicSel = glassSelect({
    value: filters.ubicacion,
    ariaLabel: 'Filtrar por ubicación',
    placeholder: 'Todas las sedes',
    options: [
      { value: '', label: 'Todas las sedes' },
      ...data.ubicaciones.map((u, i) => ({ value: u.id, label: u.nombre, color: `var(--series-${(i % 5) + 1})` })),
    ],
    onChange: (v) => setFilter({ ubicacion: v }),
  });

  const propSel = glassSelect({
    value: filters.propietario,
    ariaLabel: 'Filtrar por propietario',
    placeholder: 'Todos',
    options: [
      { value: '', label: 'Todos' },
      ...data.propietarios.map((p, i) => ({ value: p.id, label: p.nombre, color: `var(--series-${(i % 5) + 1})` })),
    ],
    onChange: (v) => setFilter({ propietario: v }),
  });

  const compraSel = glassSelect({
    value: filters.compra,
    ariaLabel: 'Filtrar por compra',
    placeholder: 'Cualquiera',
    options: [
      { value: '', label: 'Cualquiera' },
      ...data.compras.map((c) => ({ value: c.id, label: c.etiqueta, hint: c.fecha || '' })),
    ],
    onChange: (v) => setFilter({ compra: v }),
  });

  const descuadre = h('input', {
    class: 'check',
    type: 'checkbox',
    checked: filters.soloDescuadre,
    onchange: (e) => setFilter({ soloDescuadre: e.target.checked }),
  });

  const conStock = h('input', {
    class: 'check',
    type: 'checkbox',
    checked: filters.soloConStock,
    onchange: (e) => setFilter({ soloConStock: e.target.checked }),
  });

  /* Los filtros también se aplican desde fuera —al pulsar una barra del
     tablero—, así que los controles se sincronizan con el estado real. */
  const sincronizar = () => {
    if (qInput.value !== filters.q) qInput.value = filters.q;
    tipoSel._set(filters.tipos[0] || '');
    ubicSel._set(filters.ubicacion);
    propSel._set(filters.propietario);
    compraSel._set(filters.compra);
    descuadre.checked = filters.soloDescuadre;
    conStock.checked = filters.soloConStock;
    const n = countActiveFilters();
    bar.dataset.activos = n ? String(n) : '';
  };
  // La barra se destruye con su vista; el desuscriptor viaja con el elemento.
  const bar = h(
    'section',
    { class: 'filterbar glass reveal', 'aria-label': 'Filtros del inventario' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Buscar'), qInput),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tipología'), tipoSel),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Ubicación / proyecto'), ubicSel),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Propietario'), propSel),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Compra'), compraSel),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Existencias'),
      h(
        'div',
        { class: 'switches' },
        h('label', { class: 'switch' }, conStock, h('span', {}, 'Sólo con existencias')),
        showDescuadre ? h('label', { class: 'switch' }, descuadre, h('span', {}, 'Sólo descuadres')) : null
      )
    ),
    h(
      'div',
      { class: 'filterbar__actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => resetFilters() }, 'Limpiar')
    ),
    // La nota la aporta cada vista: llega ya con su clase, no se vuelve a envolver.
    note || null
  );

  const off = onFilters(sincronizar);
  sincronizar();
  bar._dispose = () => {
    off();
    for (const sel of [tipoSel, ubicSel, propSel, compraSel]) sel._dispose();
  };
  return bar;
}
