/* Validación del archivo de inventario antes de publicar el sitio.
 *
 * Se ejecuta en CI (node scripts/validar-datos.mjs). Falla si el JSON está
 * corrupto o si perdió su estructura; avisa —sin fallar— de los descuadres
 * de negocio, que son un asunto de campo y no un error del archivo.
 */

import { readFile } from 'node:fs/promises';

const RUTA = new URL('../data/inventario.json', import.meta.url);

const errores = [];
const avisos = [];

const exigir = (cond, msg) => {
  if (!cond) errores.push(msg);
};

const raw = await readFile(RUTA, 'utf8').catch((err) => {
  console.error(`No se pudo leer data/inventario.json: ${err.message}`);
  process.exit(1);
});

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`data/inventario.json no es JSON válido: ${err.message}`);
  process.exit(1);
}

for (const clave of ['meta', 'ubicaciones', 'propietarios', 'compras', 'tipos', 'items']) {
  exigir(clave in data, `Falta la clave «${clave}».`);
}

const ubIds = new Set((data.ubicaciones || []).map((u) => u.id));
const prIds = new Set((data.propietarios || []).map((p) => p.id));
const cIds = new Set((data.compras || []).map((c) => c.id));

exigir(ubIds.size === (data.ubicaciones || []).length, 'Hay identificadores de ubicación repetidos.');
exigir(prIds.size === (data.propietarios || []).length, 'Hay identificadores de propietario repetidos.');
exigir(cIds.size === (data.compras || []).length, 'Hay identificadores de compra repetidos.');
exigir(Array.isArray(data.items) && data.items.length > 0, 'El inventario no tiene referencias.');

const vistos = new Set();
let unidades = 0;
let asignadas = 0;
let compradas = 0;
let descuadres = 0;

for (const [i, it] of (data.items || []).entries()) {
  const donde = `items[${i}] (${it?.id || 'sin id'})`;

  if (!it || typeof it !== 'object') {
    errores.push(`${donde}: no es un objeto.`);
    continue;
  }
  exigir(!!it.id, `${donde}: falta el identificador.`);
  exigir(!vistos.has(it.id), `${donde}: identificador repetido.`);
  vistos.add(it.id);
  exigir(typeof it.tipo === 'string' && it.tipo.trim() !== '', `${donde}: falta la tipología.`);

  const revisar = (bolsa, validos, nombre) => {
    let total = 0;
    for (const [k, v] of Object.entries(it[bolsa] || {})) {
      if (!validos.has(k)) errores.push(`${donde}: ${nombre} desconocido «${k}».`);
      if (!Number.isInteger(v) || v < 0) errores.push(`${donde}: cantidad no válida en «${k}» (${v}).`);
      else total += v;
    }
    return total;
  };

  const ub = revisar('ubicaciones', ubIds, 'ubicación');
  const pr = revisar('propietarios', prIds, 'propietario');
  compradas += revisar('compras', cIds, 'compra');

  unidades += ub;
  asignadas += pr;
  if (ub !== pr) descuadres += 1;
}

const faltantes = new Set((data.items || []).map((it) => it.tipo).filter((t) => !(data.tipos || []).includes(t)));
if (faltantes.size) {
  avisos.push(`Tipologías usadas que no están en el catálogo: ${[...faltantes].join(', ')}.`);
}
if (descuadres) {
  avisos.push(`${descuadres} referencias con descuadre entre propietario y ubicación (revisión de campo).`);
}

const n = (v) => v.toLocaleString('es-CO');

console.log('Inventario de formaletería · Grupo SIMAP');
console.log(`  Referencias .......... ${n((data.items || []).length)}`);
console.log(`  Unidades ubicadas .... ${n(unidades)}`);
console.log(`  Unidades por dueño ... ${n(asignadas)}`);
console.log(`  Unidades compradas ... ${n(compradas)}`);
console.log(`  Tipologías ........... ${n((data.tipos || []).length)}`);
console.log(`  Sedes / propietarios . ${ubIds.size} / ${prIds.size}`);

for (const a of avisos) console.log(`  aviso: ${a}`);

if (errores.length) {
  console.error(`\n${errores.length} error(es) en data/inventario.json:`);
  for (const e of errores.slice(0, 40)) console.error(`  · ${e}`);
  if (errores.length > 40) console.error(`  … y ${errores.length - 40} más.`);
  process.exit(1);
}

console.log('\nArchivo válido.');
