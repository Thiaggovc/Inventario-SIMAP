/* Controles propios con el mismo lenguaje de cristal que el resto.
 *
 * El desplegable nativo lo dibuja el sistema operativo: no admite ni el vidrio,
 * ni el degradado, ni la animación del proyecto. Éste sí, y mantiene el patrón
 * de accesibilidad de un listbox (teclado completo, roles y foco gestionado).
 */

import { h, clear, norm, prefersReduced } from './util.js';

let abierto = null;

/** Cierra el desplegable que esté abierto, si lo hay. */
export function cerrarDesplegables() {
  if (abierto) abierto.close();
}

/**
 * Desplegable de cristal.
 * El panel se cuelga del `body` para que ninguna tarjeta con recorte lo corte,
 * y se sitúa con coordenadas fijas junto al botón.
 */
export function glassSelect({
  value = '',
  options = [],
  onChange,
  ariaLabel = 'Seleccionar',
  compact = false,
  buscable = null,
  placeholder = '—',
}) {
  const buscar = buscable === null ? options.length > 12 : buscable;

  const etiqueta = h('span', { class: 'gs__value' });
  const btn = h(
    'button',
    {
      class: `gs__btn ${compact ? 'gs__btn--sm' : ''}`,
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': ariaLabel,
    },
    etiqueta,
    h('span', { class: 'gs__caret', 'aria-hidden': 'true' })
  );

  const raiz = h('div', { class: `gs ${compact ? 'gs--compact' : ''}` }, btn);
  raiz.dataset.value = value;

  const pintarEtiqueta = () => {
    const op = options.find((o) => String(o.value) === String(raiz.dataset.value));
    etiqueta.textContent = op ? op.label : placeholder;
    btn.classList.toggle('is-set', !!(op && op.value !== ''));
  };
  pintarEtiqueta();

  let panel = null;
  let activo = -1;
  let visibles = options.slice();

  const cerrar = () => {
    if (!panel) return;
    const p = panel;
    panel = null;
    abierto = null;
    btn.setAttribute('aria-expanded', 'false');
    p.classList.add('is-closing');
    setTimeout(() => p.remove(), prefersReduced() ? 0 : 140);
    document.removeEventListener('pointerdown', fuera, true);
    window.removeEventListener('resize', cerrar);
    window.removeEventListener('scroll', cerrar, true);
    btn.focus({ preventScroll: true });
  };

  const fuera = (e) => {
    if (panel && !panel.contains(e.target) && !raiz.contains(e.target)) cerrar();
  };

  const elegir = (op) => {
    raiz.dataset.value = String(op.value);
    pintarEtiqueta();
    cerrar();
    if (onChange) onChange(op.value, op);
  };

  const marcarActivo = (i) => {
    if (!panel) return;
    const items = panel.querySelectorAll('.gs__op');
    activo = Math.max(0, Math.min(i, items.length - 1));
    items.forEach((el, k) => el.classList.toggle('is-active', k === activo));
    const el = items[activo];
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  const pintarOpciones = (lista) => {
    const cuerpo = panel.querySelector('.gs__list');
    clear(cuerpo);
    visibles = lista;
    if (!lista.length) {
      cuerpo.append(h('div', { class: 'gs__vacio' }, 'Sin coincidencias'));
      return;
    }
    lista.forEach((op, i) => {
      const sel = String(op.value) === String(raiz.dataset.value);
      cuerpo.append(
        h(
          'div',
          {
            class: `gs__op ${sel ? 'is-selected' : ''}`,
            role: 'option',
            'aria-selected': String(sel),
            style: { '--o': Math.min(i, 12) },
            onclick: () => elegir(op),
            onmousemove: () => marcarActivo(i),
          },
          op.color ? h('span', { class: 'gs__punto', style: { background: op.color } }) : null,
          h('span', { class: 'gs__op-label' }, op.label),
          op.hint ? h('span', { class: 'gs__op-hint' }, op.hint) : null
        )
      );
    });
    const iSel = lista.findIndex((o) => String(o.value) === String(raiz.dataset.value));
    marcarActivo(iSel >= 0 ? iSel : 0);
  };

  const abrir = () => {
    if (panel) return cerrar();
    cerrarDesplegables();

    panel = h(
      'div',
      { class: 'gs__panel', role: 'listbox', 'aria-label': ariaLabel },
      buscar
        ? h(
            'div',
            { class: 'gs__buscar' },
            h('input', {
              class: 'gs__input',
              type: 'search',
              placeholder: 'Filtrar…',
              'aria-label': 'Filtrar opciones',
              oninput: (e) => {
                const q = norm(e.target.value);
                pintarOpciones(q ? options.filter((o) => norm(o.label).includes(q)) : options.slice());
              },
            })
          )
        : null,
      h('div', { class: 'gs__list' })
    );

    document.body.append(panel);
    situar();
    pintarOpciones(options.slice());
    btn.setAttribute('aria-expanded', 'true');
    abierto = { close: cerrar };

    document.addEventListener('pointerdown', fuera, true);
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);

    const inp = panel.querySelector('.gs__input');
    if (inp) inp.focus({ preventScroll: true });
  };

  /* Se ancla al botón y se voltea hacia arriba si no cabe debajo. */
  const situar = () => {
    const b = btn.getBoundingClientRect();
    const alto = Math.min(340, window.innerHeight - 24);
    const abajo = window.innerHeight - b.bottom - 12;
    const arriba = b.top - 12;
    const haciaArriba = abajo < 200 && arriba > abajo;
    panel.style.minWidth = `${Math.max(b.width, 190)}px`;
    panel.style.maxHeight = `${Math.min(alto, haciaArriba ? arriba : abajo)}px`;
    panel.style.left = `${Math.min(b.left, window.innerWidth - Math.max(b.width, 190) - 12)}px`;
    if (haciaArriba) {
      panel.style.bottom = `${window.innerHeight - b.top + 6}px`;
      panel.style.top = 'auto';
      panel.dataset.dir = 'up';
    } else {
      panel.style.top = `${b.bottom + 6}px`;
      panel.style.bottom = 'auto';
      panel.dataset.dir = 'down';
    }
  };

  btn.addEventListener('click', abrir);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      abrir();
    }
  });

  raiz.addEventListener('keydown', (e) => {
    if (!panel) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      marcarActivo(activo + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      marcarActivo(activo - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      marcarActivo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      marcarActivo(visibles.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibles[activo]) elegir(visibles[activo]);
    }
  });

  /** Permite refrescar el valor desde fuera sin disparar el cambio. */
  raiz._set = (v) => {
    raiz.dataset.value = String(v ?? '');
    pintarEtiqueta();
  };
  raiz._dispose = cerrar;

  return raiz;
}

/** Grupo de botones excluyentes, para elegir la forma de un gráfico. */
export function segmented({ value, options, onChange, ariaLabel = 'Vista' }) {
  const raiz = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': ariaLabel });
  // Píldora de cristal que se desliza hasta la opción elegida.
  const tinta = h('span', { class: 'seg__ink', 'aria-hidden': 'true' });
  raiz.append(tinta);

  const colocar = () => {
    /* El tablero rehace sus tarjetas a cada repintado; sin esto los oyentes de
       `resize` se acumularían con cada segmentado desechado. */
    if (raiz._montado && !raiz.isConnected) {
      window.removeEventListener('resize', colocar);
      return;
    }
    const activo = raiz.querySelector('.seg__btn[aria-checked="true"]');
    if (!activo || !activo.offsetWidth) return;
    tinta.style.width = `${activo.offsetWidth}px`;
    tinta.style.height = `${activo.offsetHeight}px`;
    tinta.style.transform = `translate(${activo.offsetLeft}px, ${activo.offsetTop}px)`;
    raiz.classList.add('is-ready');
    raiz._montado = true;
  };

  const pintar = () => {
    for (const b of raiz.querySelectorAll('.seg__btn')) {
      b.setAttribute('aria-checked', String(b.dataset.v === String(raiz.dataset.value)));
    }
    colocar();
  };
  raiz.dataset.value = value;
  for (const op of options) {
    raiz.append(
      h(
        'button',
        {
          class: 'seg__btn',
          type: 'button',
          role: 'radio',
          dataset: { v: String(op.value) },
          title: op.title || op.label,
          'aria-checked': String(String(op.value) === String(value)),
          onclick: () => {
            if (String(raiz.dataset.value) === String(op.value)) return;
            raiz.dataset.value = String(op.value);
            pintar();
            onChange(op.value);
          },
        },
        op.icon ? h('span', { class: 'seg__icon', 'aria-hidden': 'true' }, op.icon) : null,
        h('span', {}, op.label)
      )
    );
  }

  /* Al construirlo aún no está en el documento: la primera colocación espera
     al siguiente fotograma, cuando ya tiene medidas. */
  requestAnimationFrame(colocar);
  window.addEventListener('resize', colocar, { passive: true });
  raiz._reposicionar = colocar;
  return raiz;
}
