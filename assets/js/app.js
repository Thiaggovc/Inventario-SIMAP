/* Arranque, cabecera y enrutado por hash. */

import { h, clear, fmt, toast, prefersReduced } from './util.js';
import { boot, store, subscribe } from './state.js';
import { renderResumen } from './views/resumen.js';
import { renderInventario } from './views/inventario.js';
import { renderDatos } from './views/datos.js';
import { hideTip, ensureDefs } from './charts.js';

const RUTAS = [
  { id: 'resumen', label: 'Resumen', render: renderResumen },
  { id: 'inventario', label: 'Inventario', render: renderInventario },
  { id: 'datos', label: 'Datos y publicación', render: renderDatos },
];

const LS_TEMA = 'simap.tema.v1';

let cleanup = null;

/* ---------------------------------------------------------------- tema -- */

function initTema() {
  const guardado = localStorage.getItem(LS_TEMA);
  if (guardado) document.documentElement.dataset.theme = guardado;
}

function toggleTema() {
  const actual =
    document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const nuevo = actual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nuevo;
  localStorage.setItem(LS_TEMA, nuevo);
  // Los gráficos leen los colores de las variables CSS: hay que redibujarlos.
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('simap:redraw')));
}

/* ------------------------------------------------------------ cabecera -- */

function masthead() {
  const estado = h(
    'div',
    { class: 'savestate', dataset: { dirty: 'false' }, title: 'Estado del borrador local' },
    h('span', { class: 'savestate__dot' }),
    h('span', { class: 'savestate__text' }, 'Sincronizado')
  );

  const nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' });
  nav.append(h('span', { class: 'nav__ink', 'aria-hidden': 'true' }));
  for (const r of RUTAS) {
    nav.append(
      h(
        'button',
        {
          class: 'nav__link',
          type: 'button',
          dataset: { ruta: r.id },
          onclick: () => {
            location.hash = `#/${r.id}`;
          },
        },
        r.label
      )
    );
  }

  const header = h(
    'header',
    { class: 'masthead' },
    h(
      'div',
      { class: 'shell' },
      h(
        'div',
        { class: 'masthead__bar' },
        h(
          'a',
          { class: 'brandmark', href: '#/resumen' },
          h('span', { class: 'brandmark__glyph' }, 'S'),
          h(
            'span',
            {},
            h('span', { class: 'brandmark__name' }, 'Grupo SIMAP'),
            h('span', { class: 'brandmark__sub' }, 'Control de formaletería')
          )
        ),
        h('div', { class: 'masthead__spacer' }),
        h(
          'div',
          { class: 'masthead__tools' },
          estado,
          h(
            'button',
            {
              class: 'btn btn--icon theme-toggle',
              type: 'button',
              'aria-label': 'Cambiar tema claro u oscuro',
              title: 'Tema claro / oscuro',
              onclick: toggleTema,
            },
            h('span', {}, '◐')
          )
        )
      ),
      nav
    ),
    h('span', { class: 'scrollbar-read', 'aria-hidden': 'true' })
  );

  const sync = () => {
    estado.dataset.dirty = String(store.dirty);
    estado.querySelector('.savestate__text').textContent = store.dirty
      ? 'Cambios sin publicar'
      : store.source === 'repositorio'
      ? 'Sincronizado'
      : 'Sin cambios';
  };
  subscribe(sync);
  sync();

  return { header, nav };
}

/* ------------------------------------------------------------- colofón -- */

function colophon() {
  return h(
    'footer',
    { class: 'colophon' },
    h(
      'div',
      { class: 'shell colophon__row' },
      h('span', {}, `${store.data.meta.empresa || 'Grupo SIMAP'} · Control de inventario de formaletería`),
      h('span', {}, `${fmt(store.data.items.length)} referencias · ${fmt(store.data.tipos.length)} tipologías`),
      h('span', {}, 'Datos alojados en el repositorio de GitHub de la empresa')
    )
  );
}

/* -------------------------------------------------------------- enrutado */

function rutaActual() {
  const id = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return RUTAS.find((r) => r.id === id) || RUTAS[0];
}

/** Desliza la píldora de cristal hasta la pestaña activa. */
function moverTinta(nav) {
  const activo = nav.querySelector('.nav__link[aria-current="page"]');
  const ink = nav.querySelector('.nav__ink');
  if (!activo || !ink) return;
  ink.style.width = `${activo.offsetWidth}px`;
  ink.style.transform = `translateX(${activo.offsetLeft}px)`;
}

function navegar(nav, main, { primera = false } = {}) {
  const ruta = rutaActual();
  for (const btn of nav.querySelectorAll('.nav__link')) {
    if (btn.dataset.ruta === ruta.id) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  moverTinta(nav);
  hideTip();

  const pintar = () => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = ruta.render(main) || null;
    document.title = `${ruta.label} · Inventario de formaletería · Grupo SIMAP`;
    main.classList.remove('view-exit');
    main.classList.remove('view-enter');
    void main.offsetWidth;
    if (!prefersReduced()) main.classList.add('view-enter');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // La vista saliente se desvanece antes de montar la entrante.
  if (primera || prefersReduced() || !main.firstChild) {
    pintar();
    return;
  }
  main.classList.add('view-exit');
  setTimeout(pintar, 190);
}

/* -------------------------------------------------------------- arranque */

/** Campo de luz que respira detrás del contenido. */
function aurora() {
  return h(
    'div',
    { class: 'aurora', 'aria-hidden': 'true' },
    h('span', { class: 'aurora__blob aurora__blob--1' }),
    h('span', { class: 'aurora__blob aurora__blob--2' }),
    h('span', { class: 'aurora__blob aurora__blob--3' })
  );
}

async function main() {
  initTema();
  document.body.prepend(aurora());
  ensureDefs();
  const root = document.getElementById('app');
  clear(root).append(h('div', { class: 'skeleton' }, 'Cargando inventario…'));

  try {
    await boot();
  } catch (err) {
    console.error(err);
    clear(root).append(
      h(
        'div',
        { class: 'shell', style: { padding: '60px 0' } },
        h('h1', { class: 'display' }, 'No se pudo cargar el inventario'),
        h('p', { class: 'deck' }, err.message),
        h('p', { class: 'deck small' }, 'Si abrió el archivo directamente desde el disco, sírvalo con un servidor web: los módulos de JavaScript no funcionan sobre file://.')
      )
    );
    return;
  }

  const { header, nav } = masthead();
  const mainEl = h('main', { id: 'main' });

  clear(root).append(header, mainEl, colophon());

  if (!location.hash) location.hash = '#/resumen';
  navegar(nav, mainEl, { primera: true });
  window.addEventListener('hashchange', () => navegar(nav, mainEl));
  window.addEventListener('resize', () => moverTinta(nav));

  /* Un solo oyente de scroll para la cabecera y el avance de lectura, medido
     una vez por fotograma: dos oyentes separados leían el layout dos veces. */
  const barra = header.querySelector('.scrollbar-read');
  let rafScroll = 0;
  const medir = () => {
    rafScroll = 0;
    header.dataset.scrolled = String(window.scrollY > 4);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    barra.style.width = max > 40 ? `${Math.min(100, (window.scrollY / max) * 100)}%` : '0%';
  };
  const onScroll = () => {
    if (!rafScroll) rafScroll = requestAnimationFrame(medir);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  medir();

  // Reflejo del cursor en cada botón de cristal.
  document.addEventListener('pointermove', (e) => {
    const btn = e.target.closest?.('.btn');
    if (!btn) return;
    const b = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', `${((e.clientX - b.left) / b.width) * 100}%`);
    btn.style.setProperty('--my', `${((e.clientY - b.top) / b.height) * 100}%`);
  }, { passive: true });

  // Onda al pulsar: confirma la pulsación en el punto exacto del dedo.
  document.addEventListener('pointerdown', (e) => {
    if (prefersReduced()) return;
    const btn = e.target.closest?.('.btn');
    if (!btn) return;
    const b = btn.getBoundingClientRect();
    const d = Math.max(b.width, b.height) * 2.2;
    const onda = h('span', {
      class: 'ripple',
      style: {
        left: `${e.clientX - b.left}px`,
        top: `${e.clientY - b.top}px`,
        width: `${d}px`,
        height: `${d}px`,
      },
    });
    btn.append(onda);
    setTimeout(() => onda.remove(), 640);
  });


  // Aviso al cerrar con cambios que sólo existen en este navegador.
  window.addEventListener('beforeunload', (e) => {
    if (!store.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  if (store.source === 'borrador local' && store.dirty) {
    toast('Borrador recuperado', 'Se restauraron los cambios sin publicar de este navegador.', 'warn');
  }
}

main();
