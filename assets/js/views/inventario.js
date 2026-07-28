/* Inventario detallado: consulta, alta, edición y baja de referencias. */

import { h, clear, fmt, fmtFecha, toInt, openModal, confirmDialog, toast, sumValues, slug, observeReveal, prefersReduced } from '../util.js';
import { store, commit, filterItems, itemTotal, itemPropTotal, itemDescuadre, newItem } from '../state.js';
import { filters, filterBar, onFilters } from '../filters.js';

const PAGE = 40;

const sortState = { key: 'n', dir: 'asc' };
let page = 1;

export function renderInventario(root) {
  const data = store.data;
  const host = h('div', { class: 'view' });
  const shell = h('div', { class: 'shell' });
  host.append(shell);

  shell.append(
    h(
      'header',
      { class: 'view__head' },
      h(
        'div',
        { class: 'view__headrow' },
        h(
          'div',
          { class: 'titleblock' },
          h('span', { class: 'kicker kicker--pill' }, 'Registro maestro'),
          h('h1', { class: 'display display--xl' }, 'Inventario de ', h('em', {}, 'formaletería')),
          h('div', { class: 'rule-grow', style: { width: '150px' } })
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => openCatalogos(data, repaint) }, 'Catálogos'),
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openItem(data, null, repaint) }, '+ Nueva referencia')
        )
      ),
      h(
        'p',
        { class: 'deck' },
        'Cada fila es una referencia: una tipología con una medida concreta, con sus cantidades por sede, su propietario y las compras que la originaron. Los cambios quedan en el borrador local hasta que se publiquen en el repositorio.'
      )
    )
  );

  const noteEl = h('div', { class: 'filterbar__note' });
  shell.append(filterBar(data, { note: noteEl }));

  const card = h('section', { class: 'card glass reveal' });
  shell.append(card);

  function repaint() {
    const items = sortItems(filterItems(store.data, filters));
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    if (page > pages) page = pages;
    const slice = items.slice((page - 1) * PAGE, page * PAGE);

    clear(noteEl).append(
      h('span', {}, `${fmt(items.length)} referencias · ${fmt(items.reduce((a, it) => a + itemTotal(it), 0))} unidades ubicadas`),
      h('span', {}, `Página ${page} de ${pages}`)
    );

    const wrap = h('div', { class: 'table-wrap' }, buildTable(store.data, slice, repaint));
    clear(card).append(wrap, pager(items.length, pages, repaint));
    if (!prefersReduced()) {
      wrap.classList.add('swap-in');
      // Las filas entran escalonadas: la lista se «llena» en vez de aparecer.
      slice.forEach((_, i) => {
        const tr = wrap.querySelectorAll('tbody tr')[i];
        if (!tr || !tr.animate) return;
        tr.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 320, delay: Math.min(i, 18) * 22, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
        );
      });
    }
  }

  repaint();

  const off = onFilters(() => {
    page = 1;
    const bar = shell.querySelector('.filterbar');
    if (bar) {
      bar.classList.remove('is-applying');
      void bar.offsetWidth;
      bar.classList.add('is-applying');
    }
    repaint();
  });

  clear(root).append(host);
  const stopReveal = observeReveal(shell);
  return () => {
    off();
    stopReveal();
  };
}

/* --------------------------------------------------------------- orden -- */

function sortItems(items) {
  const { key, dir } = sortState;
  const mul = dir === 'asc' ? 1 : -1;
  const val = (it) => {
    switch (key) {
      case 'tipo': return it.tipo;
      case 'medida': return it.medida;
      case 'total': return itemTotal(it);
      case 'prop': return itemPropTotal(it);
      case 'dif': return itemDescuadre(it);
      case 'compras': return sumValues(it.compras);
      default:
        if (key.startsWith('ub:')) return it.ubicaciones[key.slice(3)] || 0;
        return it.n;
    }
  };
  return items.slice().sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y), 'es') * mul;
    return (x - y) * mul;
  });
}

function sortHeader(label, key, num = false) {
  const th = h(
    'th',
    {
      class: `sortable ${num ? 'n' : ''}`,
      scope: 'col',
      dataset: sortState.key === key ? { dir: sortState.dir } : {},
      tabindex: '0',
      role: 'columnheader',
    },
    label
  );
  const act = () => {
    if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    else {
      sortState.key = key;
      sortState.dir = num ? 'desc' : 'asc';
    }
    th.dispatchEvent(new CustomEvent('sortchange', { bubbles: true }));
  };
  th.addEventListener('click', act);
  th.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      act();
    }
  });
  return th;
}

/* --------------------------------------------------------------- tabla -- */

function buildTable(data, items, repaint) {
  const table = h(
    'table',
    { class: 'data' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        sortHeader('N°', 'n', true),
        sortHeader('Tipología', 'tipo'),
        sortHeader('Medida', 'medida'),
        data.ubicaciones.map((u) => sortHeader(u.nombre, `ub:${u.id}`, true)),
        sortHeader('Ubicado', 'total', true),
        sortHeader('Dif.', 'dif', true),
        sortHeader('Compras', 'compras', true),
        h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Acciones'))
      )
    ),
    h(
      'tbody',
      {},
      items.length
        ? items.map((it) => row(data, it, repaint))
        : h('tr', {}, h('td', { colspan: 8 + data.ubicaciones.length, class: 'muted', style: { padding: '30px', textAlign: 'center' } }, 'Ninguna referencia coincide con el filtro.'))
    )
  );
  table.addEventListener('sortchange', repaint);
  return table;
}

function row(data, it, repaint) {
  const dif = itemDescuadre(it);
  const propNames = data.propietarios.filter((p) => it.propietarios[p.id]).map((p) => p.nombre);

  return h(
    'tr',
    {},
    h('td', { class: 'n muted' }, it.n),
    h('td', { class: 'wrap' }, h('b', {}, it.tipo), propNames.length ? h('div', { class: 'small muted' }, propNames.join(' · ')) : null),
    h('td', { class: 'wrap' }, it.medida, it.nota ? h('div', { class: 'small muted' }, it.nota) : null),
    data.ubicaciones.map((u) =>
      h('td', { class: 'n' }, it.ubicaciones[u.id] ? fmt(it.ubicaciones[u.id]) : h('span', { class: 'muted' }, '—'))
    ),
    h('td', { class: 'n' }, h('b', {}, fmt(itemTotal(it)))),
    h(
      'td',
      { class: 'n' },
      dif
        ? h('span', { class: 'chip chip--bad', title: `Propietario: ${fmt(itemPropTotal(it))} unidades` }, (dif > 0 ? '+' : '') + fmt(dif))
        : h('span', { class: 'muted' }, 'OK')
    ),
    h('td', { class: 'n' }, sumValues(it.compras) ? fmt(sumValues(it.compras)) : h('span', { class: 'muted' }, '—')),
    h(
      'td',
      { class: 'n' },
      h(
        'div',
        { class: 'row', style: { flexWrap: 'nowrap', justifyContent: 'flex-end' } },
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => openItem(data, it, repaint) }, 'Editar'),
        h(
          'button',
          {
            class: 'btn btn--sm btn--danger',
            type: 'button',
            'aria-label': `Eliminar ${it.tipo} ${it.medida}`,
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Eliminar referencia',
                message: `Se eliminará «${it.tipo} · ${it.medida}» con ${fmt(itemTotal(it))} unidades ubicadas. La acción afecta al borrador local; el repositorio sólo cambia al publicar.`,
                confirmLabel: 'Eliminar',
                danger: true,
              });
              if (!ok) return;
              commit((d) => {
                d.items = d.items.filter((x) => x.id !== it.id);
              });
              toast('Referencia eliminada', `${it.tipo} · ${it.medida}`, 'warn');
              repaint();
            },
          },
          '✕'
        )
      )
    )
  );
}

function pager(total, pages, repaint) {
  const go = (p) => {
    page = Math.min(Math.max(1, p), pages);
    repaint();
  };
  return h(
    'div',
    { class: 'pager' },
    h('span', {}, `${fmt(total)} referencias`),
    h(
      'div',
      { class: 'pager__ctrls' },
      h('button', { class: 'btn btn--sm', type: 'button', disabled: page <= 1, onclick: () => go(1) }, '««'),
      h('button', { class: 'btn btn--sm', type: 'button', disabled: page <= 1, onclick: () => go(page - 1) }, 'Anterior'),
      h('span', { class: 'small num', style: { padding: '0 8px' } }, `${page} / ${pages}`),
      h('button', { class: 'btn btn--sm', type: 'button', disabled: page >= pages, onclick: () => go(page + 1) }, 'Siguiente'),
      h('button', { class: 'btn btn--sm', type: 'button', disabled: page >= pages, onclick: () => go(pages) }, '»»')
    )
  );
}

/* ------------------------------------------------------ edición de ítem -- */

function openItem(data, item, repaint) {
  const isNew = !item;
  const draft = item
    ? JSON.parse(JSON.stringify(item))
    : newItem(data);

  const tipoInput = h('input', {
    class: 'input',
    list: 'lista-tipos',
    value: draft.tipo,
    placeholder: 'FORMALETA DE MURO',
    oninput: (e) => {
      draft.tipo = e.target.value.toUpperCase();
      e.target.value = draft.tipo;
    },
  });

  const medidaInput = h('input', {
    class: 'input',
    value: draft.medida,
    placeholder: '60 cm x 1.15 mts',
    oninput: (e) => (draft.medida = e.target.value),
  });

  const notaInput = h('input', {
    class: 'input',
    value: draft.nota || '',
    placeholder: 'Observaciones (opcional)',
    oninput: (e) => (draft.nota = e.target.value),
  });

  const balance = h('div', { class: 'sum-line' });

  let cuadreAnterior = null;
  const refreshBalance = () => {
    const ub = sumValues(draft.ubicaciones);
    const pr = sumValues(draft.propietarios);
    clear(balance);
    balance.classList.toggle('is-bad', ub !== pr);
    // El recuento late sólo cuando el cuadre cambia de estado, no en cada tecla.
    const cuadra = ub === pr;
    if (cuadreAnterior !== null && cuadreAnterior !== cuadra && !prefersReduced()) {
      balance.classList.remove('is-pulsing');
      void balance.offsetWidth;
      balance.classList.add('is-pulsing');
    }
    cuadreAnterior = cuadra;
    balance.append(
      h('span', {}, `Ubicado: ${fmt(ub)} unidades · Asignado a propietarios: ${fmt(pr)} unidades`),
      h('span', {}, ub === pr ? 'Cuadra' : `Descuadre de ${fmt(Math.abs(pr - ub))}`)
    );
  };

  const numField = (label, bag, key) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, label),
      h('input', {
        class: 'input input--num',
        type: 'number',
        min: '0',
        step: '1',
        value: bag[key] || '',
        placeholder: '0',
        oninput: (e) => {
          const v = toInt(e.target.value);
          if (v > 0) bag[key] = v;
          else delete bag[key];
          refreshBalance();
        },
      })
    );

  const body = h(
    'div',
    {},
    h(
      'div',
      { class: 'form-grid' },
      h('label', { class: 'field span-2' }, h('span', { class: 'field__label' }, 'Tipo de formaleta'), tipoInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Medidas (ancho × altura)'), medidaInput)
    ),
    h('div', { class: 'form-grid', style: { marginTop: '16px' } }, h('label', { class: 'field span-2' }, h('span', { class: 'field__label' }, 'Nota'), notaInput)),

    h(
      'fieldset',
      { class: 'fieldset-rule' },
      h('legend', {}, 'Cantidades por sede / proyecto'),
      h('div', { class: 'form-grid form-grid--tight' }, data.ubicaciones.map((u) => numField(u.nombre, draft.ubicaciones, u.id)))
    ),

    h(
      'fieldset',
      { class: 'fieldset-rule' },
      h('legend', {}, 'Cantidades por propietario'),
      h('div', { class: 'form-grid form-grid--tight' }, data.propietarios.map((p) => numField(p.nombre, draft.propietarios, p.id)))
    ),

    balance,

    h(
      'fieldset',
      { class: 'fieldset-rule' },
      h('legend', {}, 'Unidades por compra'),
      h(
        'div',
        { class: 'form-grid form-grid--tight' },
        data.compras.map((c) => numField(`${c.etiqueta}${c.fecha ? ` · ${fmtFecha(c.fecha)}` : ''}`, draft.compras, c.id))
      )
    ),

    h('datalist', { id: 'lista-tipos' }, data.tipos.map((t) => h('option', { value: t })))
  );

  refreshBalance();

  const { close } = openModal({
    title: isNew ? 'Nueva referencia' : 'Editar referencia',
    subtitle: isNew ? 'Se añadirá al final del registro' : `${item.id} · ${item.tipo}`,
    body,
    footer: [
      h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancelar'),
      h(
        'button',
        {
          class: 'btn btn--primary',
          type: 'button',
          onclick: () => {
            if (!draft.tipo.trim()) {
              toast('Falta la tipología', 'Indique el tipo de formaleta.', 'bad');
              return;
            }
            draft.tipo = draft.tipo.trim().toUpperCase();
            draft.medida = draft.medida.trim() || 'NO APLICA';
            commit((d) => {
              if (isNew) {
                draft.n = d.items.length ? Math.max(...d.items.map((x) => x.n || 0)) + 1 : 1;
                d.items.push(draft);
              } else {
                const i = d.items.findIndex((x) => x.id === draft.id);
                if (i >= 0) d.items[i] = draft;
              }
              if (!d.tipos.includes(draft.tipo)) {
                d.tipos.push(draft.tipo);
                d.tipos.sort((a, b) => a.localeCompare(b, 'es'));
              }
            });
            toast(isNew ? 'Referencia añadida' : 'Referencia actualizada', `${draft.tipo} · ${draft.medida}`, 'ok');
            close();
            repaint();
          },
        },
        isNew ? 'Añadir referencia' : 'Guardar cambios'
      ),
    ],
  });
}

/* ------------------------------------------------------------ catálogos -- */

function openCatalogos(data, repaint) {
  const listEditor = (titulo, coleccion, { conFecha = false, onAdd, onRemove }) => {
    const list = h('div', { class: 'stack' });

    const draw = () => {
      clear(list);
      for (const entry of coleccion()) {
        const usos = countUsos(entry.id, titulo);
        list.append(
          h(
            'div',
            { class: 'spread', style: { borderBottom: '1px solid var(--rule)', paddingBottom: '8px' } },
            h(
              'div',
              {},
              h('b', {}, entry.nombre || entry.etiqueta),
              h('div', { class: 'small muted' }, conFecha ? fmtFecha(entry.fecha) : `${fmt(usos)} referencias`)
            ),
            h(
              'button',
              {
                class: 'btn btn--sm btn--danger',
                type: 'button',
                onclick: async () => {
                  const ok = await confirmDialog({
                    title: 'Eliminar del catálogo',
                    message: usos
                      ? `«${entry.nombre || entry.etiqueta}» tiene cantidades en ${fmt(usos)} referencias. Al eliminarlo esas cantidades se pierden.`
                      : `Se eliminará «${entry.nombre || entry.etiqueta}».`,
                    confirmLabel: 'Eliminar',
                    danger: true,
                  });
                  if (!ok) return;
                  onRemove(entry);
                  draw();
                  repaint();
                },
              },
              'Eliminar'
            )
          )
        );
      }
    };

    const nombre = h('input', { class: 'input', placeholder: 'Nombre' });
    const fecha = conFecha ? h('input', { class: 'input', type: 'date' }) : null;

    draw();

    return h(
      'fieldset',
      { class: 'fieldset-rule' },
      h('legend', {}, titulo),
      list,
      h(
        'div',
        { class: 'row', style: { marginTop: '12px' } },
        nombre,
        fecha,
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              const v = nombre.value.trim();
              if (!v) return;
              onAdd(v, fecha ? fecha.value : null);
              nombre.value = '';
              if (fecha) fecha.value = '';
              draw();
              repaint();
            },
          },
          'Añadir'
        )
      )
    );
  };

  const countUsos = (id, titulo) => {
    const bag = titulo.startsWith('Sedes') ? 'ubicaciones' : titulo.startsWith('Propietarios') ? 'propietarios' : 'compras';
    return store.data.items.filter((it) => it[bag][id]).length;
  };

  const body = h(
    'div',
    {},
    h(
      'p',
      { class: 'deck small' },
      'Las sedes, los propietarios y las compras definen las columnas del inventario. Las tipologías alimentan el autocompletado al crear referencias.'
    ),

    listEditor('Sedes y proyectos', () => store.data.ubicaciones, {
      onAdd: (nombre) =>
        commit((d) => {
          const id = uniqueId(nombre, d.ubicaciones);
          d.ubicaciones.push({ id, nombre });
        }),
      onRemove: (entry) =>
        commit((d) => {
          d.ubicaciones = d.ubicaciones.filter((x) => x.id !== entry.id);
          for (const it of d.items) delete it.ubicaciones[entry.id];
        }),
    }),

    listEditor('Propietarios', () => store.data.propietarios, {
      onAdd: (nombre) =>
        commit((d) => {
          const id = uniqueId(nombre, d.propietarios);
          d.propietarios.push({ id, nombre });
        }),
      onRemove: (entry) =>
        commit((d) => {
          d.propietarios = d.propietarios.filter((x) => x.id !== entry.id);
          for (const it of d.items) delete it.propietarios[entry.id];
        }),
    }),

    listEditor('Compras', () => store.data.compras.map((c) => ({ ...c, nombre: c.etiqueta })), {
      conFecha: true,
      onAdd: (nombre, fechaVal) =>
        commit((d) => {
          const n = d.compras.length + 1;
          let id = `c${n}`;
          let k = n;
          while (d.compras.some((c) => c.id === id)) id = `c${++k}`;
          d.compras.push({ id, etiqueta: nombre, fecha: fechaVal || '' });
        }),
      onRemove: (entry) =>
        commit((d) => {
          d.compras = d.compras.filter((x) => x.id !== entry.id);
          for (const it of d.items) delete it.compras[entry.id];
        }),
    }),

    tiposEditor(repaint)
  );

  openModal({
    title: 'Catálogos',
    subtitle: 'Sedes, propietarios, compras y tipologías',
    body,
    footer: [h('span', { class: 'small muted' }, 'Los cambios se guardan en el borrador local al instante.')],
  });
}

function tiposEditor(repaint) {
  const list = h('div', { class: 'row', style: { gap: '6px' } });
  const draw = () => {
    clear(list);
    for (const t of store.data.tipos) {
      const usos = store.data.items.filter((it) => it.tipo === t).length;
      list.append(
        h(
          'span',
          { class: `chip ${usos ? 'chip--brand' : ''}`, title: `${usos} referencias` },
          t,
          usos
            ? null
            : h(
                'button',
                {
                  class: 'btn btn--ghost btn--sm',
                  type: 'button',
                  style: { padding: '0 4px', marginLeft: '4px' },
                  'aria-label': `Eliminar ${t}`,
                  onclick: () => {
                    commit((d) => {
                      d.tipos = d.tipos.filter((x) => x !== t);
                    });
                    draw();
                    repaint();
                  },
                },
                '✕'
              )
        )
      );
    }
  };
  draw();

  const input = h('input', { class: 'input', placeholder: 'Nueva tipología' });
  return h(
    'fieldset',
    { class: 'fieldset-rule' },
    h('legend', {}, 'Tipologías'),
    list,
    h(
      'div',
      { class: 'row', style: { marginTop: '12px' } },
      input,
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            const v = input.value.trim().toUpperCase();
            if (!v) return;
            commit((d) => {
              if (!d.tipos.includes(v)) {
                d.tipos.push(v);
                d.tipos.sort((a, b) => a.localeCompare(b, 'es'));
              }
            });
            input.value = '';
            draw();
            repaint();
          },
        },
        'Añadir'
      )
    ),
    h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Sólo pueden eliminarse las tipologías sin referencias asociadas.')
  );
}

function uniqueId(nombre, list) {
  const base = slug(nombre);
  let id = base;
  let k = 2;
  while (list.some((x) => x.id === id)) id = `${base}_${k++}`;
  return id;
}
