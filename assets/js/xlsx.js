/* Lectura y escritura de archivos .xlsx sin dependencias externas.
 *
 * El ZIP se arma y se desarma a mano; la compresión usa CompressionStream /
 * DecompressionStream ("deflate-raw"), disponibles de forma nativa en los
 * navegadores actuales. Si el navegador no las expone, la escritura cae a
 * entradas sin comprimir (siguen siendo .xlsx válidos).
 */

/* ------------------------------------------------------------- CRC-32 --- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede descomprimir .xlsx. Use la exportación JSON.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ------------------------------------------------------------ ZIP write - */

function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
}

async function zip(files) {
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(raw);
    const compressed = await deflateRaw(raw);
    const useDeflate = compressed && compressed.length < raw.length;
    const body = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, body);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + body.length;
  }

  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ------------------------------------------------------------- ZIP read - */

async function unzip(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (falta el índice ZIP).');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));

    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    out.set(name, { method, raw });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: () => Array.from(out.keys()),
    async text(name) {
      const e = out.get(name);
      if (!e) return null;
      if (e.method === 0) return dec.decode(e.raw);
      if (e.method !== 8) throw new Error(`Compresión ZIP no soportada (método ${e.method}).`);
      return dec.decode(await inflateRaw(e.raw));
    },
  };
}

/* ------------------------------------------------------------- escritura */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Los caracteres de control rompen el XML de Excel.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export function colName(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(ref, value, styleIdx) {
  const st = styleIdx ? ` s="${styleIdx}"` : '';
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${st}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const widths = sheet.widths || [];
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const freeze = sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';

  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const isHeader = sheet.headerRows && r < sheet.headerRows;
          return cellXml(`${colName(c)}${r + 1}`, v, isHeader ? 1 : 0);
        })
        .join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : `<row r="${r + 1}"/>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0073C4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Construye un .xlsx a partir de [{name, rows, widths, headerRows, freeze}]. */
export async function writeXlsx(sheets) {
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets
  .map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )
  .join('')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${esc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];

  return zip(files);
}

/* -------------------------------------------------------------- lectura - */

const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function refToCol(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function serialToDate(v) {
  const ms = Math.round((v - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? v : d;
}

/**
 * Lee un .xlsx y devuelve [{name, rows}] con celdas ya tipadas
 * (string, number o Date). Las filas vienen densas y alineadas por columna.
 */
export async function readXlsx(arrayBuffer) {
  const z = await unzip(arrayBuffer);
  const parser = new DOMParser();
  const parse = (txt) => parser.parseFromString(txt, 'application/xml');

  /* cadenas compartidas */
  const shared = [];
  const ssTxt = await z.text('xl/sharedStrings.xml');
  if (ssTxt) {
    const doc = parse(ssTxt);
    for (const si of doc.getElementsByTagName('si')) {
      let s = '';
      for (const t of si.getElementsByTagName('t')) s += t.textContent;
      shared.push(s);
    }
  }

  /* estilos: sólo interesa saber qué celdas son fechas */
  const dateStyles = new Set();
  const stTxt = await z.text('xl/styles.xml');
  if (stTxt) {
    const doc = parse(stTxt);
    const custom = new Map();
    for (const nf of doc.getElementsByTagName('numFmt')) {
      const id = Number(nf.getAttribute('numFmtId'));
      const code = nf.getAttribute('formatCode') || '';
      if (/[dmyhs]/i.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''))) custom.set(id, true);
    }
    const cellXfs = doc.getElementsByTagName('cellXfs')[0];
    if (cellXfs) {
      Array.from(cellXfs.getElementsByTagName('xf')).forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        if (BUILTIN_DATE_FMT.has(id) || custom.has(id)) dateStyles.add(i);
      });
    }
  }

  /* orden y nombres de las hojas */
  const wbTxt = await z.text('xl/workbook.xml');
  const relTxt = await z.text('xl/_rels/workbook.xml.rels');
  const targets = new Map();
  if (relTxt) {
    for (const r of parse(relTxt).getElementsByTagName('Relationship')) {
      targets.set(r.getAttribute('Id'), r.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
  }

  const sheetDefs = [];
  if (wbTxt) {
    for (const s of parse(wbTxt).getElementsByTagName('sheet')) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      sheetDefs.push({ name: s.getAttribute('name') || 'Hoja', path: `xl/${targets.get(rid) || ''}` });
    }
  }
  if (!sheetDefs.length) {
    for (const n of z.names()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) sheetDefs.push({ name: n, path: n });
    }
  }

  const sheets = [];
  for (const def of sheetDefs) {
    const txt = await z.text(def.path);
    if (!txt) continue;
    const doc = parse(txt);
    const rows = [];
    let maxCol = 0;

    for (const row of doc.getElementsByTagName('row')) {
      const rIdx = Number(row.getAttribute('r') || rows.length + 1) - 1;
      const cells = [];
      for (const c of row.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || '';
        const ci = ref ? refToCol(ref) : cells.length;
        const t = c.getAttribute('t');
        const s = Number(c.getAttribute('s') || -1);
        let value = null;

        if (t === 'inlineStr') {
          let str = '';
          for (const tt of c.getElementsByTagName('t')) str += tt.textContent;
          value = str;
        } else {
          const vEl = c.getElementsByTagName('v')[0];
          const raw = vEl ? vEl.textContent : null;
          if (raw === null || raw === '') value = null;
          else if (t === 's') value = shared[Number(raw)] ?? '';
          else if (t === 'str' || t === 'e') value = raw;
          else if (t === 'b') value = raw === '1';
          else {
            const num = Number(raw);
            value = Number.isFinite(num) ? (dateStyles.has(s) && num > 0 ? serialToDate(num) : num) : raw;
          }
        }
        cells[ci] = value;
        if (ci + 1 > maxCol) maxCol = ci + 1;
      }
      rows[rIdx] = cells;
    }

    for (let i = 0; i < rows.length; i++) {
      if (!rows[i]) rows[i] = [];
      for (let c = 0; c < maxCol; c++) if (rows[i][c] === undefined) rows[i][c] = null;
    }

    sheets.push({ name: def.name, rows });
  }

  if (!sheets.length) throw new Error('El archivo no contiene hojas legibles.');
  return sheets;
}

/* ----------------------------------------------------------------- CSV -- */

export function toCsv(rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Punto y coma + BOM: es lo que Excel en español abre sin pedir nada.
  return '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function parseCsv(text) {
  const src = text.replace(/^\ufeff/, '');
  const delim = (src.split('\n')[0].match(/;/g) || []).length >= (src.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
