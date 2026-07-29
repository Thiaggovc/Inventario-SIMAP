/* Arranque, cabecera y enrutado por hash. */

import { h, clear, fmt, toast, prefersReduced } from './util.js';
import { boot, store, subscribe } from './state.js';
import { renderResumen } from './views/resumen.js';
import { renderInventario } from './views/inventario.js';
import { renderDatos } from './views/datos.js';
import { hideTip, ensureDefs } from './charts.js';
import { cerrarDesplegables } from './ui.js';

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
  cerrarDesplegables();

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
  const pantallaCarga = document.getElementById('boot');

  /* Arranque: mínimo 3 s, con la barra avanzando de verdad. El progreso no es
     decorativo — llega al 92 % con la carga de datos y remata al terminar. */
  const DUR_BOOT = 3000;
  const arrancado = performance.now();
  let progresoDatos = 0;

  if (pantallaCarga) {
    const nombre = document.getElementById('boot-name');
    [...'GRUPO SIMAP'].forEach((ch, i) => {
      nombre.append(
        h('span', { class: `boot__ch ${ch === ' ' ? 'boot__ch--sp' : ''}`, style: { '--c': i } },
          ch === ' ' ? '' : ch)
      );
    });

    const relleno = document.getElementById('boot-fill');
    const pct = document.getElementById('boot-pct');
    const tick = () => {
      const t = Math.min(1, (performance.now() - arrancado) / DUR_BOOT);
      // Se toma el menor entre el reloj y el avance real: la barra nunca miente.
      const v = Math.min(t, 0.08 + progresoDatos * 0.92);
      relleno.style.width = `${(v * 100).toFixed(1)}%`;
      pct.textContent = v >= 1 ? 'Listo' : `Cargando · ${Math.round(v * 100)} %`;
      if (t < 1 || v < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const retirarBoot = () => {
    if (!pantallaCarga) return;
    progresoDatos = 1;
    const espera = Math.max(0, DUR_BOOT - (performance.now() - arrancado));
    setTimeout(() => {
      pantallaCarga.classList.add('is-going');
      setTimeout(() => pantallaCarga.remove(), 660);
    }, espera);
  };

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
    retirarBoot();
    return;
  }

  const { header, nav } = masthead();
  const mainEl = h('main', { id: 'main' });

  clear(root).append(header, mainEl, colophon());
  retirarBoot();

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

  /* Reflejo del cursor sobre el botón y un tirón magnético hacia él: el botón
     se inclina unos píxeles hacia el dedo antes de que llegue. */
  let imantado = null;
  const soltarIman = () => {
    if (!imantado) return;
    imantado.style.removeProperty('--pull-x');
    imantado.style.removeProperty('--pull-y');
    imantado = null;
  };
  document.addEventListener('pointermove', (e) => {
    const btn = e.target.closest?.('.btn');
    if (!btn) {
      soltarIman();
      return;
    }
    if (imantado && imantado !== btn) soltarIman();
    const b = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', `${((e.clientX - b.left) / b.width) * 100}%`);
    btn.style.setProperty('--my', `${((e.clientY - b.top) / b.height) * 100}%`);
    if (prefersReduced() || e.pointerType === 'touch') return;
    const tope = (v, m) => Math.max(-m, Math.min(m, v));
    btn.style.setProperty('--pull-x', `${tope((e.clientX - (b.left + b.width / 2)) * 0.22, 7).toFixed(2)}px`);
    btn.style.setProperty('--pull-y', `${tope((e.clientY - (b.top + b.height / 2)) * 0.22, 5).toFixed(2)}px`);
    imantado = btn;
  }, { passive: true });
  document.addEventListener('pointerleave', soltarIman, { passive: true, capture: true });

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
