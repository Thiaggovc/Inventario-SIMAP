# Inventario de Formaletería · Grupo SIMAP

Aplicación web para consultar, editar y publicar el inventario de formaletería de
Grupo SIMAP. El repositorio de GitHub es a la vez el alojamiento del sitio y el
almacén de los datos: cada versión del inventario queda como un commit, con su
autor y su fecha.

No hay servidor, ni base de datos, ni dependencias externas. Todo ocurre en el
navegador contra `data/inventario.json`.

---

## Qué hace

**Resumen.** Tablero con la situación actual: unidades totales, reparto entre
sedes, existencias por tipología, propiedad de los activos, cruce tipología ×
sede, compras en el tiempo y medidas de mayor volumen. Cada gráfico tiene su
vista de tabla equivalente y respeta la misma barra de filtros.

**Inventario.** El registro maestro completo, con búsqueda, ordenamiento y
paginación. Permite crear, editar y eliminar referencias, y administrar los
catálogos de sedes, propietarios, compras y tipologías.

**Datos y publicación.** Exporta todo el inventario a Excel, JSON o CSV; vuelve a
cargar un archivo para continuar el trabajo; y publica la versión vigente en el
repositorio mediante la API de GitHub.

---

## Los datos

`data/inventario.json` es la única fuente de verdad. Se generó a partir de
`INVENTARIO_ARQ_GERSON__SIMAP__Con_compras_version_1.xlsx` y reproduce sus cifras
exactamente.

| Concepto | Valor |
| --- | --- |
| Referencias | 910 |
| Unidades ubicadas | 9 393 |
| Unidades asignadas a propietarios | 9 335 |
| Unidades compradas (histórico) | 15 279 |
| Tipologías | 50 |
| Sedes y proyectos | PRAVALTA (Furgón Rojo), PRAVALTA, DREAMS FL (Furgón Verde), SAN PEDRO |
| Propietarios | SIMAP, LEONARDO |
| Compras fechadas | 12, entre enero de 2021 y junio de 2026 |

### Estructura

```jsonc
{
  "meta":         { "empresa": "Grupo SIMAP", "elaboradoPor": "…", "actualizado": "…" },
  "ubicaciones":  [ { "id": "pravalta", "nombre": "PRAVALTA" } ],
  "propietarios": [ { "id": "simap", "nombre": "SIMAP" } ],
  "compras":      [ { "id": "c1", "etiqueta": "COMPRA #1", "fecha": "2021-01-29" } ],
  "tipos":        [ "ANGULARES", "ANTEPECHO", "…" ],
  "items": [
    {
      "id": "IT-0001",
      "n": 1,
      "tipo": "ANGULARES",
      "medida": "5 cm x 5 cm x 1.65 mts",
      "ubicaciones":  { "pravalta_rojo": 1 },   // dónde está
      "propietarios": { "leonardo": 1 },        // de quién es
      "compras":      { "c8": 1 }               // en qué compra entró
    }
  ]
}
```

Una **referencia** es una tipología con una medida concreta. Sus cantidades se
reparten entre sedes y, en paralelo, entre propietarios; ambas sumas deberían
coincidir.

### Descuadres

En 9 referencias el total por propietario no coincide con el total ubicado, y en
274 hay compras registradas sin existencias en ninguna sede. Ambas situaciones
vienen del archivo original y **se conservan tal cual**: la aplicación las señala
en la tarjeta «Control de consistencia» y en el filtro *Sólo descuadres*, pero no
las corrige por su cuenta. Son un asunto de verificación en campo.

---

## Uso

### Editar el inventario

Los cambios se guardan al instante en el navegador (borrador local) y el
indicador de la cabecera pasa a «Cambios sin publicar». Nada llega al repositorio
hasta que se publica explícitamente. Desde *Datos y publicación* se puede
descartar el borrador y volver a la versión publicada.

### Publicar en GitHub

1. Cree un *personal access token* en GitHub → Settings → Developer settings →
   **Fine-grained tokens**, con acceso a este repositorio y permiso
   **Contents: Read and write**.
2. En *Datos y publicación*, complete propietario, repositorio, rama y ruta
   (`data/inventario.json`), pegue el token y pulse **Probar acceso**.
3. **Publicar en GitHub** crea un commit con el inventario vigente.
   **Cargar desde GitHub** trae la última versión publicada.
   **Historial** lista los commits del archivo.

El token se guarda únicamente en el almacenamiento local del navegador; no se
escribe en el repositorio ni se envía a ningún tercero. En un equipo compartido,
bórrelo al terminar con el botón correspondiente.

### Exportar e importar

La exportación a **Excel** produce seis hojas: `INVENTARIO`, `RESUMEN TIPOLOGÍA`,
`MEDIDAS`, `COMPRAS`, `CONSISTENCIA` y `CATÁLOGOS`. La hoja `INVENTARIO` conserva
la estructura de tres niveles del archivo original —fila de grupos, fila de
nombres, fila de fechas de compra—, de modo que puede volver a cargarse sin
pérdida.

El lector de archivos acepta:

- el **Excel original** de Grupo SIMAP, tal como está;
- cualquier **Excel exportado** por esta aplicación;
- **JSON** (round-trip exacto) y **CSV** (punto y coma, UTF-8 con BOM).

Antes de aplicar la carga se muestra un resumen comparativo: referencias, altas,
bajas y cambios de cantidad.

---

## Ejecutar en local

Los módulos de JavaScript no funcionan sobre `file://`; hace falta un servidor:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

Validar el archivo de datos:

```bash
node scripts/validar-datos.mjs
```

## Publicar el sitio

En **Settings → Pages**, elija *Source: GitHub Actions*. Cada push a `main`
valida `data/inventario.json` y despliega el sitio
(`.github/workflows/pages.yml`).

---

## Estructura del proyecto

```
index.html                     una sola página, enrutada por hash
data/inventario.json           fuente de verdad del inventario
assets/css/app.css             sistema visual completo
assets/js/
  app.js                       arranque, cabecera y enrutado
  state.js                     modelo, normalización, borrador y derivados
  filters.js                   barra de filtros compartida
  charts.js                    gráficos SVG propios
  xlsx.js                      lectura y escritura de .xlsx y CSV
  workbook.js                  mapeo entre el modelo y los archivos
  github.js                    Contents API de GitHub
  views/                       resumen · inventario · datos
scripts/validar-datos.mjs      validación usada por CI
```

### Rendimiento

El desenfoque de fondo es lo más caro de un lenguaje de cristal, así que se
reserva a lo que de verdad tiene contenido moviéndose por detrás: cabecera,
encabezado fijo de tabla, globo y diálogos. Tarjetas y fichas conservan la
translucidez y el filo especular, pero sin desenfocar: detrás sólo hay un
degradado liso y el resultado es indistinguible. El campo de fondo tampoco
fusiona capas ni aplica filtros, y el grano vive dentro de él en vez de en una
capa fija a pantalla completa. Los oyentes de scroll se agrupan en uno solo,
medido una vez por fotograma.

Medido en este entorno sin GPU y con rasterizado por software, el tiempo mediano
de fotograma durante un desplazamiento completo bajó de **100 ms a 33 ms**, y los
elementos con desenfoque de fondo pasaron de 18 a 4. Con GPU la diferencia es
menor en términos absolutos, pero el reparto de trabajo es el mismo.

### Decisiones técnicas

- **Cero dependencias.** No hay build, ni npm, ni CDN. El `.xlsx` se arma y se
  lee a mano; la compresión usa `CompressionStream`/`DecompressionStream`, ya
  nativas en los navegadores actuales.
- **Gráficos propios en SVG**, con reglas fijas: marcas delgadas, extremo de dato
  redondeado, separación de 2 px entre marcas contiguas, rejilla recesiva y
  etiquetas directas selectivas.
- **Accesibilidad.** Toda tarjeta tiene su tabla equivalente, la leyenda siempre
  acompaña a los gráficos de dos o más series y ningún valor depende del color ni
  del tooltip. La paleta se validó para daltonismo (protanopia y deuteranopia) en
  modo claro y oscuro.

### Identidad visual

Estructura editorial y superficie *liquid glass*. Blanco, negro y el azul
corporativo `#0073C4` para la interfaz. **Una sola familia tipográfica** —la
misma sans del sistema que usan los gráficos— en toda la aplicación: los
titulares destacan por tamaño y peso, no por cambiar de letra.

- **Controles propios.** Los desplegables nativos los dibuja el sistema
  operativo y no admiten ni vidrio, ni degradado, ni animación. Los de esta
  aplicación son propios: panel de cristal anclado al botón, filtro de texto
  cuando la lista es larga, punto de color por serie y teclado completo
  (flechas, Inicio/Fin, Enter, Escape).
- **Pantalla de arranque.** Una ventana de cristal con «GRUPO SIMAP» en el azul
  corporativo `#0073C4` —las letras entran girando una a una— y una barra de
  avance fina bajo el nombre. La ventana y el fondo son del mismo tema: en claro
  todo es blanco, en oscuro todo es negro. Un panel blanco recortado sobre un
  fondo casi negro parecía un parche pegado encima. Permanece **tres segundos como
  mínimo**: una carga instantánea produciría un destello y nadie llegaría a leer
  nada. La barra no es decorativa —se queda en el menor entre el reloj y el
  avance real de los datos, así que nunca adelanta lo que no ha ocurrido.
- **Cristal.** Cabecera, filtros, tarjetas, tablas, globos y diálogos son
  paneles translúcidos con desenfoque de fondo, filo especular y sombra suave.
  Detrás respira un campo de luz azul en movimiento muy lento, con un grano
  finísimo que evita el aspecto plástico.
- **Titulares.** Antetítulo en píldora de cristal y titular en versales, peso
  800 y hasta 58 px. Cada palabra sube desde detrás de su propia máscara,
  escalonada; la última lleva el degradado de marca, un barrido de luz continuo
  y un halo que late detrás.
- **Etiquetas largas.** Las tipologías llegan a 46 caracteres. En vez de
  recortarlas —lo que escondía justo la parte que las distingue— se reparten en
  dos líneas sin cortar palabras, y la fila del gráfico crece para acogerlas.
- **Gráficos con degradado.** Cada serie se pinta con un degradado propio de su
  matiz más un velo especular. El matiz sigue identificando a la entidad: el
  degradado aporta volumen, nunca codifica magnitud.
- **Un color por tarjeta.** Cuando un gráfico tiene una sola serie no hay
  entidad que codificar, así que cada tarjeta toma su propia ranura de la
  paleta: tipologías en ámbar, medidas en naranja, compras por fecha en azul
  marino y el acumulado en vino. Cuatro gráficos seguidos del mismo verde no se
  distinguían de un vistazo. Un punto del mismo color junto al título anuncia la
  ranura antes de mirar el trazado.

Los colores de las series son los corporativos de Grupo SIMAP. El **orden** de
las ranuras no es decorativo: es el mecanismo de seguridad para daltonismo.

| Ranura | Claro | Oscuro | Extremo claro (claro / oscuro) | Asignada a |
| --- | --- | --- | --- | --- |
| 1 | `#00C4AD` | `#0FCDB4` | `#3FE0CD` / `#4EE3CE` | PRAVALTA (Furgón Rojo) · SIMAP |
| 2 | `#C47500` | `#DE8410` | `#E39A33` / `#F0A94A` | PRAVALTA · LEONARDO |
| 3 | `#25506F` | `#5A90C2` | `#4A7CA3` / `#8FB9DC` | DREAMS FL (Furgón Verde) |
| 4 | `#C49C00` | `#D2AC1E` | `#E3BE33` / `#E7C955` | SAN PEDRO |
| 5 | `#7A3F6D` | `#B87BA9` | `#A7699A` / `#CFA0C3` | reserva para una quinta sede |

Los dos ámbares (`#C47500` y `#C49C00`) se parecen demasiado entre sí —ΔE 9,8 en
visión normal, por debajo del umbral de 15—, así que el orden los mantiene
**nunca contiguos**: entre ambos siempre queda el azul marino. Con ese orden, el
peor par adyacente mide ΔE 16,8 bajo deuteranopia y 25,4 en visión normal, en
ambos temas. El azul marino queda por debajo del suelo de saturación del método
(lee casi como gris), lo que se compensa con su fuerte contraste sobre el fondo,
la leyenda y la vista de tabla.

Sobre fondos de marca con texto blanco encima se usa un par aparte
(`--hero-a` / `--hero-b`) cuyo extremo más claro conserva 5:1 de contraste.
Las etiquetas dentro de una marca de color eligen tinta blanca o negra según la
luminancia real del relleno, recalculada al cambiar de tema.

### Movimiento

El sitio se anima en todos sus puntos de contacto, siempre con la misma curva
de salida:

1. **Entrada en pantalla.** Tarjetas y bloques aparecen escalonados al hacer
   scroll; las cifras cuentan hacia su valor y las barras crecen desde el eje.
2. **Cambio de pestaña.** La vista saliente se difumina y sube; la entrante
   entra desde abajo mientras una píldora de cristal se desliza en la
   navegación.
3. **Filtros.** Al aplicar uno, la barra destella y las tarjetas se atenúan y
   vuelven ya recalculadas: la lectura anterior se mantiene hasta el relevo, sin
   esqueleto en blanco ni salto de maquetación.
4. **Ratón sobre el gráfico.** La marca señalada se realza con un resplandor y
   las demás se atenúan; el globo de cristal aparece con rebote y sigue al
   cursor. En el acumulado hay además una guía vertical con punto.
5. **Cristal reactivo.** Botones y tarjeta principal llevan un reflejo que sigue
   al puntero, y una onda nace en el punto exacto de la pulsación. El emblema
   tiene un destello periódico y la tarjeta principal respira con un degradado
   que se desplaza.
6. **Leyenda viva.** Señalar una píldora de la leyenda aísla esa sede dentro del
   gráfico y retira el resto, sin tocar los filtros.
7. **Elegir qué mirar.** Cada píldora de la leyenda es un interruptor: apagar
   una sede la retira del reparto y del cruce por tipología a la vez. Los
   gráficos de tipologías y medidas llevan un selector de cuántas filas listar
   (10, 15, 25, 40 o todas) y otro de criterio de orden (volumen o alfabético).
   Pulsar una barra filtra el tablero entero por esa tipología o propietario;
   volver a pulsarla lo deshace. La barra de filtros suma «sólo con
   existencias» y muestra cuántos filtros hay puestos.
8. **Elegir cómo mirarlo.** Ningún gráfico está fijado a una sola forma; cada
   tarjeta lleva un segmentado —con la marca de cristal deslizándose hasta la
   opción elegida— para cambiar de modelo sin salir de la página:

   | Tarjeta | Formas disponibles |
   | --- | --- |
   | Dónde está el inventario | barra de participación · **anillo** |
   | Existencias por tipología | barras · **piruleta** · **mapa de áreas** |
   | Tipología por sede | apilado · agrupado |
   | Compras acumuladas | **área** · **línea** |
   | Medidas con mayor existencia | barras · **piruleta** |

   No es variedad por variedad: el agrupado comparte eje, así que comparar sedes
   deja de exigir medir segmentos desplazados; la piruleta pesa mucha menos
   tinta cuando hay muchas categorías de valores parecidos y compara posiciones
   de puntos en vez de longitudes; y el mapa de áreas enseña el peso relativo de
   cuarenta y siete tipologías muy desiguales de golpe, donde una barra por cada
   una desperdiciaría el ancho. En el mapa, las franjas de la cola tienen altura
   mínima garantizada: un bloque exacto pero invisible no informa.
9. **Detalle en todas partes.** Botones con tirón magnético hacia el cursor;
   barra de avance de lectura en la cabecera; tarjetas con barrido de luz al
   aparecer y al pasar el cursor; el punto de color del título gira al posarse
   encima; filas de tabla con acento que entra por la izquierda; flechas de
   ordenación con rebote;
   casilla de verificación que dibuja su marca; avisos con cuenta atrás visible;
   campos del formulario escalonados; el recuento de cuadre late al cambiar de
   estado; el icono de tema gira; y la cifra de cada tarjeta da un golpe seco al
   terminar de contar.

Todo el movimiento se desactiva con `prefers-reduced-motion: reduce`, incluido
el campo de fondo, y al imprimir.

---

## Compatibilidad

Chrome, Edge, Firefox y Safari en versiones recientes. La lectura y escritura de
`.xlsx` requiere `CompressionStream` (Chrome 103+, Firefox 113+, Safari 16.4+);
sin ella, el intercambio por JSON y CSV sigue funcionando.
