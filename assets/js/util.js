/* Utilidades compartidas: DOM, formato, descargas y avisos. */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list' && typeof v !== 'boolean') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function svg(tag, props = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* ------------------------------------------------------------- formato -- */

const NF = new Intl.NumberFormat('es-CO');

export const fmt = (n) => NF.format(Math.round(Number(n) || 0));

export function fmtCompact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return fmt(v);
}

export function fmtSigned(n) {
  const v = Math.round(Number(n) || 0);
  return (v > 0 ? '+' : '') + fmt(v);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Formatea una fecha ISO (yyyy-mm-dd) sin cruzar husos horarios. */
export function fmtFecha(iso, style = 'short') {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const [, y, mm, d] = m;
  const mes = MESES[Number(mm) - 1] || mm;
  if (style === 'mes') return `${mes} ${y}`;
  if (style === 'anio') return y;
  return `${Number(d)} ${mes} ${y}`;
}

export function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'id';

/** Normaliza texto para búsquedas: sin acentos, minúsculas, espacios simples. */
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function toInt(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + (Number(fn(b)) || 0), 0);

export function sumValues(obj) {
  let t = 0;
  for (const v of Object.values(obj || {})) t += Number(v) || 0;
  return t;
}

/* ------------------------------------------------------------ movimiento */

const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Respeta la preferencia del sistema de reducir el movimiento. */
export const prefersReduced = () => !!(reducedQuery && reducedQuery.matches);

/** Cuenta un número desde su valor previo hasta el nuevo. */
export function animateNumber(el, to, { from = 0, duration = 900, format = fmt } = {}) {
  const target = Number(to) || 0;
  if (prefersReduced()) {
    el.textContent = format(target);
    return;
  }
  const start = performance.now();
  const delta = target - from;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    // Desaceleración suave: rápido al principio, asentado al final.
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + delta * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Marca los elementos `.reveal` cuando entran en pantalla. El escalonado lo
 * aporta la variable `--i` de cada elemento.
 *
 * Se resuelve con un barrido en cada scroll, no con IntersectionObserver: sus
 * avisos son asíncronos y con un desplazamiento rápido llegan a perderse, y una
 * tarjeta que no recibe el aviso se queda invisible para siempre. El barrido
 * mira posiciones reales, así que no puede saltarse nada.
 */
export function observeReveal(root) {
  const pending = new Set($$('.reveal', root));

  const show = (el) => {
    pending.delete(el);
    el.classList.add('is-in');
    if (typeof el._firstDraw === 'function') el._firstDraw();
  };

  if (prefersReduced()) {
    for (const el of [...pending]) show(el);
    return () => {};
  }

  let raf = 0;
  const sweep = () => {
    raf = 0;
    const alto = window.innerHeight;
    for (const el of [...pending]) {
      const r = el.getBoundingClientRect();
      if (r.top < alto * 0.94 && r.bottom > 0) show(el);
    }
    if (!pending.size) detach();
  };

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(sweep);
  };

  const detach = () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(raf);
    raf = 0;
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();

  return () => {
    detach();
    pending.clear();
  };
}

/** Publica la posición del cursor como variables CSS, para los reflejos. */
export function trackPointer(el) {
  const onMove = (e) => {
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - b.left) / b.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - b.top) / b.height) * 100}%`);
  };
  el.addEventListener('pointermove', onMove);
  return () => el.removeEventListener('pointermove', onMove);
}

/* ----------------------------------------------------------- descargas -- */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/* -------------------------------------------------------------- avisos -- */

let toastHost = null;

export function toast(title, body = '', kind = '') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h(
    'div',
    { class: `toast ${kind ? 'toast--' + kind : ''}` },
    h('div', { class: 'toast__title' }, title),
    body ? h('div', { class: 'toast__body' }, body) : null
  );
  toastHost.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity 220ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 240);
  }, kind === 'bad' ? 7000 : 4200);
}

/* --------------------------------------------------------------- modal -- */

export function openModal({ title, subtitle, body, footer, width, onClose }) {
  const scrim = h('div', { class: 'modal-scrim' });
  const close = () => {
    scrim.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const modal = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: width ? { width } : null },
    h(
      'div',
      { class: 'modal__head' },
      h('div', {}, h('div', { class: 'modal__title' }, title), subtitle ? h('div', { class: 'card__sub' }, subtitle) : null),
      h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Cerrar', onclick: close }, '✕')
    ),
    h('div', { class: 'modal__body' }, body),
    footer ? h('div', { class: 'modal__foot' }, footer) : null
  );
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) close();
  });
  document.addEventListener('keydown', onKey);
  scrim.append(modal);
  document.body.append(scrim);
  document.body.style.overflow = 'hidden';
  const focusable = modal.querySelector('input, select, textarea, button:not([aria-label="Cerrar"])');
  if (focusable) focusable.focus();
  return { close, modal };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const { close } = openModal({
      title,
      width: '520px',
      body: h('p', { class: 'deck' }, message),
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: () => { finish(false); close(); } }, 'Cancelar'),
        h(
          'button',
          {
            class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
            type: 'button',
            onclick: () => { finish(true); close(); },
          },
          confirmLabel
        ),
      ],
      onClose: () => finish(false),
    });
  });
}

export function debounce(fn, ms = 220) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
