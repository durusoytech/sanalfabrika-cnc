// Veritabanı testleri: npm run test:db
// Migration'ları ve başlangıç verisini PGlite üzerinde kurar, güvenlik ve hesap kurallarını doğrular.
import { createDb, asUser, signUp } from './supabase-shim.mjs';

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; results.push(`  ✓ ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; results.push(`  ✗ ${name}\n      ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, eps, msg) { if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a} ≠ ${b}`); }
async function expectError(promise, match, msg) {
  try { await promise; } catch (e) {
    if (match && !String(e.message).match(match)) throw new Error(`${msg}: beklenmeyen hata "${e.message}"`);
    return e;
  }
  throw new Error(`${msg}: hata bekleniyordu`);
}

const t0 = Date.now();
const db = await createDb();
console.log(`Kurulum: migration + seed ${Date.now() - t0} ms`);

const A = await signUp(db, 'deniz@example.com', 'Deniz Aksoy');   // demo portföyüne bağlanacak
const B = await signUp(db, 'bora@example.com');                   // yeni yatırımcı
const C = await signUp(db, 'operator@example.com', 'Ops Ekibi');  // tesis personeli
await db.query(`insert into public.staff (user_id, role) values ($1, 'operator')`, [C]);
const linkMsg = (await db.query(`select public.link_demo_portfolio('deniz@example.com') as m`)).rows[0].m;

const user = uid => ({ role: 'authenticated', uid });
const anon = { role: 'anon' };
const q = (who, sql, params) => asUser(db, who, () => db.query(sql, params).then(r => r.rows));

/* ---------- başlangıç verisi ---------- */
await test('seed: 3 tesis, 30 slot, 21 makine (17 üretimde, 4 tedarikte)', async () => {
  const r = (await db.query(`select (select count(*) from factories)::int f, (select count(*) from slots)::int s,
    (select count(*) from machines where status='active')::int a, (select count(*) from machines where status='procurement')::int p`)).rows[0];
  assert(r.f === 3 && r.s === 30 && r.a === 17 && r.p === 4, JSON.stringify(r));
});
await test('seed: Gebze 10/10 dolu, Bursa 7/10, İzmir 4 ön sipariş', async () => {
  const r = (await db.query(`select factory_id, count(*)::int n from machines group by 1 order by 1`)).rows;
  const m = Object.fromEntries(r.map(x => [x.factory_id, x.n]));
  assert(m.gbz === 10 && m.brs === 7 && m.izm === 4, JSON.stringify(m));
});
await test('seed: demo takvim üretildi ve 21 gün ilerisine kadar dolu', async () => {
  const r = (await db.query(`select count(*)::int n, min(max_end) min_end from (select machine_id, max(ends_at) max_end from jobs group by 1) x`)).rows[0];
  const jobs = (await db.query(`select count(*)::int n from jobs`)).rows[0].n;
  assert(r.n === 17, `takvimi olan makine: ${r.n}`);
  assert(new Date(r.min_end) > new Date(Date.now() + 20 * 864e5), `en kısa takvim: ${r.min_end}`);
  assert(jobs > 1500, `iş sayısı: ${jobs}`);
});
await test('seed: üretimdeki makinelerin ortalama doluluğu %55–%85 arasında', async () => {
  const r = (await db.query(`select avg(u) u from (
      select m.id, sum(extract(epoch from (least(j.ends_at, now()) - greatest(j.starts_at, now() - interval '30 days')))) / (30*86400) u
      from machines m join jobs j on j.machine_id = m.id and j.kind = 'job' and j.starts_at < now() and j.ends_at > now() - interval '30 days'
      where m.status='active' group by m.id) x`)).rows[0];
  assert(r.u > 0.55 && r.u < 0.85, `ortalama doluluk ${r.u}`);
});
await test('demo portföyü giriş hesabına bağlanır', async () => {
  assert(/INV-1000/.test(linkMsg), linkMsg);
  const r = await q(user(A), `select count(*)::int n from machines`);
  assert(r[0].n === 5, `A'nın gördüğü makine: ${r[0].n}`);
});

/* ---------- yetkiler: anonim ziyaretçi ---------- */
await test('anonim: katalog ve zemin planı okunabilir', async () => {
  const f = await q(anon, `select count(*)::int n from factories`);
  const mt = await q(anon, `select axes, op_rate::float8 o from machine_types order by axes`);
  const lm = await q(anon, `select * from list_machines()`);
  assert(f[0].n === 3 && mt.length === 3 && lm.length === 21, `${f[0].n} ${mt.length} ${lm.length}`);
  near(mt[1].o, 0.42, 1e-9, '4 eksen işletme ücreti');
  assert(lm.every(m => m.is_mine === false), 'anonim için is_mine hep false olmalı');
  assert(lm.every(m => /^INV-\d{4}$/.test(m.owner_code)), 'sahip kodu biçimi');
});
await test('anonim: işler tablosuna doğrudan erişemez', async () => {
  await expectError(q(anon, `select * from jobs limit 1`), /permission denied/, 'jobs');
  await expectError(q(anon, `select * from investors limit 1`), /permission denied/, 'investors');
});
await test('anonim: takvimde müşteri ve sipariş no gizli', async () => {
  const r = await q(anon, `select * from public_jobs(now() - interval '7 days', now() + interval '7 days')`);
  assert(r.length > 100, `satır: ${r.length}`);
  assert(r.every(x => x.customer_name === null && x.order_no === null && x.is_mine === false), 'müşteri bilgisi sızdı');
});
await test('anonim: satın alma ve kâr fonksiyonları kapalı', async () => {
  await expectError(q(anon, `select purchase_machine('brs','A05',4::smallint)`), /permission denied/, 'purchase');
  await expectError(q(anon, `select * from investor_stats(now() - interval '1 day', now())`), /permission denied/, 'stats');
  await expectError(q(anon, `select link_demo_portfolio('x@y.z')`), /permission denied/, 'link');
});
await test('takvim aralığı 120 günle sınırlı', async () => {
  await expectError(q(anon, `select * from public_jobs(now() - interval '200 days', now())`), /120 gün/, 'aralık');
});

/* ---------- yetkiler: giriş yapmış yatırımcılar ---------- */
await test('kayıt olan herkese otomatik yatırımcı kodu açılır', async () => {
  const r = await q(user(B), `select code, display_name from investors`);
  assert(r.length === 1 && /^INV-\d{4}$/.test(r[0].code) && r[0].display_name === 'bora', JSON.stringify(r));
});
await test('yatırımcı başkasının işlerini göremez', async () => {
  const r = await q(user(B), `select count(*)::int n from jobs`);
  assert(r[0].n === 0, `B ${r[0].n} iş gördü`);
});
await test('sahibi kendi takviminde müşteri adını görür, başkası göremez', async () => {
  const a = await q(user(A), `select * from public_jobs(now() - interval '3 days', now() + interval '3 days', 'GBZ-A03') where kind = 'job'`);
  const b = await q(user(B), `select * from public_jobs(now() - interval '3 days', now() + interval '3 days', 'GBZ-A03') where kind = 'job'`);
  assert(a.length > 0 && a.every(x => x.customer_name && x.is_mine), 'sahip müşteri adını görmeli');
  assert(b.length === a.length && b.every(x => x.customer_name === null), 'başkası müşteri adını görmemeli');
});
await test('yatırımcı iş ekleyemez, makine değiştiremez', async () => {
  await expectError(q(user(A), `insert into jobs (machine_id, kind, title, starts_at, ends_at) values ('GBZ-A03','maint','x', now() + interval '400 days', now() + interval '401 days')`), /row-level security/, 'insert');
  const u = await q(user(A), `update machines set axes = 3 where id = 'GBZ-A03' returning id`);
  assert(u.length === 0, 'makine güncellenmemeli');
});
await test('yatırımcı sadece adını değiştirebilir, kodunu değiştiremez', async () => {
  await q(user(B), `update investors set display_name = 'Bora Y.' where user_id = auth.uid()`);
  await expectError(q(user(B), `update investors set code = 'INV-9999'`), /permission denied/, 'code update');
});

/* ---------- satın alma ---------- */
await test('boş slota satın alma: makine tedarik aşamasında oluşur', async () => {
  const r = await q(user(B), `select purchase_machine('brs', 'A05', 5::smallint, 0.6, 0.75) as id`);
  assert(r[0].id === 'BRS-A05', r[0].id);
  const m = await q(user(B), `select id, status, live_status, is_mine from list_machines() where id = 'BRS-A05'`);
  assert(m[0].status === 'procurement' && m[0].live_status === 'proc' && m[0].is_mine === true, JSON.stringify(m[0]));
  const po = await q(user(B), `select deposit::float8 d from purchase_orders`);
  near(po[0].d, (360000 + 9500) * 0.3, 0.01, 'ön ödeme');
});
await test('dolu slota ikinci satın alma reddedilir', async () => {
  await expectError(q(user(A), `select purchase_machine('brs', 'A05', 4::smallint)`), /slot dolu/, 'aynı slot');
  await expectError(q(user(A), `select purchase_machine('gbz', 'A01', 4::smallint)`), /slot dolu/, 'Gebze dolu');
});
await test('geçersiz satın alma istekleri reddedilir', async () => {
  await expectError(q(user(A), `select purchase_machine('brs', 'C09', 4::smallint)`), /Slot bulunamadı/, 'slot yok');
  await expectError(q(user(A), `select purchase_machine('xyz', 'A01', 4::smallint)`), /Tesis bulunamadı/, 'tesis yok');
  await expectError(q(user(A), `select purchase_machine('brs', 'B03', 6::smallint)`), /6 eksen|smallint|Geçersiz/, 'eksen');
  await expectError(q(user(A), `select purchase_machine('brs', 'B03', 4::smallint, 1.5)`), /0 ile 1/, 'oran');
});

await test('bekleyen sipariş sınırı: 4. sipariş reddedilir', async () => {
  await q(user(B), `select purchase_machine('brs', 'B03', 3::smallint)`);
  await q(user(B), `select purchase_machine('brs', 'B05', 3::smallint)`);
  await expectError(q(user(B), `select purchase_machine('izm', 'A03', 4::smallint)`), /en fazla 3 bekleyen/, 'sınır');
  const n = await q(user(B), `select count(*)::int n from machines`);
  assert(n[0].n === 3, `B'nin makinesi ${n[0].n}`);
});
await test('personelin girdiği işte created_by otomatik dolar', async () => {
  const r = await q(user(C), `insert into jobs (machine_id, kind, title, starts_at, ends_at)
    values ('GBZ-B05', 'maint', 'Test bakımı', now() + interval '300 days', now() + interval '300 days 2 hours') returning created_by`);
  assert(r[0].created_by === C, `created_by ${r[0].created_by}`);
});

/* ---------- kâr hesapları ---------- */
function jsStats(jobs, machines, types, fees, a, b) {
  // Prototipteki windowStats ile aynı formüller
  const MIN = 60000, out = {};
  for (const m of machines) {
    const T = types[m.axes];
    const aa = Math.max(a, new Date(m.commissioned_at).getTime());
    const s = { minutes: 0, parts: 0, gross: 0, op: 0, fee: 0, net: 0 };
    for (const j of jobs.filter(x => x.machine_id === m.id && x.kind === 'job')) {
      const js = new Date(j.starts_at).getTime(), je = new Date(j.ends_at).getTime();
      if (je <= aa || js >= b) continue;
      const mins = (Math.min(je, b) - Math.max(js, aa)) / MIN;
      const pd = t => { const s0 = js + j.setup_min * MIN; if (t <= s0) return 0; return Math.min(j.qty, Math.floor((t - s0) / (Number(j.cycle_min) * MIN) + 1e-9)); };
      const g = mins * T.rate, op = mins * T.op, fee = g * fees[j.source];
      s.minutes += mins; s.gross += g; s.op += op; s.fee += fee; s.net += g - op - fee;
      s.parts += pd(Math.min(b, je)) - pd(Math.max(aa, js));
    }
    out[m.id] = s;
  }
  return out;
}
await test('SQL kâr hesabı prototipteki JS hesabıyla birebir aynı', async () => {
  const now = Date.now();
  const d = new Date(now); const a = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const jobs = await q(user(A), `select * from jobs`);
  const machines = await q(user(A), `select id, axes, commissioned_at from machines where status = 'active'`);
  const types = Object.fromEntries((await q(anon, `select axes, rate_per_min::float8 rate, op_rate::float8 op from machine_types`)).map(t => [t.axes, t]));
  const fees = Object.fromEntries((await q(anon, `select source, rate::float8 rate from fee_rates`)).map(f => [f.source, f.rate]));
  const sql = await q(user(A), `select * from investor_stats(to_timestamp($1 / 1000.0), to_timestamp($2 / 1000.0), to_timestamp($2 / 1000.0))`, [a, now]);
  const js = jsStats(jobs, machines, types, fees, a, now);
  assert(sql.length === 4, `makine sayısı ${sql.length}`);
  for (const r of sql) {
    const j = js[r.machine_id];
    near(Number(r.minutes), j.minutes, 0.01, `${r.machine_id} dakika`);
    near(Number(r.gross), j.gross, 0.01, `${r.machine_id} brüt`);
    near(Number(r.net), j.net, 0.01, `${r.machine_id} net`);
    assert(r.parts === j.parts, `${r.machine_id} parça ${r.parts} ≠ ${j.parts}`);
    near(Number(r.own_net) + Number(r.platform_net), Number(r.net), 0.0001, `${r.machine_id} kaynak toplamı`);
    near(['cost_operator','cost_electricity','cost_maintenance','cost_tooling','cost_facility','cost_insurance'].reduce((x, k) => x + Number(r[k]), 0), Number(r.op_cost), 0.0001, `${r.machine_id} gider kalemleri`);
  }
});
await test('günlük kırılımın toplamı aylık özete eşit', async () => {
  const r = await q(user(A), `
    with b as (select date_trunc('month', now() at time zone 'Europe/Istanbul') as ms),
    d as (select sum(net)::float8 net, sum(parts)::int parts from investor_daily_stats((select ms::date from b), (now() at time zone 'Europe/Istanbul')::date)),
    s as (select sum(net)::float8 net, sum(parts)::int parts from investor_stats((select ms at time zone 'Europe/Istanbul' from b), now()))
    select d.net dn, s.net sn, d.parts dp, s.parts sp from d, s`);
  near(r[0].dn, r[0].sn, 0.01, 'net'); assert(r[0].dp === r[0].sp, `parça ${r[0].dp} ≠ ${r[0].sp}`);
});
await test('başkasının kâr verisi boş döner', async () => {
  const r = await q(user(B), `select * from investor_stats(now() - interval '30 days', now())`);
  assert(r.length === 0, `B için ${r.length} satır`);
});

/* ---------- personel ve çakışma koruması ---------- */
await test('personel iş ekleyebilir, çakışan iş veritabanında reddedilir', async () => {
  const free = await q(user(C), `select max(ends_at) + interval '2 days' t from jobs where machine_id = 'BRS-B02'`);
  const t = free[0].t;
  await q(user(C), `insert into jobs (machine_id, kind, title, material, cycle_min, qty, setup_min, source, customer_name, starts_at, ends_at)
                    values ('BRS-B02','job','Test Parçası','Al 6082',5,10,30,'own','Test', $1, $1::timestamptz + interval '80 minutes')`, [t]);
  await expectError(q(user(C), `insert into jobs (machine_id, kind, title, starts_at, ends_at) values ('BRS-B02','maint','Çakışan bakım', $1::timestamptz + interval '10 minutes', $1::timestamptz + interval '2 hours')`, [t]), /jobs_no_overlap|conflicting key/, 'çakışma');
});

/* ---------- demo motoru ---------- */
await test('demo motoru tekrar çalışınca çakışma üretmez', async () => {
  const before = (await db.query(`select count(*)::int n from jobs`)).rows[0].n;
  await db.query(`select demo.fill_all()`);
  await db.query(`select demo.fill_all()`);
  const after = (await db.query(`select count(*)::int n from jobs`)).rows[0].n;
  assert(after - before < 20, `tekrar çalıştırmada ${after - before} yeni iş`);
});
await test('tedariki biten makine üretime alınır ve takvimi dolar', async () => {
  await db.query(`update machines set ordered_at = now() - interval '120 days' where id = 'IZM-A02'`);
  await db.query(`select demo.fill_all()`);
  const m = (await db.query(`select status, commissioned_at from machines where id = 'IZM-A02'`)).rows[0];
  const n = (await db.query(`select count(*)::int n from jobs where machine_id = 'IZM-A02'`)).rows[0].n;
  assert(m.status === 'active' && m.commissioned_at, JSON.stringify(m));
  assert(n > 5, `iş sayısı ${n}`);
});

console.log(results.join('\n'));
console.log(`\n${passed} geçti, ${failed} kaldı · toplam ${Date.now() - t0} ms`);
await db.close();
process.exit(failed ? 1 : 0);
