// Supabase ortamının yerel taklidi: anon/authenticated/service_role rolleri, auth.users ve auth.uid().
// Docker gerektirmeden migration'ları PGlite (WASM Postgres) üzerinde çalıştırmak için kullanılır.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SHIM_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    encrypted_password text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export function migrationFiles() {
  const dir = join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }));
}

export async function createDb({ seed = true, dataDir } = {}) {
  const db = new PGlite({ dataDir, extensions: { btree_gist } });
  await db.exec(SHIM_SQL);
  for (const m of migrationFiles()) {
    try { await db.exec(m.sql); }
    catch (e) { throw new Error(`Migration hatası (${m.name}): ${e.message}`); }
  }
  if (seed) await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
  return db;
}

// Bir isteği belirli rol ve kullanıcı ile, tek işlem içinde çalıştırır (PostgREST'in yaptığı gibi)
let queue = Promise.resolve();
export function asUser(db, { role = 'anon', uid = '' } = {}, fn) {
  const run = async () => {
    await db.exec('begin');
    try {
      await db.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, uid || '']);
      const out = await fn();
      await db.exec('commit');
      return out;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export async function signUp(db, email, fullName = '') {
  const r = await db.query(
    `insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, 'test', $2) returning id`,
    [email, JSON.stringify(fullName ? { full_name: fullName } : {})]
  );
  return r.rows[0].id;
}
