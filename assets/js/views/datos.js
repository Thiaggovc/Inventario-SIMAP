/* Intercambio de archivos y publicación en el repositorio de GitHub. */

import {
  h, clear, fmt, fmtFechaHora, downloadBlob, stamp, toast, openModal, confirmDialog,
} from '../util.js';
import { store, replaceData, markPublished, discardDraft, stableStringify, itemTotal } from '../state.js';
import { exportXlsx, exportJson, exportCsv, importFile, diffSummary } from '../workbook.js';
import * as gh from '../github.js';

export function renderDatos(root) {
  const host = h('div', { class: 'view' });
  const shell = h('div', { class: 'shell' });
  host.append(shell);

  shell.append(
    h(
      'header',
      { class: 'view__head' },
      h(
        'div',
        { class: 'view__headrow' },
        h('div', {}, h('div', { class: 'kicker' }, 'Archivo y respaldo'), h('h1', { class: 'display' }, 'Datos y publicación')),
        h('div', { class: 'meta-line' }, h('span', {}, 'Estado ', h('b', {}, store.dirty ? 'con cambios sin publicar' : 'sincronizado')))
      ),
      h(
        'p',
        { class: 'deck' },
        'Descargue el inventario completo, retome el trabajo desde un archivo existente o publique la versión vigente en el repositorio de GitHub que aloja esta aplicación.'
      )
    )
  );

  const grid = h('div', { class: 'grid' });
  shell.append(grid);
  grid.append(exportCard(), importCard(), githubCard(), estadoCard());

  clear(root).append(host);
  return () => {};
}

/* ---------------------------------------------------------- exportación -- */

function exportCard() {
  const nombre = () => `INVENTARIO_FORMALETERIA_SIMAP_${stamp()}`;

  const doExport = async (kind) => {
    try {
      if (kind === 'xlsx') {
        downloadBlob(await exportXlsx(store.data), `${nombre()}.xlsx`);
        toast('Excel generado', 'Seis hojas: inventario, resúmenes, compras, consistencia y catálogos.', 'ok');
      } else if (kind === 'json') {
        downloadBlob(exportJson(store.data), `${nombre()}.json`);
        toast('JSON generado', 'Formato exacto para retomar el trabajo sin pérdida.', 'ok');
      } else {
        downloadBlob(exportCsv(store.data), `${nombre()}.csv`);
        toast('CSV generado', 'Separado por punto y coma, listo para Excel en español.', 'ok');
      }
    } catch (err) {
      console.error(err);
      toast('No se pudo exportar', err.message, 'bad');
    }
  };

  return card(
    'Exportar el inventario',
    'Un archivo con toda la información, listo para compartir o archivar',
    'col-6',
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => doExport('xlsx') }, 'Descargar Excel (.xlsx)'),
        h('button', { class: 'btn', type: 'button', onclick: () => doExport('json') }, 'JSON'),
        h('button', { class: 'btn', type: 'button', onclick: () => doExport('csv') }, 'CSV')
      ),
      h(
        'dl',
        { class: 'kv' },
        h('dt', {}, 'Referencias'), h('dd', {}, fmt(store.data.items.length)),
        h('dt', {}, 'Unidades ubicadas'), h('dd', {}, fmt(store.data.items.reduce((a, it) => a + itemTotal(it), 0))),
        h('dt', {}, 'Tipologías'), h('dd', {}, fmt(store.data.tipos.length)),
        h('dt', {}, 'Sedes'), h('dd', {}, store.data.ubicaciones.map((u) => u.nombre).join(' · ') || '—'),
        h('dt', {}, 'Compras'), h('dd', {}, fmt(store.data.compras.length))
      ),
      h(
        'div',
        { class: 'note' },
        h('b', {}, 'El Excel se puede volver a cargar. '),
        'La hoja «INVENTARIO» conserva la estructura del archivo original de Grupo SIMAP, así que sirve tanto para trabajar fuera de la aplicación como para reanudar aquí.'
      )
    )
  );
}

/* ---------------------------------------------------------- importación -- */

function importCard() {
  const input = h('input', {
    type: 'file',
    accept: '.xlsx,.xlsm,.json,.csv',
    class: 'sr-only',
    onchange: (e) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = '';
    },
  });

  const drop = h(
    'div',
    { class: 'drop' },
    h('div', { class: 'drop__title' }, 'Suba un archivo y continúe el trabajo'),
    h('div', { class: 'drop__hint' }, 'Excel (.xlsx), JSON o CSV · también puede arrastrarlo hasta aquí'),
    h('button', { class: 'btn btn--primary', type: 'button', onclick: () => input.click() }, 'Seleccionar archivo'),
    input
  );

  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
    })
  );
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  return card(
    'Cargar un archivo',
    'Retome un inventario exportado antes, o el archivo original de Excel',
    'col-6',
    h(
      'div',
      { class: 'stack' },
      drop,
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Se lee el archivo en el navegador; nada se envía a ningún servidor.'),
        h('li', {}, 'Se compara con el inventario en pantalla y se muestra el resumen de cambios.'),
        h('li', {}, 'Al confirmar, el inventario cargado reemplaza al actual como borrador local.'),
        h('li', {}, 'Publique en GitHub cuando quiera dejarlo como versión oficial.')
      )
    )
  );
}

async function handleFile(file) {
  try {
    const res = await importFile(file);
    const diff = diffSummary(store.data, res.data);
    const nuevos = res.data;

    const btnCancelar = h('button', { class: 'btn', type: 'button' }, 'Cancelar');
    const btnCargar = h('button', { class: 'btn btn--primary', type: 'button' }, 'Cargar y continuar');

    const { close } = openModal({
      title: 'Confirmar carga',
      subtitle: `${file.name} · ${res.formato}`,
      width: '620px',
      body: h(
        'div',
        { class: 'stack' },
        h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Hoja leída'), h('dd', {}, res.hojaUsada || res.hojas.join(', ')),
          h('dt', {}, 'Referencias'), h('dd', {}, `${fmt(nuevos.items.length)} (antes ${fmt(store.data.items.length)})`),
          h('dt', {}, 'Unidades ubicadas'), h('dd', {}, `${fmt(diff.unidadesDespues)} (antes ${fmt(diff.unidadesAntes)})`),
          h('dt', {}, 'Sedes'), h('dd', {}, nuevos.ubicaciones.map((u) => u.nombre).join(' · ') || '—'),
          h('dt', {}, 'Propietarios'), h('dd', {}, nuevos.propietarios.map((p) => p.nombre).join(' · ') || '—'),
          h('dt', {}, 'Compras'), h('dd', {}, fmt(nuevos.compras.length)),
          h('dt', {}, 'Altas / bajas'), h('dd', {}, `${fmt(diff.nuevas)} nuevas · ${fmt(diff.quitadas)} ausentes · ${fmt(diff.cambiadas)} con cambio de cantidad`)
        ),
        !nuevos.ubicaciones.length || !nuevos.propietarios.length
          ? h('div', { class: 'note note--bad' }, 'El archivo no declara sedes o propietarios reconocibles. Revise que el encabezado incluya los grupos «PROYECTO» y «PROPIETARIO».')
          : null,
        h('div', { class: 'note note--warn' }, 'La carga reemplaza por completo el inventario en pantalla. El repositorio no cambia hasta que se publique.')
      ),
      footer: [btnCancelar, btnCargar],
    });

    btnCancelar.onclick = () => close();
    btnCargar.onclick = () => {
      replaceData(nuevos, { source: `archivo: ${file.name}` });
      close();
      toast('Inventario cargado', `${fmt(nuevos.items.length)} referencias desde ${file.name}`, 'ok');
      location.hash = '#/resumen';
    };
  } catch (err) {
    console.error(err);
    toast('No se pudo leer el archivo', err.message, 'bad');
  }
}

/* --------------------------------------------------------------- GitHub -- */

function githubCard() {
  const cfg = gh.loadConfig();
  const body = h('div', { class: 'stack' });

  const f = (label, key, placeholder, type = 'text') =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, label),
      h('input', { class: 'input', type, value: cfg[key] || '', placeholder, oninput: (e) => (cfg[key] = e.target.value.trim()) })
    );

  const tokenInput = h('input', {
    class: 'input',
    type: 'password',
    value: gh.getToken(),
    placeholder: 'github_pat_…',
    autocomplete: 'off',
    oninput: (e) => gh.setToken(e.target.value.trim()),
  });

  const mensaje = h('input', { class: 'input', placeholder: 'Actualiza inventario de formaletería' });
  const salida = h('div', {});

  const withBusy = (btn, fn) => async () => {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Trabajando…';
    try {
      await fn();
    } catch (err) {
      console.error(err);
      clear(salida).append(h('div', { class: 'note note--bad' }, err.message));
      toast('GitHub', err.message, 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  };

  const btnTest = h('button', { class: 'btn', type: 'button' }, 'Probar acceso');
  const btnPull = h('button', { class: 'btn', type: 'button' }, 'Cargar desde GitHub');
  const btnPush = h('button', { class: 'btn btn--primary', type: 'button' }, 'Publicar en GitHub');
  const btnHist = h('button', { class: 'btn', type: 'button' }, 'Historial');

  const requireCfg = () => {
    gh.saveConfig(cfg);
    if (!cfg.owner || !cfg.repo) throw new Error('Indique el propietario y el nombre del repositorio.');
    if (!gh.getToken()) throw new Error('Falta el token de acceso personal.');
    return cfg;
  };

  btnTest.onclick = withBusy(btnTest, async () => {
    const info = await gh.testAccess(requireCfg(), gh.getToken());
    clear(salida).append(
      h(
        'div',
        { class: info.puedeEscribir ? 'note' : 'note note--warn' },
        h('b', {}, info.nombre),
        ` · ${info.privado ? 'privado' : 'público'} · rama por defecto ${info.ramaPorDefecto} · `,
        info.puedeEscribir ? 'el token puede publicar.' : 'el token sólo tiene lectura: no podrá publicar.'
      )
    );
  });

  btnPull.onclick = withBusy(btnPull, async () => {
    const res = await gh.pull(requireCfg(), gh.getToken());
    if (store.dirty) {
      const ok = await confirmDialog({
        title: 'Descartar el borrador local',
        message: 'Hay cambios locales sin publicar. Al cargar desde GitHub se perderán.',
        confirmLabel: 'Cargar de todos modos',
        danger: true,
      });
      if (!ok) return;
    }
    replaceData(res.data, { source: 'GitHub', asBaseline: true });
    clear(salida).append(h('div', { class: 'note' }, `Cargado desde ${cfg.owner}/${cfg.repo} · ${fmt(store.data.items.length)} referencias.`));
    toast('Inventario cargado', `Versión publicada en ${cfg.branch}`, 'ok');
  });

  btnPush.onclick = withBusy(btnPush, async () => {
    requireCfg();
    const json = JSON.stringify(store.data, null, 1);
    const res = await gh.push(cfg, gh.getToken(), json, mensaje.value.trim());
    markPublished();
    clear(salida).append(
      h(
        'div',
        { class: 'note' },
        'Publicado en el commit ',
        res.url ? h('a', { href: res.url, target: '_blank', rel: 'noopener' }, res.commit) : h('b', {}, res.commit || '—'),
        `. El archivo ${cfg.path} de la rama ${cfg.branch} ya contiene esta versión.`
      )
    );
    mensaje.value = '';
    toast('Inventario publicado', `Commit ${res.commit} en ${cfg.branch}`, 'ok');
  });

  btnHist.onclick = withBusy(btnHist, async () => {
    const list = await gh.history(requireCfg(), gh.getToken());
    clear(salida).append(
      list.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Commit'), h('th', {}, 'Mensaje'), h('th', {}, 'Autor'), h('th', {}, 'Fecha'))),
              h(
                'tbody',
                {},
                list.map((c) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.sha)),
                    h('td', { class: 'wrap' }, c.mensaje),
                    h('td', {}, c.autor),
                    h('td', {}, fmtFechaHora(c.fecha))
                  )
                )
              )
            )
          )
        : h('div', { class: 'note' }, 'Todavía no hay commits sobre ese archivo.')
    );
  });

  body.append(
    h(
      'div',
      { class: 'form-grid' },
      f('Propietario', 'owner', 'usuario u organización'),
      f('Repositorio', 'repo', 'Inventario-SIMAP'),
      f('Rama', 'branch', 'main'),
      f('Ruta del archivo', 'path', 'data/inventario.json')
    ),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Token de acceso personal (permiso Contents: read & write)'), tokenInput),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Mensaje del commit (opcional)'), mensaje),
    h('div', { class: 'row' }, btnPush, btnPull, btnTest, btnHist),
    salida,
    h(
      'div',
      { class: 'note' },
      h('b', {}, 'El token no sale de este navegador. '),
      'Se guarda en el almacenamiento local del equipo y sólo se usa para hablar con la API de GitHub. Si comparte el computador, bórrelo al terminar.'
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn btn--sm btn--danger',
          type: 'button',
          onclick: () => {
            gh.setToken('');
            tokenInput.value = '';
            toast('Token borrado', 'Se eliminó del almacenamiento local.', 'ok');
          },
        },
        'Borrar token guardado'
      )
    )
  );

  return card('Publicar en GitHub', 'El repositorio guarda el histórico completo del inventario', 'col-8', body);
}

/* --------------------------------------------------------------- estado -- */

function estadoCard() {
  const bytes = new Blob([stableStringify(store.data)]).size;

  return card(
    'Estado del borrador',
    'Qué hay en este navegador ahora mismo',
    'col-4',
    h(
      'div',
      { class: 'stack' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', {}, 'Origen'), h('dd', {}, store.source),
        h('dt', {}, 'Cambios'), h('dd', {}, store.dirty ? 'sin publicar' : 'ninguno'),
        h('dt', {}, 'Actualizado'), h('dd', {}, fmtFechaHora(store.data.meta.actualizado)),
        h('dt', {}, 'Tamaño'), h('dd', {}, `${(bytes / 1024).toFixed(1)} kB`)
      ),
      store.dirty
        ? h('div', { class: 'note note--warn' }, 'Hay cambios guardados sólo en este navegador. Publíquelos en GitHub o expórtelos para no perderlos.')
        : h('div', { class: 'note' }, 'El borrador local coincide con la versión publicada.'),
      h(
        'button',
        {
          class: 'btn btn--danger',
          type: 'button',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Descartar cambios locales',
              message: 'Se eliminará el borrador de este navegador y se recargará la versión publicada en el repositorio.',
              confirmLabel: 'Descartar',
              danger: true,
            });
            if (!ok) return;
            await discardDraft();
            toast('Borrador descartado', 'Se recuperó la versión del repositorio.', 'ok');
            location.hash = '#/resumen';
          },
        },
        'Descartar cambios locales'
      )
    )
  );
}

/* ---------------------------------------------------------------- base --- */

function card(title, sub, span, body) {
  return h(
    'section',
    { class: `card ${span}` },
    h('header', { class: 'card__head' }, h('div', {}, h('h3', { class: 'card__title' }, title), h('div', { class: 'card__sub' }, sub))),
    h('div', { class: 'card__body' }, body)
  );
}
