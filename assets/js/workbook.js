/* Puente entre el modelo de datos y los archivos de intercambio.
 *
 * La hoja «INVENTARIO» que se exporta conserva la misma estructura de tres
 * niveles del archivo original de Grupo SIMAP —fila de grupos, fila de nombres,
 * fila de fechas de compra— de modo que un mismo lector entiende tanto el
 * archivo histórico como cualquier exportación de esta aplicación.
 */

import { readXlsx, writeXlsx, toCsv, parseCsv } from './xlsx.js';
import { normFecha, normalizeData, itemTotal, itemPropTotal, itemDescuadre, categoriaDe } from './state.js';
import { nombreCategoria, esCategoriaValida, CATEGORIAS } from './categorias.js';
import { slug, norm, toInt, sumValues } from './util.js';

const G_UBIC = 'PROYECTO / UBICACIÓN';
const G_PROP = 'PROPIETARIO';
const G_COMPRA = 'CONTROL DE CANTIDADES';
const G_TOTAL = 'TOTALES';
const G_EXTRA = 'REGISTRO';

/* ---------------------------------------------------------- exportación -- */

function inventarioSheet(data) {
  const ub = data.ubicaciones;
  const pr = data.propietarios;
  const cp = data.compras;

  const cN = 0;
  const cTipo = 1;
  const cMedida = 2;
  const cUb = 3;
  const cPr = cUb + ub.length;
  const cCp = cPr + pr.length;
  const cTot = cCp + cp.length;
  const cExtra = cTot + 3;
  const width = cExtra + 3;

  const blank = () => new Array(width).fill(null);

  const titulo = blank();
  titulo[0] = `${data.meta.empresa || 'GRUPO SIMAP'} · ${(data.meta.titulo || 'Control de inventario de formaletería').toUpperCase()}`;

  const info = blank();
  info[0] = `Elaborado por: ${data.meta.elaboradoPor || '—'}`;
  info[cUb] = `Revisado por: ${data.meta.revisadoPor || '—'}`;
  info[cCp] = `Exportado: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  const grupos = blank();
  grupos[cTipo] = 'TIPO DE FORMALETA';
  grupos[cMedida] = 'MEDIDAS';
  grupos[cN] = 'N°';
  grupos[cUb] = G_UBIC;
  grupos[cPr] = G_PROP;
  grupos[cCp] = G_COMPRA;
  grupos[cTot] = G_TOTAL;
  grupos[cExtra] = G_EXTRA;

  const nombres = blank();
  nombres[cN] = 'N°';
  nombres[cTipo] = 'TIPO DE FORMALETA';
  nombres[cMedida] = 'MEDIDAS';
  ub.forEach((u, i) => (nombres[cUb + i] = u.nombre));
  pr.forEach((p, i) => (nombres[cPr + i] = p.nombre));
  cp.forEach((c, i) => (nombres[cCp + i] = c.etiqueta));
  nombres[cTot] = 'TOTAL UBICADO';
  nombres[cTot + 1] = 'TOTAL PROPIETARIO';
  nombres[cTot + 2] = 'DIFERENCIA';
  nombres[cExtra] = 'CATEGORÍA';
  nombres[cExtra + 1] = 'NOTA';
  nombres[cExtra + 2] = 'ID';

  const fechas = blank();
  fechas[cCp - 1] = 'FECHA DE COMPRA →';
  cp.forEach((c, i) => (fechas[cCp + i] = c.fecha || ''));

  const rows = [titulo, info, blank(), grupos, nombres, fechas];

  for (const it of data.items) {
    const r = blank();
    r[cN] = it.n;
    r[cTipo] = it.tipo;
    r[cMedida] = it.medida;
    ub.forEach((u, i) => (r[cUb + i] = it.ubicaciones[u.id] || null));
    pr.forEach((p, i) => (r[cPr + i] = it.propietarios[p.id] || null));
    cp.forEach((c, i) => (r[cCp + i] = it.compras[c.id] || null));
    r[cTot] = itemTotal(it);
    r[cTot + 1] = itemPropTotal(it);
    r[cTot + 2] = itemDescuadre(it);
    r[cExtra] = nombreCategoria(categoriaDe(data, it.tipo));
    r[cExtra + 1] = it.nota || null;
    r[cExtra + 2] = it.id;
    rows.push(r);
  }

  const widths = new Array(width).fill(11);
  widths[cN] = 6;
  widths[cTipo] = 42;
  widths[cMedida] = 26;
  for (let i = cUb; i < cCp; i++) widths[i] = 15;
  widths[cExtra] = 14;
  widths[cExtra + 1] = 30;
  widths[cExtra + 2] = 10;

  return { name: 'INVENTARIO', rows, widths, headerRows: 0, freeze: 6, _header: { grupos: 4, nombres: 5 } };
}

function resumenSheet(data) {
  const rows = [];
  rows.push([`RESUMEN POR TIPOLOGÍA · ${data.meta.empresa || 'Grupo SIMAP'}`]);
  rows.push([]);
  const head = ['TIPOLOGÍA', ...data.ubicaciones.map((u) => u.nombre), 'TOTAL UBICADO', ...data.propietarios.map((p) => p.nombre), 'REFERENCIAS'];
  rows.push(head);

  const byTipo = new Map();
  for (const it of data.items) {
    let r = byTipo.get(it.tipo);
    if (!r) {
      r = { ub: {}, pr: {}, refs: 0 };
      byTipo.set(it.tipo, r);
    }
    r.refs += 1;
    for (const u of data.ubicaciones) r.ub[u.id] = (r.ub[u.id] || 0) + (it.ubicaciones[u.id] || 0);
    for (const p of data.propietarios) r.pr[p.id] = (r.pr[p.id] || 0) + (it.propietarios[p.id] || 0);
  }

  const sorted = Array.from(byTipo.entries()).sort(
    (a, b) => sumValues(b[1].ub) - sumValues(a[1].ub) || a[0].localeCompare(b[0], 'es')
  );

  const totals = { ub: {}, pr: {}, refs: 0 };
  for (const [tipo, r] of sorted) {
    rows.push([
      tipo,
      ...data.ubicaciones.map((u) => r.ub[u.id] || 0),
      sumValues(r.ub),
      ...data.propietarios.map((p) => r.pr[p.id] || 0),
      r.refs,
    ]);
    totals.refs += r.refs;
    for (const u of data.ubicaciones) totals.ub[u.id] = (totals.ub[u.id] || 0) + (r.ub[u.id] || 0);
    for (const p of data.propietarios) totals.pr[p.id] = (totals.pr[p.id] || 0) + (r.pr[p.id] || 0);
  }

  rows.push([
    'TOTAL GENERAL',
    ...data.ubicaciones.map((u) => totals.ub[u.id] || 0),
    sumValues(totals.ub),
    ...data.propietarios.map((p) => totals.pr[p.id] || 0),
    totals.refs,
  ]);

  const widths = [42, ...data.ubicaciones.map(() => 16), 15, ...data.propietarios.map(() => 15), 13];
  return { name: 'RESUMEN TIPOLOGÍA', rows, widths, freeze: 3 };
}

function medidasSheet(data) {
  const rows = [[`DETALLE POR MEDIDA · ${data.meta.empresa || 'Grupo SIMAP'}`], [], ['TIPOLOGÍA', 'MEDIDA', ...data.ubicaciones.map((u) => u.nombre), 'TOTAL']];
  const map = new Map();
  for (const it of data.items) {
    const k = `${it.tipo}||${it.medida}`;
    let r = map.get(k);
    if (!r) {
      r = { tipo: it.tipo, medida: it.medida, ub: {} };
      map.set(k, r);
    }
    for (const u of data.ubicaciones) r.ub[u.id] = (r.ub[u.id] || 0) + (it.ubicaciones[u.id] || 0);
  }
  const list = Array.from(map.values()).sort(
    (a, b) => a.tipo.localeCompare(b.tipo, 'es') || sumValues(b.ub) - sumValues(a.ub)
  );
  for (const r of list) {
    rows.push([r.tipo, r.medida, ...data.ubicaciones.map((u) => r.ub[u.id] || 0), sumValues(r.ub)]);
  }
  return { name: 'MEDIDAS', rows, widths: [40, 30, ...data.ubicaciones.map(() => 16), 12], freeze: 3 };
}

function comprasSheet(data) {
  const rows = [[`COMPRAS REGISTRADAS · ${data.meta.empresa || 'Grupo SIMAP'}`], [], ['COMPRA', 'FECHA', 'UNIDADES', 'REFERENCIAS', 'ACUMULADO']];
  let acc = 0;
  const ordered = [...data.compras].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  for (const c of ordered) {
    let unidades = 0;
    let refs = 0;
    for (const it of data.items) {
      const v = it.compras[c.id] || 0;
      if (v) {
        unidades += v;
        refs += 1;
      }
    }
    acc += unidades;
    rows.push([c.etiqueta, c.fecha || '', unidades, refs, acc]);
  }
  return { name: 'COMPRAS', rows, widths: [16, 14, 12, 14, 14], freeze: 3 };
}

function catalogosSheet(data) {
  const rows = [['CATÁLOGOS'], [], ['TIPOLOGÍAS', 'CATEGORÍA', 'UBICACIONES / PROYECTOS', 'ID UBICACIÓN', 'PROPIETARIOS', 'ID PROPIETARIO']];
  const n = Math.max(data.tipos.length, data.ubicaciones.length, data.propietarios.length);
  for (let i = 0; i < n; i++) {
    rows.push([
      data.tipos[i] || null,
      data.tipos[i] ? nombreCategoria(categoriaDe(data, data.tipos[i])) : null,
      data.ubicaciones[i]?.nombre || null,
      data.ubicaciones[i]?.id || null,
      data.propietarios[i]?.nombre || null,
      data.propietarios[i]?.id || null,
    ]);
  }
  return { name: 'CATÁLOGOS', rows, widths: [44, 28, 18, 20, 18], freeze: 3 };
}

function inconsistenciasSheet(data) {
  const rows = [
    ['CONTROL DE CONSISTENCIA'],
    ['Referencias donde el total por propietario no coincide con el total ubicado.'],
    [],
    ['ID', 'N°', 'TIPOLOGÍA', 'MEDIDA', 'TOTAL UBICADO', 'TOTAL PROPIETARIO', 'DIFERENCIA'],
  ];
  for (const it of data.items) {
    const d = itemDescuadre(it);
    if (!d) continue;
    rows.push([it.id, it.n, it.tipo, it.medida, itemTotal(it), itemPropTotal(it), d]);
  }
  if (rows.length === 4) rows.push(['—', null, 'Sin inconsistencias', null, null, null, 0]);
  return { name: 'CONSISTENCIA', rows, widths: [10, 6, 40, 26, 15, 18, 13], freeze: 4 };
}

export async function exportXlsx(data) {
  return writeXlsx([
    inventarioSheet(data),
    resumenSheet(data),
    medidasSheet(data),
    comprasSheet(data),
    inconsistenciasSheet(data),
    catalogosSheet(data),
  ]);
}

export function exportJson(data) {
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}

export function exportCsv(data) {
  const sheet = inventarioSheet(data);
  return new Blob([toCsv(sheet.rows)], { type: 'text/csv;charset=utf-8' });
}

/* ---------------------------------------------------------- importación -- */

const RE_TIPO = /tipo de formaleta|tipologia/;
const RE_MEDIDA = /medida/;
const RE_NUM = /^n[°º.]?$|^numero$|^item$/;
const RE_GRUPO_UB = /proyecto|ubicacion|bodega/;
const RE_GRUPO_PR = /propietario|dueno|duena/;
const RE_GRUPO_CP = /control de cantidades|compras/;
const RE_GRUPO_TOT = /^totales$|^total/;
const RE_COMPRA = /compra/;
const RE_NOTA = /^nota$|observac/;
const RE_ID = /^id$/;
const RE_CAT = /^categoria$|^familia$/;
const RE_IGNORAR = /^grafico$|^imagen$|^foto$|^inventario$|^diferencia$|^total|^estado$|^control$/;

const cellText = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const cellNorm = (v) => norm(cellText(v));

/** Localiza la fila de grupos, la de nombres y la de fechas en una hoja. */
function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r] || [];
    const cTipo = row.findIndex((c) => RE_TIPO.test(cellNorm(c)));
    if (cTipo < 0) continue;

    const grupos = row;
    const findG = (re) => grupos.findIndex((c) => re.test(cellNorm(c)));
    let cUb = findG(RE_GRUPO_UB);
    let cPr = findG(RE_GRUPO_PR);
    let cCp = findG(RE_GRUPO_CP);

    // Si los grupos no están en esta fila, los nombres individuales ya lo son.
    let namesRow = r;
    if (cUb >= 0 && cPr > cUb) {
      const next = rows[r + 1] || [];
      if (next.slice(cUb, cPr).some((c) => cellText(c))) namesRow = r + 1;
    }

    const names = rows[namesRow] || [];
    const cMedida = row.findIndex((c) => RE_MEDIDA.test(cellNorm(c)));
    const cNum = row.findIndex((c) => RE_NUM.test(cellNorm(c)));
    const cNota = names.findIndex((c) => RE_NOTA.test(cellNorm(c)));
    const cId = names.findIndex((c) => RE_ID.test(cellNorm(c)));
    const cCat = names.findIndex((c) => RE_CAT.test(cellNorm(c)));

    // Fila de fechas: la inmediatamente inferior a los nombres si trae fechas.
    let datesRow = -1;
    if (cCp >= 0) {
      const cand = rows[namesRow + 1] || [];
      const hits = cand.slice(cCp).filter((c) => c instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(cellText(c)) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(cellText(c)));
      if (hits.length) datesRow = namesRow + 1;
    }

    return {
      grupoRow: r,
      namesRow,
      datesRow,
      dataRow: (datesRow >= 0 ? datesRow : namesRow) + 1,
      cTipo,
      cMedida,
      cNum,
      cNota,
      cId,
      cCat,
      cUb,
      cPr,
      cCp,
      cTot: findG(RE_GRUPO_TOT),
    };
  }
  return null;
}

/** Convierte una hoja tabular en el modelo de datos de la aplicación. */
function sheetToData(rows, meta = {}) {
  const H = findHeader(rows);
  if (!H) return null;

  const names = rows[H.namesRow] || [];
  const dates = H.datesRow >= 0 ? rows[H.datesRow] || [] : [];
  const width = Math.max(...rows.slice(0, H.dataRow + 5).map((r) => (r ? r.length : 0)), names.length);

  const upperBound = (start) => {
    const candidates = [H.cPr, H.cCp, H.cTot, H.cCat, H.cNota, H.cId, width].filter((v) => v > start);
    return candidates.length ? Math.min(...candidates) : width;
  };

  const ubicaciones = [];
  const propietarios = [];
  const compras = [];
  /* La categoría viaja repetida en cada fila del inventario; aquí se recoge por
     tipología para no perder una reasignación hecha a mano en el Excel. */
  const tiposCategoria = {};
  const colUb = [];
  const colPr = [];
  const colCp = [];

  const takeNamed = (from, to, out, cols, prefix) => {
    if (from < 0) return;
    for (let c = from; c < to && c < width; c++) {
      const nombre = cellText(names[c]);
      if (!nombre) continue;
      if (RE_IGNORAR.test(cellNorm(nombre))) continue;
      const id = uniqueId(slug(nombre) || `${prefix}${c}`, out);
      out.push({ id, nombre: nombre.replace(/\s+/g, ' ') });
      cols.push({ c, id });
    }
  };

  const uniqueId = (base, list) => {
    let id = base;
    let k = 2;
    while (list.some((x) => x.id === id)) id = `${base}_${k++}`;
    return id;
  };

  if (H.cUb >= 0) takeNamed(H.cUb, H.cPr > H.cUb ? H.cPr : upperBound(H.cUb), ubicaciones, colUb, 'ub');
  if (H.cPr >= 0) takeNamed(H.cPr, H.cCp > H.cPr ? H.cCp : upperBound(H.cPr), propietarios, colPr, 'pr');

  if (H.cCp >= 0) {
    const to = H.cTot > H.cCp ? H.cTot : width;
    let idx = 0;
    for (let c = H.cCp; c < to && c < width; c++) {
      const etiqueta = cellText(names[c]);
      if (!etiqueta || !RE_COMPRA.test(cellNorm(etiqueta))) continue;
      idx += 1;
      const id = `c${idx}`;
      compras.push({ id, etiqueta: etiqueta.replace(/\s+/g, ' '), fecha: normFecha(dates[c]) });
      colCp.push({ c, id });
    }
  }

  const items = [];
  let seq = 0;
  for (let r = H.dataRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const tipo = cellText(row[H.cTipo]);
    if (!tipo) continue;
    if (/^total/i.test(tipo)) continue;
    seq += 1;

    const grab = (cols) => {
      const out = {};
      for (const { c, id } of cols) {
        const v = toInt(row[c]);
        if (v) out[id] = v;
      }
      return out;
    };

    if (H.cCat >= 0) {
      const puesta = CATEGORIAS.find((c) => norm(c.nombre) === cellNorm(row[H.cCat]))?.id || cellNorm(row[H.cCat]);
      if (esCategoriaValida(puesta)) tiposCategoria[tipo.toUpperCase()] = puesta;
    }

    items.push({
      id: (H.cId >= 0 && cellText(row[H.cId])) || `IT-${String(seq).padStart(4, '0')}`,
      n: (H.cNum >= 0 ? toInt(row[H.cNum]) : 0) || seq,
      tipo: tipo.toUpperCase(),
      medida: (H.cMedida >= 0 ? cellText(row[H.cMedida]) : '') || 'NO APLICA',
      nota: H.cNota >= 0 ? cellText(row[H.cNota]) : '',
      ubicaciones: grab(colUb),
      propietarios: grab(colPr),
      compras: grab(colCp),
    });
  }

  if (!items.length) return null;

  // Encabezado documental: se rescata de las primeras filas si viene escrito.
  const head = rows.slice(0, H.grupoRow).map((r) => (r || []).map(cellText).join(' ')).join(' ');
  const grab = (re) => {
    const m = re.exec(head);
    return m ? m[1].trim() : '';
  };

  return {
    meta: {
      empresa: 'Grupo SIMAP',
      titulo: 'Control de Inventario de Formaletería',
      elaboradoPor: grab(/Elaborado por:\s*([^·|]+?)(?:\s{2,}|Revisado|Exportado|$)/i),
      revisadoPor: grab(/Revisado por:\s*([^·|]+?)(?:\s{2,}|Elaborado|Exportado|$)/i),
      fechaElaboracion: normFecha(grab(/Fecha de Elaboraci[oó]n:\s*([\d/-]+)/i)),
      ...meta,
    },
    ubicaciones,
    propietarios,
    compras,
    tipos: [],
    tiposCategoria,
    items,
  };
}

/**
 * Tipologías declaradas en la hoja de catálogos, aunque no tengan existencias,
 * con su categoría si la hoja la trae. Las que no aparecen en ninguna fila del
 * inventario —tres, ahora mismo— sólo pueden clasificarse desde aquí.
 */
function catalogTipos(sheets) {
  const tipos = [];
  const categorias = {};
  for (const s of sheets) {
    for (let r = 0; r < Math.min(s.rows.length, 15); r++) {
      const row = s.rows[r] || [];
      const c = row.findIndex((v) => /^tipologias$/.test(cellNorm(v)));
      if (c < 0) continue;
      const cCat = row.findIndex((v) => RE_CAT.test(cellNorm(v)));
      for (let i = r + 1; i < s.rows.length; i++) {
        const fila = s.rows[i] || [];
        const v = cellText(fila[c]);
        if (!v) continue;
        const tipo = v.toUpperCase();
        tipos.push(tipo);
        if (cCat >= 0) {
          const puesta = CATEGORIAS.find((x) => norm(x.nombre) === cellNorm(fila[cCat]))?.id;
          if (puesta) categorias[tipo] = puesta;
        }
      }
      return { tipos, categorias };
    }
  }
  return { tipos, categorias };
}

/**
 * Lee un archivo cargado por el usuario (.xlsx, .json o .csv) y devuelve
 * datos ya normalizados, junto con un resumen para confirmar antes de aplicar.
 */
export async function importFile(file) {
  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.json')) {
    const parsed = JSON.parse(await file.text());
    const data = normalizeData(parsed);
    if (!data.items.length) throw new Error('El JSON no contiene referencias de inventario.');
    return { data, formato: 'JSON', hojas: ['—'] };
  }

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const rows = parseCsv(await file.text());
    const raw = sheetToData(rows);
    if (!raw) throw new Error('No se encontró la columna «TIPO DE FORMALETA» en el CSV.');
    return { data: normalizeData(raw), formato: 'CSV', hojas: ['—'] };
  }

  if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm')) {
    throw new Error('Formato no soportado. Use .xlsx, .json o .csv.');
  }

  const sheets = await readXlsx(await file.arrayBuffer());
  let raw = null;
  let usada = '';
  for (const s of sheets) {
    const parsed = sheetToData(s.rows);
    if (parsed) {
      raw = parsed;
      usada = s.name;
      break;
    }
  }
  if (!raw) {
    throw new Error('Ninguna hoja contiene un encabezado «TIPO DE FORMALETA» reconocible.');
  }
  const catalogo = catalogTipos(sheets);
  raw.tipos = catalogo.tipos;
  // Lo escrito en CATÁLOGOS manda: es donde se ven las tipologías sin existencias.
  raw.tiposCategoria = { ...raw.tiposCategoria, ...catalogo.categorias };

  return { data: normalizeData(raw), formato: 'Excel', hojas: sheets.map((s) => s.name), hojaUsada: usada };
}

/** Compara el archivo entrante con lo que ya está cargado. */
export function diffSummary(actual, entrante) {
  const key = (it) => `${norm(it.tipo)}|${norm(it.medida)}`;
  const a = new Map(actual.items.map((it) => [key(it), it]));
  const b = new Map(entrante.items.map((it) => [key(it), it]));
  let nuevas = 0;
  let quitadas = 0;
  let cambiadas = 0;
  for (const [k, it] of b) {
    const prev = a.get(k);
    if (!prev) nuevas += 1;
    else if (itemTotal(prev) !== itemTotal(it) || itemPropTotal(prev) !== itemPropTotal(it)) cambiadas += 1;
  }
  for (const k of a.keys()) if (!b.has(k)) quitadas += 1;
  return {
    nuevas,
    quitadas,
    cambiadas,
    unidadesAntes: actual.items.reduce((s, it) => s + itemTotal(it), 0),
    unidadesDespues: entrante.items.reduce((s, it) => s + itemTotal(it), 0),
  };
}
