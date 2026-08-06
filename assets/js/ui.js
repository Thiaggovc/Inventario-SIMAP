/* Controles propios con el mismo lenguaje de cristal que el resto.
 *
 * El desplegable nativo lo dibuja el sistema operativo: no admite ni el vidrio,
 * ni el degradado, ni la animación del proyecto. Éste sí, y mantiene el patrón
 * de accesibilidad de un listbox (teclado completo, roles y foco gestionado).
 */

import { h, clear, norm, prefersReduced, fmt, fmtCompact } from './util.js';

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
  /* `criterio` acota la lista desde fuera —p. ej. sólo las tipologías de la
     categoría puesta—; la búsqueda del panel filtra sobre lo ya acotado. */
  let criterio = null;
  const disponibles = () => (criterio ? options.filter(criterio) : options.slice());
  let visibles = disponibles();

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
                const base = disponibles();
                pintarOpciones(q ? base.filter((o) => norm(o.label).includes(q)) : base);
              },
            })
          )
        : null,
      h('div', { class: 'gs__list' })
    );

    document.body.append(panel);
    situar();
    pintarOpciones(disponibles());
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
  /** Acota las opciones ofrecidas sin rehacer el control. */
  raiz._filtrar = (fn) => {
    criterio = typeof fn === 'function' ? fn : null;
    if (panel) pintarOpciones(disponibles());
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

/* -------------------------------------------------------- control de eje -- */

/** Paso redondo cómodo para escalonar los topes sugeridos de un eje. */
function pasoRedondo(x) {
  const raw = Math.max(x, 1) / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n >= 5 ? 5 : n >= 2 ? 2 : n >= 1 ? 1 : 0.5) * mag;
}

/** Topes sugeridos: el primero justo por encima de los datos, y tres escalones. */
function sugerirTopes(dataMax) {
  const base = Math.max(dataMax || 0, 1);
  const paso = pasoRedondo(base);
  const primero = Math.max(paso, Math.ceil(base / paso) * paso);
  return [primero, primero + paso, primero + paso * 2, primero + paso * 3];
}

/**
 * Control del eje de valores. Un botón de cristal que abre un panel para fijar
 * a mano el máximo del eje —o volver a «Automático»—. Sin tope, el gráfico
 * elige la escala; con tope, quien lee decide cuánta cabeza deja sobre los
 * datos y, por tanto, cómo se aprecia la variación.
 */
export function axisControl({ valor = null, autoMax = 0, dataMax = 0, onChange, ariaLabel = 'Ajustar el eje de valores' }) {
  const etiqueta = h('span', { class: 'gs__value' });
  const btn = h(
    'button',
    {
      class: 'gs__btn gs__btn--sm axisctl__btn',
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': ariaLabel,
    },
    h('span', { class: 'axisctl__ico', 'aria-hidden': 'true' }, '⇥'),
    etiqueta,
    h('span', { class: 'gs__caret', 'aria-hidden': 'true' })
  );

  const raiz = h('div', { class: 'gs gs--compact axisctl' }, btn);
  let actual = valor && valor > 0 ? Math.round(valor) : null;

  const pintar = () => {
    etiqueta.textContent = actual ? `Eje ${fmtCompact(actual)}` : 'Eje auto';
    btn.classList.toggle('is-set', actual != null);
  };
  pintar();

  let panel = null;

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
  };

  const fuera = (e) => {
    if (panel && !panel.contains(e.target) && !raiz.contains(e.target)) cerrar();
  };

  const aplicar = (v) => {
    actual = v && v > 0 ? Math.round(v) : null;
    pintar();
    cerrar();
    btn.focus({ preventScroll: true });
    if (onChange) onChange(actual);
  };

  const situar = () => {
    const b = btn.getBoundingClientRect();
    const ancho = 236;
    panel.style.width = `${ancho}px`;
    const abajo = window.innerHeight - b.bottom - 12;
    const arriba = b.top - 12;
    const haciaArriba = abajo < 210 && arriba > abajo;
    panel.style.left = `${Math.max(12, Math.min(b.left, window.innerWidth - ancho - 12))}px`;
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

  const abrir = () => {
    if (panel) return cerrar();
    cerrarDesplegables();

    const input = h('input', {
      class: 'gs__input axisctl__input',
      type: 'number',
      inputmode: 'numeric',
      min: '1',
      step: '100',
      placeholder: autoMax ? fmt(autoMax) : 'Máximo',
      value: actual != null ? String(actual) : '',
      'aria-label': 'Máximo del eje',
    });
    const enviar = () => aplicar(Number(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        enviar();
      }
    });

    const topes = sugerirTopes(dataMax);

    panel = h(
      'div',
      { class: 'gs__panel axisctl__panel', role: 'dialog', 'aria-label': ariaLabel },
      h('div', { class: 'axisctl__head' }, 'Máximo del eje'),
      dataMax
        ? h('div', { class: 'axisctl__hint' }, `Los datos llegan a ${fmt(dataMax)}. Automático: ${fmt(autoMax || dataMax)}.`)
        : null,
      h(
        'div',
        { class: 'axisctl__chips' },
        topes.map((n) =>
          h('button', { class: `axisctl__chip ${actual === n ? 'is-on' : ''}`, type: 'button', onclick: () => aplicar(n) }, fmtCompact(n))
        )
      ),
      h(
        'div',
        { class: 'axisctl__row' },
        input,
        h('button', { class: 'btn btn--sm btn--primary', type: 'button', onclick: enviar }, 'Aplicar')
      ),
      h('button', { class: `btn btn--sm btn--ghost axisctl__auto ${actual == null ? 'is-on' : ''}`, type: 'button', onclick: () => aplicar(null) }, 'Automático')
    );

    document.body.append(panel);
    situar();
    btn.setAttribute('aria-expanded', 'true');
    abierto = { close: cerrar };
    document.addEventListener('pointerdown', fuera, true);
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);
    input.focus({ preventScroll: true });
    input.select();
  };

  btn.addEventListener('click', abrir);
  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) {
      e.preventDefault();
      cerrar();
      btn.focus({ preventScroll: true });
    }
  });

  raiz._set = (v) => {
    actual = v && v > 0 ? Math.round(v) : null;
    pintar();
  };
  raiz._dispose = cerrar;
  return raiz;
}
