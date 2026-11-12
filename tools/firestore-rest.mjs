// Firestore REST yardımcıları: değer dönüştürme, yönetici erişimi ve temel çağrılar.
// Hem canlı projeyle hem yerel emülatörle çalışır.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT = JSON.parse(readFileSync(join(ROOT, '.firebaserc'), 'utf8')).projects.default;

export const EMULATOR = process.argv.includes('--emulator') || !!process.env.FIRESTORE_EMULATOR_HOST;
const FS_HOST = EMULATOR ? 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8185') : 'https://firestore.googleapis.com';
export const AUTH_EMULATOR = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199');
export const DB = `projects/${PROJECT}/databases/(default)`;
export const DOCS = `${FS_HOST}/v1/${DB}/documents`;

/* ---------- JS değeri ↔ Firestore değeri ---------- */
export function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new Error('Desteklenmeyen değer: ' + v);
}
export const encodeFields = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
export function decode(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return undefined;
}
export const decodeFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decode(v)]));

/* ---------- yönetici erişimi ----------
   Emülatörde "owner" anahtarı kuralları atlar. Canlı projede Firebase CLI oturumu kullanılır
   (önce: npx firebase-tools login). Bu erişim güvenlik kurallarına takılmaz. */
let adminToken = null;
export async function getAdminToken() {
  if (EMULATOR) return 'owner';
  if (adminToken) return adminToken;
  const lib = process.env.FIREBASE_TOOLS_LIB || join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'firebase-tools', 'lib');
  const require = createRequire(import.meta.url);
  const { configstore } = require(join(lib, 'configstore'));
  const auth = require(join(lib, 'auth'));
  const tokens = configstore.get('tokens');
  if (!tokens || !tokens.refresh_token) throw new Error('Firebase CLI oturumu yok. Önce "npx firebase-tools login" çalıştırın.');
  adminToken = (await auth.getAccessToken(tokens.refresh_token, [])).access_token;
  return adminToken;
}

export async function call(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (token && !EMULATOR && token !== 'owner') headers['X-Goog-User-Project'] = PROJECT;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  return { ok: r.ok, status: r.status, json, text };
}

// Belgeyi yazar. overwrite=false ise yalnızca belge yoksa oluşturur.
export async function writeDoc(path, data, { token, overwrite = false } = {}) {
  const url = `${DOCS}/${path}` + (overwrite ? '' : '?currentDocument.exists=false');
  const r = await call('PATCH', url, { token, body: { fields: encodeFields(data) } });
  if (!r.ok && !overwrite && (r.status === 409 || r.status === 400) && /exist/i.test(r.text)) return 'atlandı (zaten var)';
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
  return overwrite ? 'yazıldı' : 'oluşturuldu';
}
export async function getDoc(path, { token } = {}) {
  const r = await call('GET', `${DOCS}/${path}`, { token });
  return { ...r, data: r.ok && r.json ? decodeFields(r.json.fields) : null };
}
export async function listDocs(collectionPath, { token } = {}) {
  const r = await call('GET', `${DOCS}/${collectionPath}?pageSize=300`, { token });
  return { ...r, docs: r.ok ? ((r.json && r.json.documents) || []).map(d => ({ id: d.name.split('/').pop(), ...decodeFields(d.fields) })) : [] };
}
export async function queryEq(collectionId, field, value, { token } = {}) {
  const r = await call('POST', `${DOCS}:runQuery`, {
    token,
    body: { structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encode(value) } } } }
  });
  const rows = r.ok && Array.isArray(r.json) ? r.json.filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...decodeFields(x.document.fields) })) : [];
  return { ...r, docs: rows };
}
// Sunucu zamanı damgasıyla belge oluşturur (istemcinin serverTimestamp() ile yaptığının aynısı).
export async function createWithServerTime(path, data, timeField, { token } = {}) {
  return call('POST', `${DOCS}:commit`, {
    token,
    body: { writes: [{
      update: { name: `${DB}/documents/${path}`, fields: encodeFields(data) },
      updateTransforms: [{ fieldPath: timeField, setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false }
    }] }
  });
}
export async function patchFields(path, data, { token } = {}) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  return call('PATCH', `${DOCS}/${path}?${mask}`, { token, body: { fields: encodeFields(data) } });
}
export async function deleteDoc(path, { token } = {}) {
  return call('DELETE', `${DOCS}/${path}`, { token });
}

// Çekirdek dosyasındaki varsayılan ayarları Node içinde okur.
export function loadCore() {
  const win = {};
  new Function('window', readFileSync(join(ROOT, 'assets', 'core.js'), 'utf8'))(win);
  return win.SF;
}
