/*
 * Clasificación de las tipologías en dos familias: la formaletería propiamente
 * dicha —paneles, esquineros, dinteles, cenefas, tapamuros— y los accesorios
 * que la sujetan, alinean o se usan para montarla y desmontarla.
 *
 * La asignación vigente vive en `data/inventario.json` (`tiposCategoria`), de
 * modo que se puede corregir sin tocar código. Estas reglas son sólo el reparto
 * por omisión: se aplican a una tipología nueva o a un archivo importado que
 * llega sin clasificar.
 */

import { norm } from './util.js';

export const CATEGORIAS = [
  { id: 'formaletas', nombre: 'Formaletas' },
  { id: 'accesorios', nombre: 'Accesorios' },
];

export const CATEGORIA_POR_DEFECTO = 'formaletas';

/** Las tipologías que la empresa considera accesorio, por nombre exacto. */
export const ACCESORIOS = [
  'ANGULARES',
  'CABALLETE',
  'CARGADERAS',
  'CORBATA',
  'CUÑA',
  'GATAS U',
  'PALOMETAS',
  'PANOCHAS',
  'PASADOR',
  'PATA ESTABILIZADORA',
  'PINGRAPA',
  'SACACORBATAS',
  'SACALAMINAS',
  'TAPAS GUARDERAS',
  'TORNILLO DE SOPORTE AJUSTABLE',
  'POSTE DE SOPORTE AJUSTABLE',
  'TUBO CUADRADO',
  'VIGA ALINEADORA',
  'VIROLA',
];

const SET_ACCESORIOS = new Set(ACCESORIOS.map(norm));

export const esCategoriaValida = (id) => CATEGORIAS.some((c) => c.id === id);

/** Reparto por omisión: accesorio si está en la lista; si no, formaleta. */
export function clasificarTipo(tipo) {
  return SET_ACCESORIOS.has(norm(tipo)) ? 'accesorios' : CATEGORIA_POR_DEFECTO;
}

export function nombreCategoria(id) {
  return CATEGORIAS.find((c) => c.id === id)?.nombre || '—';
}
