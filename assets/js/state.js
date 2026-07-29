/* Estado de la aplicación: carga, normalización, mutaciones y derivados.
 *
 * Fuente de verdad en reposo: data/inventario.json (versionado en el repositorio).
 * Mientras se trabaja, los cambios viven en localStorage hasta que se publican
 * de vuelta al repositorio o se exportan a un archivo.
 */

import { slug, sumValues, toInt, norm } from './util.js';
import { CATEGORIAS, clasificarTipo, esCategoriaValida } from './categorias.js';

export const LS_DATA = 'simap.inventario.v1';
export const LS_META = 'simap.inventario.meta.v1';

const listeners = new Set();

export const store = {
  data: null,
  /** Snapshot del archivo del repositorio, para saber si hay cambios locales. */
  baseline: '',
  dirty: false,
  source: 'repositorio',
  loadedAt: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(store);
}

/* --------------------------------------------------------- normalización -- */

export function emptyData() {
  return {
    meta: {
      empresa: 'Grupo SIMAP',
      titulo: 'Control de Inventario de Formaletería',
      fechaElaboracion: '',
      elaboradoPor: '',
      revisadoPor: '',
      version: 1,
      actualizado: new Date().toISOString(),
    },
    ubicaciones: [],
    propietarios: [],
    compras: [],
    categorias: CATEGORIAS.map((c) => ({ ...c })),
    tipos: [],
    tiposCategoria: {},
    items: [],
  };
}

/** Deja cualquier objeto entrante en la forma canónica que usa la app. */
export function normalizeData(raw) {
  const base = emptyData();
  const d = raw && typeof raw === 'object' ? raw : {};

  const data = {
    meta: { ...base.meta, ...(d.meta || {}) },
    ubicaciones: [],
    propietarios: [],
    compras: [],
    categorias: CATEGORIAS.map((c) => ({ ...c })),
    tipos: [],
    tiposCategoria: {},
    items: [],
  };

  const catalog = (list, prefix) => {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(list) ? list : []) {
      const nombre = String((typeof raw === 'string' ? raw : raw?.nombre) ?? '').trim();
      if (!nombre) continue;
      let id = String((typeof raw === 'object' && raw?.id) || slug(nombre));
      while (seen.has(id)) id = `${id}_${prefix}`;
      seen.add(id);
      out.push({ id, nombre });
    }
    return out;
  };

  data.ubicaciones = catalog(d.ubicaciones, 'u');
  data.propietarios = catalog(d.propietarios, 'p');

  const comprasSeen = new Set();
  (Array.isArray(d.compras) ? d.compras : []).forEach((c, i) => {
    const id = String(c?.id || `c${i + 1}`);
    if (comprasSeen.has(id)) return;
    comprasSeen.add(id);
    data.compras.push({
      id,
      etiqueta: String(c?.etiqueta || `Compra #${i + 1}`),
      fecha: normFecha(c?.fecha),
    });
  });

  const ubIds = data.ubicaciones.map((u) => u.id);
  const prIds = data.propietarios.map((p) => p.id);
  const cIds = data.compras.map((c) => c.id);

  const usedIds = new Set();
  (Array.isArray(d.items) ? d.items : []).forEach((it, i) => {
    let id = String(it?.id || `IT-${String(i + 1).padStart(4, '0')}`);
    while (usedIds.has(id)) id = `${id}b`;
    usedIds.add(id);

    const pick = (src, keys) => {
      const out = {};
      for (const k of keys) {
        const v = toInt(src?.[k]);
        if (v) out[k] = v;
      }
      return out;
    };

    data.items.push({
      id,
      n: toInt(it?.n) || i + 1,
      tipo: String(it?.tipo || 'SIN CLASIFICAR').trim().toUpperCase(),
      medida: String(it?.medida || 'NO APLICA').trim(),
      nota: String(it?.nota || '').trim(),
      ubicaciones: pick(it?.ubicaciones, ubIds),
      propietarios: pick(it?.propietarios, prIds),
      compras: pick(it?.compras, cIds),
    });
  });

  const tipos = new Set((Array.isArray(d.tipos) ? d.tipos : []).map((t) => String(t).trim().toUpperCase()).filter(Boolean));
  for (const it of data.items) tipos.add(it.tipo);
  data.tipos = Array.from(tipos).sort((a, b) => a.localeCompare(b, 'es'));

  /* La clasificación guardada manda; el reparto por omisión sólo cubre lo que
     llega sin clasificar —una tipología nueva o un Excel recién importado—. */
  const guardadas = d.tiposCategoria && typeof d.tiposCategoria === 'object' ? d.tiposCategoria : {};
  for (const t of data.tipos) {
    const puesta = String(guardadas[t] || '').trim();
    data.tiposCategoria[t] = esCategoriaValida(puesta) ? puesta : clasificarTipo(t);
  }

  return data;
}

/** Acepta ISO, Date o serial de Excel y devuelve yyyy-mm-dd (o cadena vacía). */
export function normFecha(v) {
  if (!v && v !== 0) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial de Excel: día 1 = 1900-01-01, con el bug del 29-feb-1900.
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ carga --- */

export async function boot() {
  let repoData = null;
  try {
    const res = await fetch(`data/inventario.json?v=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) repoData = await res.json();
  } catch (err) {
    console.warn('No se pudo leer data/inventario.json', err);
  }

  store.baseline = repoData ? stableStringify(normalizeData(repoData)) : '';

  const cached = localStorage.getItem(LS_DATA);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      store.data = normalizeData(parsed);
      store.source = 'borrador local';
      store.dirty = stableStringify(store.data) !== store.baseline;
      store.loadedAt = new Date().toISOString();
      emit();
      return store;
    } catch (err) {
      console.warn('Borrador local ilegible, se descarta', err);
      localStorage.removeItem(LS_DATA);
    }
  }

  store.data = normalizeData(repoData || emptyData());
  store.source = repoData ? 'repositorio' : 'vacío';
  store.dirty = false;
  store.loadedAt = new Date().toISOString();
  emit();
  return store;
}

/** Serialización estable: el orden de claves no debe generar falsos cambios. */
export function stableStringify(value) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
    return out;
  };
  return JSON.stringify(walk(value));
}

/* ------------------------------------------------------------ mutación -- */

/** Aplica un cambio, persiste el borrador y notifica a las vistas. */
export function commit(mutator, { silent = false } = {}) {
  if (typeof mutator === 'function') mutator(store.data);
  store.data.meta.actualizado = new Date().toISOString();
  const json = stableStringify(store.data);
  store.dirty = json !== store.baseline;
  store.source = 'borrador local';
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(store.data));
  } catch (err) {
    console.warn('No se pudo guardar el borrador local', err);
  }
  if (!silent) emit();
  return store.data;
}

/** Reemplaza todo el conjunto de datos (importación o carga remota). */
export function replaceData(raw, { source = 'importado', asBaseline = false } = {}) {
  store.data = normalizeData(raw);
  if (asBaseline) {
    store.baseline = stableStringify(store.data);
    localStorage.removeItem(LS_DATA);
    store.dirty = false;
  } else {
    localStorage.setItem(LS_DATA, JSON.stringify(store.data));
    store.dirty = stableStringify(store.data) !== store.baseline;
  }
  store.source = source;
  store.loadedAt = new Date().toISOString();
  emit();
  return store.data;
}

/** Marca el estado actual como publicado (tras un commit exitoso a GitHub). */
export function markPublished() {
  store.baseline = stableStringify(store.data);
  store.dirty = false;
  store.source = 'repositorio';
  localStorage.removeItem(LS_DATA);
  emit();
}

/** Descarta el borrador local y recarga desde el repositorio. */
export async function discardDraft() {
  localStorage.removeItem(LS_DATA);
  return boot();
}

export function nextItemId(data) {
  let max = 0;
  for (const it of data.items) {
    const m = /(\d+)/.exec(it.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `IT-${String(max + 1).padStart(4, '0')}`;
}

export function newItem(data) {
  return {
    id: nextItemId(data),
    n: data.items.length + 1,
    tipo: data.tipos[0] || 'SIN CLASIFICAR',
    medida: '',
    nota: '',
    ubicaciones: {},
    propietarios: {},
    compras: {},
  };
}

/* ----------------------------------------------------------- derivados -- */

/** Categoría de una tipología, con reparto por omisión si aún no está puesta. */
export function categoriaDe(data, tipo) {
  return data?.tiposCategoria?.[tipo] || clasificarTipo(tipo);
}

/** Reasigna una tipología a otra categoría. Devuelve si algo cambió. */
export function setCategoriaTipo(data, tipo, categoria) {
  if (!esCategoriaValida(categoria)) return false;
  if (data.tiposCategoria[tipo] === categoria) return false;
  data.tiposCategoria[tipo] = categoria;
  return true;
}

export const itemTotal = (it) => sumValues(it.ubicaciones);
export const itemPropTotal = (it) => sumValues(it.propietarios);
export const itemCompras = (it) => sumValues(it.compras);

/**
 * Descuadre entre lo ubicado físicamente y lo asignado por propietario.
 * En el archivo original esto corresponde a la columna de verificación OK/ERROR.
 */
export const itemDescuadre = (it) => itemPropTotal(it) - itemTotal(it);

export function filterItems(data, f = {}) {
  const q = norm(f.q || '');
  const tipos = f.tipos && f.tipos.length ? new Set(f.tipos) : null;
  const categoria = f.categoria || '';
  const ubic = f.ubicacion || '';
  const prop = f.propietario || '';
  const compra = f.compra || '';
  const soloDescuadre = !!f.soloDescuadre;
  const soloConStock = !!f.soloConStock;

  return data.items.filter((it) => {
    if (soloConStock && itemTotal(it) === 0) return false;
    if (tipos && !tipos.has(it.tipo)) return false;
    if (categoria && categoriaDe(data, it.tipo) !== categoria) return false;
    if (ubic && !it.ubicaciones[ubic]) return false;
    if (prop && !it.propietarios[prop]) return false;
    if (compra && !it.compras[compra]) return false;
    if (soloDescuadre && itemDescuadre(it) === 0) return false;
    if (q && !norm(`${it.tipo} ${it.medida} ${it.nota} ${it.id}`).includes(q)) return false;
    return true;
  });
}

/** Agrega cantidades por una dimensión, respetando el filtro de ubicación. */
export function aggregate(items, keyFn, valueFn) {
  const map = new Map();
  for (const it of items) {
    const key = keyFn(it);
    if (key === null || key === undefined) continue;
    map.set(key, (map.get(key) || 0) + valueFn(it));
  }
  return Array.from(map, ([key, value]) => ({ key, value }));
}

/**
 * Métricas del tablero para el subconjunto filtrado.
 * `ubicacionFiltro` limita las cantidades a una sola bodega/proyecto.
 */
export function summarize(data, items, ubicacionFiltro = '') {
  const qty = (it) =>
    ubicacionFiltro ? Number(it.ubicaciones[ubicacionFiltro]) || 0 : sumValues(it.ubicaciones);

  const porUbicacion = data.ubicaciones.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    value: items.reduce((a, it) => a + (Number(it.ubicaciones[u.id]) || 0), 0),
  }));

  const porPropietario = data.propietarios.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    value: items.reduce((a, it) => a + (Number(it.propietarios[p.id]) || 0), 0),
  }));

  const porCompra = data.compras.map((c) => ({
    id: c.id,
    etiqueta: c.etiqueta,
    fecha: c.fecha,
    value: items.reduce((a, it) => a + (Number(it.compras[c.id]) || 0), 0),
  }));

  const porTipo = aggregate(items, (it) => it.tipo, qty)
    .sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key), 'es'));

  const porMedida = aggregate(items, (it) => it.medida || 'NO APLICA', qty)
    .sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key), 'es'));

  const porCategoria = data.categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    value: items.reduce((a, it) => a + (categoriaDe(data, it.tipo) === c.id ? qty(it) : 0), 0),
    referencias: items.filter((it) => categoriaDe(data, it.tipo) === c.id).length,
    tipologias: new Set(items.filter((it) => categoriaDe(data, it.tipo) === c.id).map((it) => it.tipo)).size,
  }));

  const descuadres = items.filter((it) => itemDescuadre(it) !== 0);
  const sinUbicar = items.filter((it) => itemTotal(it) === 0 && itemCompras(it) > 0);

  return {
    unidades: items.reduce((a, it) => a + qty(it), 0),
    referencias: items.length,
    tipologias: new Set(items.map((it) => it.tipo)).size,
    medidas: new Set(items.map((it) => it.medida)).size,
    compradas: items.reduce((a, it) => a + itemCompras(it), 0),
    porUbicacion,
    porPropietario,
    porCompra: porCompra.filter((c) => c.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porTipo,
    porMedida,
    porCategoria,
    descuadres,
    sinUbicar,
  };
}

/** Matriz tipología × ubicación para las barras apiladas. */
export function crossTipoUbicacion(items, ubicaciones, topN = 10) {
  const map = new Map();
  for (const it of items) {
    let row = map.get(it.tipo);
    if (!row) {
      row = { key: it.tipo, total: 0, parts: {} };
      map.set(it.tipo, row);
    }
    for (const u of ubicaciones) {
      const v = Number(it.ubicaciones[u.id]) || 0;
      if (!v) continue;
      row.parts[u.id] = (row.parts[u.id] || 0) + v;
      row.total += v;
    }
  }
  const rows = Array.from(map.values())
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  if (rows.length <= topN) return rows;

  const head = rows.slice(0, topN);
  const tail = rows.slice(topN);
  const otras = { key: `OTRAS (${tail.length} tipologías)`, total: 0, parts: {}, isOther: true };
  for (const r of tail) {
    otras.total += r.total;
    for (const [k, v] of Object.entries(r.parts)) otras.parts[k] = (otras.parts[k] || 0) + v;
  }
  head.push(otras);
  return head;
}
