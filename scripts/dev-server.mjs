// Yerel geliştirme sunucusu: npm run dev
// Docker gerektirmeden siteyi gerçek veritabanı mantığıyla çalıştırır. Supabase'in sitenin kullandığı
// uç noktalarını (Auth, tablo okuma, RPC) taklit eder; arkada aynı migration'larla kurulmuş PGlite vardır.
// Yalnızca yerel test içindir; üretimde Supabase kullanılır.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, normalize, extname } from 'node:path';
import { createDb, asUser, ROOT } from './supabase-shim.mjs';

const PORT = Number(process.env.PORT || 8792);
const KEY = 'sb_publishable_yerel_gelistirme';
const DEMO_USER = { email: 'demo@sanalfabrika.test', password: 'demo1234', name: 'Deniz Aksoy' };

const t0 = Date.now();
const db = await createDb();
const hash = pw => createHash('sha256').update('sanalfabrika:' + pw).digest('hex');
await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)`,
  [DEMO_USER.email, hash(DEMO_USER.password), JSON.stringify({ full_name: DEMO_USER.name })]);
await db.query(`select public.link_demo_portfolio($1)`, [DEMO_USER.email]);

// Data API'ye açık tablolar ve fonksiyon imzaları
const TABLES = new Set((await db.query(`select tablename from pg_tables where schemaname = 'public'`)).rows.map(r => r.tablename));
const FUNCS = {};
for (const r of (await db.query(`
  select p.proname, p.proretset, pg_get_function_identity_arguments(p.oid) args, t.typtype
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
  where n.nspname = 'public'`)).rows) {
  const args = r.args ? r.args.split(', ').map(a => { const i = a.indexOf(' '); return { name: a.slice(0, i), type: a.slice(i + 1) }; }) : [];
  FUNCS[r.proname] = { set: r.proretset, composite: r.typtype === 'c', args };
}
console.log(`Veritabanı hazır (${Date.now() - t0} ms): ${TABLES.size} tablo, ${Object.keys(FUNCS).length} fonksiyon`);

/* ---------- yardımcılar ---------- */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeToken(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.yerel`;
}
function readToken(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok || tok === KEY) return null;
  try {
    const p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
    return p.exp * 1000 > Date.now() ? p : null;
  } catch { return null; }
}
const userJson = u => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at,
  user_metadata: u.raw_user_meta_data || {}, app_metadata: { provider: 'email' }, created_at: u.created_at
});
const session = u => {
  const access_token = makeToken(u);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'yenile.' + u.id + '.' + randomUUID(), user: userJson(u) };
};
const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra });
  res.end(body === undefined ? '' : JSON.stringify(body, (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
};
async function body(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString();
  return s ? JSON.parse(s) : {};
}
function pgError(res, e) {
  const code = e.code || '';
  const status = code === '42501' ? 403 : code === 'P0002' ? 404 : code === '23505' ? 409 : 400;
  json(res, status, { code, message: e.message, details: e.detail || null, hint: e.hint || null });
}
const IDENT = /^[a-z_][a-z0-9_]*$/;

/* ---------- Auth ---------- */
async function auth(req, res, path, url) {
  if (path === '/auth/v1/signup' && req.method === 'POST') {
    const b = await body(req);
    if (!b.email || !b.password) return json(res, 400, { error_description: 'Email and password required' });
    if (String(b.password).length < 6) return json(res, 422, { msg: 'Password should be at least 6 characters', error_code: 'weak_password' });
    const ex = await db.query(`select 1 from auth.users where lower(email) = lower($1)`, [b.email]);
    if (ex.rows.length) return json(res, 422, { msg: 'User already registered', error_code: 'user_already_exists' });
    const u = (await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning *`,
      [b.email, hash(b.password), JSON.stringify(b.data || {})])).rows[0];
    return json(res, 200, session(u));
  }
  if (path === '/auth/v1/token' && req.method === 'POST') {
    const b = await body(req);
    const grant = url.searchParams.get('grant_type');
    let u;
    if (grant === 'password') {
      u = (await db.query(`select * from auth.users where lower(email) = lower($1) and encrypted_password = $2`, [b.email || '', hash(b.password || '')])).rows[0];
      if (!u) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    } else if (grant === 'refresh_token') {
      const id = String(b.refresh_token || '').split('.')[1];
      u = id ? (await db.query(`select * from auth.users where id::text = $1`, [id])).rows[0] : null;
      if (!u) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', msg: 'Invalid Refresh Token' });
    } else return json(res, 400, { error: 'unsupported_grant_type' });
    return json(res, 200, session(u));
  }
  if (path === '/auth/v1/user' && req.method === 'GET') {
    const t = readToken(req);
    if (!t) return json(res, 401, { msg: 'JWT expired or invalid', error_code: 'bad_jwt' });
    const u = (await db.query(`select * from auth.users where id = $1`, [t.sub])).rows[0];
    return u ? json(res, 200, userJson(u)) : json(res, 404, { msg: 'User not found' });
  }
  if (path === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
  return json(res, 404, { msg: 'Bu yerel sunucuda olmayan Auth uç noktası: ' + path });
}

/* ---------- Data API (PostgREST benzeri) ---------- */
function paging(url) {
  const limit = url.searchParams.get('limit'), offset = url.searchParams.get('offset');
  let sql = '';
  if (limit !== null) { if (!/^\d+$/.test(limit)) throw Object.assign(new Error('limit'), { code: '22023' }); sql += ` limit ${limit}`; }
  if (offset !== null) { if (!/^\d+$/.test(offset)) throw Object.assign(new Error('offset'), { code: '22023' }); sql += ` offset ${offset}`; }
  return sql;
}
function orderBy(url) {
  const o = url.searchParams.getAll('order').join(',');
  if (!o) return '';
  const parts = o.split(',').map(p => {
    const [col, dir = 'asc'] = p.split('.');
    if (!IDENT.test(col) || !/^(asc|desc)$/.test(dir)) throw Object.assign(new Error('Geçersiz sıralama: ' + p), { code: '22023' });
    return `${col} ${dir}`;
  });
  return ' order by ' + parts.join(', ');
}
async function rest(req, res, path, url) {
  const tok = readToken(req);
  const who = tok ? { role: 'authenticated', uid: tok.sub } : { role: 'anon' };
  const single = String(req.headers.accept || '').includes('vnd.pgrst.object');
  try {
    let sql, params = [];
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.slice('/rest/v1/rpc/'.length);
      const f = FUNCS[name];
      if (!f || !IDENT.test(name)) return json(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}` });
      const b = req.method === 'POST' ? await body(req) : Object.fromEntries(url.searchParams);
      const used = f.args.filter(a => b[a.name] !== undefined);
      const unknown = Object.keys(b).filter(k => !f.args.some(a => a.name === k) && !['limit', 'offset', 'order'].includes(k));
      if (unknown.length) return json(res, 404, { code: 'PGRST202', message: `Fonksiyon bu parametreleri almıyor: ${unknown.join(', ')}` });
      params = used.map(a => (typeof b[a.name] === 'object' && b[a.name] !== null ? JSON.stringify(b[a.name]) : b[a.name]));
      const call = `public.${name}(${used.map((a, i) => `${a.name} => $${i + 1}::${a.type}`).join(', ')})`;
      sql = f.set || f.composite ? `select * from ${call}${orderBy(url)}${paging(url)}` : `select ${call} as v`;
      const rows = await asUser(db, who, () => db.query(sql, params).then(r => r.rows));
      return json(res, 200, f.set ? rows : f.composite ? rows[0] : rows[0].v);
    }
    const table = path.slice('/rest/v1/'.length);
    if (!TABLES.has(table)) return json(res, 404, { code: 'PGRST205', message: `Could not find the table public.${table}` });
    if (req.method !== 'GET') return json(res, 405, { message: 'Yerel sunucu yalnızca okuma destekler' });
    const sel = url.searchParams.get('select') || '*';
    if (sel !== '*') return json(res, 400, { message: 'Yerel sunucu yalnızca select=* destekler' });
    const where = [];
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const m = /^eq\.(.*)$/.exec(v);
      if (!IDENT.test(k) || !m) return json(res, 400, { message: `Desteklenmeyen filtre: ${k}=${v}` });
      params.push(m[1]); where.push(`${k}::text = $${params.length}`);
    }
    sql = `select * from public.${table}${where.length ? ' where ' + where.join(' and ') : ''}${orderBy(url)}${paging(url)}`;
    const rows = await asUser(db, who, () => db.query(sql, params).then(r => r.rows));
    if (single) {
      if (rows.length !== 1) return json(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
      return json(res, 200, rows[0]);
    }
    return json(res, 200, rows);
  } catch (e) { return pgError(res, e); }
}

/* ---------- statik dosyalar ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
async function file(req, res, path) {
  if (path === '/assets/config.js') {
    res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
    return res.end(`window.SF_CONFIG = { supabaseUrl: location.origin, supabaseKey: '${KEY}' };\n`);
  }
  const rel = normalize(decodeURIComponent(path === '/' ? '/index.html' : path)).replace(/^(\.\.[/\\])+/, '');
  if (rel.includes('..') || rel.startsWith('/node_modules') || rel.startsWith('/.')) { res.writeHead(404); return res.end(); }
  const full = join(ROOT, rel);
  try {
    if (!(await stat(full)).isFile()) throw new Error();
    res.writeHead(200, { 'content-type': TYPES[extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(full));
  } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Bulunamadı'); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' });
      return res.end();
    }
    if (path.startsWith('/auth/v1/')) return await auth(req, res, path, url);
    if (path.startsWith('/rest/v1/')) return await rest(req, res, path, url);
    return await file(req, res, path);
  } catch (e) {
    console.error(e);
    json(res, 500, { message: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`SanalFabrika yerel sunucu: http://localhost:${PORT}`);
  console.log(`Demo giriş: ${DEMO_USER.email} / ${DEMO_USER.password}`);
});
