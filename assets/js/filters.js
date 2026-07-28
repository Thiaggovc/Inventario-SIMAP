/* Filtro único que gobierna todas las tarjetas y la tabla de inventario.
 * Una sola fila de controles por encima de todo lo que afecta. */

import { h, debounce } from './util.js';

export const filters = {
  q: '',
  tipos: [],
  ubicacion: '',
  propietario: '',
  compra: '',
  soloDescuadre: false,
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
  Object.assign(filters, { q: '', tipos: [], ubicacion: '', propietario: '', compra: '', soloDescuadre: false });
  fire();
}

export const hasActiveFilters = () =>
  !!(filters.q || filters.tipos.length || filters.ubicacion || filters.propietario || filters.compra || filters.soloDescuadre);

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

  const tipoSel = h(
    'select',
    {
      class: 'select',
      'aria-label': 'Filtrar por tipología',
      onchange: (e) => setFilter({ tipos: e.target.value ? [e.target.value] : [] }),
    },
    h('option', { value: '' }, `Todas (${data.tipos.length})`),
    data.tipos.map((t) => h('option', { value: t, selected: filters.tipos[0] === t }, t))
  );

  const ubicSel = h(
    'select',
    { class: 'select', 'aria-label': 'Filtrar por ubicación', onchange: (e) => setFilter({ ubicacion: e.target.value }) },
    h('option', { value: '' }, 'Todas las sedes'),
    data.ubicaciones.map((u) => h('option', { value: u.id, selected: filters.ubicacion === u.id }, u.nombre))
  );

  const propSel = h(
    'select',
    { class: 'select', 'aria-label': 'Filtrar por propietario', onchange: (e) => setFilter({ propietario: e.target.value }) },
    h('option', { value: '' }, 'Todos'),
    data.propietarios.map((p) => h('option', { value: p.id, selected: filters.propietario === p.id }, p.nombre))
  );

  const compraSel = h(
    'select',
    { class: 'select', 'aria-label': 'Filtrar por compra', onchange: (e) => setFilter({ compra: e.target.value }) },
    h('option', { value: '' }, 'Cualquiera'),
    data.compras.map((c) =>
      h('option', { value: c.id, selected: filters.compra === c.id }, `${c.etiqueta}${c.fecha ? ` · ${c.fecha}` : ''}`)
    )
  );

  const descuadre = h('input', {
    type: 'checkbox',
    checked: filters.soloDescuadre,
    onchange: (e) => setFilter({ soloDescuadre: e.target.checked }),
  });

  return h(
    'section',
    { class: 'filterbar', 'aria-label': 'Filtros del inventario' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Buscar'), qInput),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tipología'), tipoSel),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Ubicación / proyecto'), ubicSel),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Propietario'), propSel),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Compra'), compraSel),
    showDescuadre
      ? h(
          'label',
          { class: 'field' },
          h('span', { class: 'field__label' }, 'Consistencia'),
          h('span', { class: 'row', style: { gap: '7px', paddingTop: '6px' } }, descuadre, h('span', { class: 'small' }, 'Sólo descuadres'))
        )
      : null,
    h(
      'div',
      { class: 'filterbar__actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => resetFilters() }, 'Limpiar')
    ),
    // La nota la aporta cada vista: llega ya con su clase, no se vuelve a envolver.
    note || null
  );
}
