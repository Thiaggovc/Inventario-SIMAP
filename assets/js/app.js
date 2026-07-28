/* Arranque, cabecera y enrutado por hash. */

import { h, clear, fmt, toast } from './util.js';
import { boot, store, subscribe } from './state.js';
import { renderResumen } from './views/resumen.js';
import { renderInventario } from './views/inventario.js';
import { renderDatos } from './views/datos.js';
import { hideTip } from './charts.js';

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
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
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
            { class: 'btn btn--icon', type: 'button', 'aria-label': 'Cambiar tema claro u oscuro', title: 'Tema claro / oscuro', onclick: toggleTema },
            '◐'
          )
        )
      ),
      nav
    )
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

function navegar(nav, main) {
  const ruta = rutaActual();
  for (const btn of nav.querySelectorAll('.nav__link')) {
    if (btn.dataset.ruta === ruta.id) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  hideTip();
  if (typeof cleanup === 'function') cleanup();
  cleanup = ruta.render(main) || null;
  document.title = `${ruta.label} · Inventario de formaletería · Grupo SIMAP`;
  window.scrollTo({ top: 0 });
}

/* -------------------------------------------------------------- arranque */

async function main() {
  initTema();
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
  navegar(nav, mainEl);
  window.addEventListener('hashchange', () => navegar(nav, mainEl));

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
