/* Persistencia en el repositorio de GitHub mediante la Contents API.
 *
 * El token es un dato del usuario: vive únicamente en el almacenamiento local
 * de su navegador y nunca se escribe en el repositorio ni se envía a terceros.
 * Para publicar basta un token de acceso personal con permiso de escritura de
 * contenidos sobre este repositorio.
 */

const LS_CFG = 'simap.github.cfg.v1';
const LS_TOKEN = 'simap.github.token.v1';
const API = 'https://api.github.com';

export function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem(LS_CFG) || '{}');
  } catch {
    cfg = {};
  }
  return {
    owner: cfg.owner || detectFromPages().owner,
    repo: cfg.repo || detectFromPages().repo,
    branch: cfg.branch || 'main',
    path: cfg.path || 'data/inventario.json',
    sha: cfg.sha || '',
  };
}

export function saveConfig(cfg) {
  const prev = loadConfig();
  localStorage.setItem(LS_CFG, JSON.stringify({ ...prev, ...cfg }));
}

export const getToken = () => localStorage.getItem(LS_TOKEN) || '';

export function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  else localStorage.removeItem(LS_TOKEN);
}

/** Deduce owner/repo cuando la app corre en github.io. */
function detectFromPages() {
  const host = location.hostname;
  const m = /^([\w-]+)\.github\.io$/i.exec(host);
  if (!m) return { owner: '', repo: '' };
  const seg = location.pathname.split('/').filter(Boolean);
  return { owner: m[1], repo: seg[0] || `${m[1]}.github.io` };
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status}`;
    const err = new Error(traducirError(res.status, msg));
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  return json;
}

function traducirError(status, msg) {
  if (status === 401) return 'Token inválido o vencido. Genere uno nuevo en GitHub.';
  if (status === 403) return `Acceso denegado: ${msg}. Revise los permisos del token (Contents: read & write).`;
  if (status === 404) return 'No se encontró el repositorio, la rama o la ruta indicada.';
  if (status === 409) return 'Conflicto: el archivo cambió en GitHub desde la última lectura. Vuelva a cargar antes de publicar.';
  if (status === 422) return `GitHub rechazó la operación: ${msg}`;
  return msg;
}

/* -------------------------------------------------------------- base64 -- */

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------ operaciones */

export async function testAccess(cfg, token) {
  const repo = await api(`/repos/${cfg.owner}/${cfg.repo}`, { token });
  return {
    nombre: repo.full_name,
    privado: repo.private,
    ramaPorDefecto: repo.default_branch,
    puedeEscribir: !!repo.permissions?.push,
  };
}

/** Lee el archivo de inventario publicado en el repositorio. */
export async function pull(cfg, token) {
  const q = `?ref=${encodeURIComponent(cfg.branch)}`;
  const file = await api(`/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(cfg.path)}${q}`, { token });
  if (Array.isArray(file)) throw new Error('La ruta indicada es una carpeta, no un archivo.');
  const content = fromBase64(file.content || '');
  saveConfig({ ...cfg, sha: file.sha });
  return { data: JSON.parse(content), sha: file.sha, size: file.size };
}

/**
 * Publica el inventario. Si no se conoce el sha vigente se consulta primero,
 * para no sobrescribir a ciegas un cambio hecho por otra persona.
 */
export async function push(cfg, token, jsonText, message) {
  let sha = cfg.sha || '';
  try {
    const current = await api(
      `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(cfg.path)}?ref=${encodeURIComponent(cfg.branch)}`,
      { token }
    );
    if (!Array.isArray(current)) sha = current.sha;
  } catch (err) {
    if (err.status !== 404) throw err;
    sha = '';
  }

  const res = await api(`/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(cfg.path)}`, {
    method: 'PUT',
    token,
    body: {
      message: message || `Actualiza inventario de formaletería (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
      content: toBase64(jsonText),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    },
  });

  saveConfig({ ...cfg, sha: res.content?.sha || '' });
  return {
    sha: res.content?.sha,
    commit: res.commit?.sha?.slice(0, 7),
    url: res.commit?.html_url,
    fecha: res.commit?.committer?.date,
  };
}

/** Últimos commits que tocaron el archivo de inventario. */
export async function history(cfg, token, limit = 8) {
  const q = new URLSearchParams({ path: cfg.path, sha: cfg.branch, per_page: String(limit) });
  const commits = await api(`/repos/${cfg.owner}/${cfg.repo}/commits?${q}`, { token });
  return (commits || []).map((c) => ({
    sha: c.sha.slice(0, 7),
    mensaje: c.commit.message.split('\n')[0],
    autor: c.commit.author?.name || c.author?.login || '—',
    fecha: c.commit.author?.date,
    url: c.html_url,
  }));
}
