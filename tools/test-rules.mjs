// Firestore erişim kurallarının testleri. Yerel emülatörde çalışır, canlı veriye dokunmaz:
//   npx firebase-tools emulators:exec --only auth,firestore "node tools/test-rules.mjs"
import {
  EMULATOR, AUTH_EMULATOR, call, writeDoc, getDoc, listDocs, queryEq, createWithServerTime, patchFields, deleteDoc, loadCore
} from './firestore-rest.mjs';
import { facilities, machines, news } from './seed-data.mjs';

if (!EMULATOR) { console.error('Bu testler yalnızca emülatörde çalışır (FIRESTORE_EMULATOR_HOST tanımlı değil).'); process.exit(2); }

let passed = 0, failed = 0;
const out = [];
async function test(name, fn) {
  try { await fn(); passed++; out.push(`  ✓ ${name}`); }
  catch (e) { failed++; out.push(`  ✗ ${name}\n      ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const allowed = (r, m) => assert(r.ok, `${m}: izin bekleniyordu, HTTP ${r.status} ${String(r.text).slice(0, 140)}`);
const denied = (r, m) => assert(r.status === 403, `${m}: ret bekleniyordu, HTTP ${r.status}`);

/* ---------- hazırlık ---------- */
const owner = { token: 'owner', overwrite: true };
const SF = loadCore();
await writeDoc('config/pricing', { fees: SF.FEES, depositRate: SF.DEPOSIT_RATE }, owner);
for (const T of Object.values(SF.TYPES)) await writeDoc(`machineTypes/${T.axes}`, SF.typeToDoc(T), owner);
for (const [id, f] of Object.entries(facilities)) await writeDoc(`facilities/${id}`, f, owner);
for (const [id, m] of Object.entries(machines)) await writeDoc(`machines/${id}`, m, owner);
for (const [id, n] of Object.entries(news)) await writeDoc(`news/${id}`, n, owner);

async function signUp(email) {
  const r = await call('POST', `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`, {
    body: { email, password: 'test-' + Math.random().toString(36).slice(2), returnSecureToken: true }
  });
  if (!r.ok) throw new Error('Test kullanıcısı açılamadı: ' + r.text);
  return { uid: r.json.localId, token: r.json.idToken, email };
}
const stamp = Date.now();
const A = await signUp(`yatirimci-a-${stamp}@test.local`);
const B = await signUp(`yatirimci-b-${stamp}@test.local`);
const C = await signUp(`personel-${stamp}@test.local`);
await writeDoc(`staff/${C.uid}`, { role: 'admin' }, owner);
await writeDoc('machines/KZN-A03', { facilityId: 'kazan', slot: 'A03', axes: 4, model: 'HMC-500', ownerUid: A.uid, status: 'active', liveStatus: 'running', commissionedAt: new Date(Date.now() - 30 * 864e5) }, owner);
const jobBase = { machineId: 'KZN-A03', ownerUid: A.uid, kind: 'job', title: 'Valf Bloğu', material: 'Al 7075', cycleMin: 12, qty: 40, setupMin: 45, source: 'own', customerName: 'Örnek Müşteri' };
await writeDoc('jobs/test-1', { ...jobBase, startsAt: new Date(Date.now() - 6 * 36e5), endsAt: new Date(Date.now() + 3 * 36e5) }, owner);
await writeDoc('jobs/test-2', { ...jobBase, source: 'platform', startsAt: new Date(Date.now() + 5 * 36e5), endsAt: new Date(Date.now() + 14 * 36e5) }, owner);

const anon = {};
const a = { token: A.token }, b = { token: B.token }, c = { token: C.token };
const validRequest = (u, extra = {}) => ({ uid: u.uid, email: u.email, facilityId: 'kazan', slot: 'A04', axes: 4, ownShare: 0.5, note: 'Görüşmek isterim.', status: 'new', createdAt: null, ...extra });

/* ---------- ziyaretçi ---------- */
await test('ziyaretçi tesisleri, makineleri, makine tiplerini, ayarları ve haberleri okur', async () => {
  for (const col of ['facilities', 'machines', 'machineTypes', 'config', 'news']) {
    const r = await listDocs(col, anon); allowed(r, col); assert(r.docs.length > 0, `${col} boş`);
  }
});
await test('ziyaretçi işleri, yatırımcıları, talepleri ve personeli okuyamaz', async () => {
  for (const col of ['jobs', 'investors', 'requests', 'staff']) denied(await listDocs(col, anon), col);
  denied(await getDoc('jobs/test-1', anon), 'tek iş');
});
await test('ziyaretçi hiçbir şey yazamaz', async () => {
  denied(await patchFields('machines/KZN-A01', { liveStatus: 'idle' }, anon), 'makine');
  denied(await patchFields('facilities/kazan', { name: 'x' }, anon), 'tesis');
  denied(await createWithServerTime('news/sahte', { title: 'x', publishedAt: null }, 'publishedAt', anon), 'haber');
  denied(await createWithServerTime('requests/anon', validRequest({ uid: 'yok', email: 'x@y.z' }), 'createdAt', anon), 'talep');
});

/* ---------- yatırımcı: işler ---------- */
await test('yatırımcı kendi makinesinin işlerini okur', async () => {
  const r = await queryEq('jobs', 'ownerUid', A.uid, a); allowed(r, 'sorgu'); assert(r.docs.length === 2, `iş sayısı ${r.docs.length}`);
  assert(r.docs.some(d => d.customerName === 'Örnek Müşteri'), 'müşteri adı gelmeli');
});
await test('yatırımcı başkasının işlerini okuyamaz', async () => {
  denied(await queryEq('jobs', 'ownerUid', A.uid, b), 'başkasının sorgusu');
  denied(await getDoc('jobs/test-1', b), 'tek iş');
  denied(await listDocs('jobs', a), 'filtresiz liste');
  const own = await queryEq('jobs', 'ownerUid', B.uid, b); allowed(own, 'kendi sorgusu'); assert(own.docs.length === 0, 'B için iş olmamalı');
});
await test('yatırımcı iş, makine, tesis, haber ve ayar yazamaz', async () => {
  denied(await patchFields('jobs/test-1', { customerName: 'x' }, a), 'iş');
  denied(await patchFields('machines/KZN-A01', { ownerUid: A.uid }, a), 'makineyi üstüne alma');
  denied(await patchFields('machines/KZN-A03', { liveStatus: 'idle' }, a), 'kendi makinesi');
  denied(await patchFields('config/pricing', { depositRate: 0 }, a), 'ayar');
  denied(await patchFields('machineTypes/4', { price: 1 }, a), 'fiyat');
  denied(await patchFields('news/ilk-subemiz-acildi', { title: 'x' }, a), 'haber');
});

/* ---------- yatırımcı kaydı ---------- */
await test('yatırımcı kendi kaydını açar, başkası adına açamaz', async () => {
  allowed(await createWithServerTime(`investors/${A.uid}`, { displayName: 'Ayşe Test', code: 'INV-1234', createdAt: null }, 'createdAt', a), 'kendi kaydı');
  denied(await createWithServerTime(`investors/${B.uid}`, { displayName: 'Sahte', code: 'INV-1235', createdAt: null }, 'createdAt', a), 'başkası adına');
  denied(await createWithServerTime(`investors/${B.uid}`, { displayName: 'Bora', code: 'YANLIS', createdAt: null }, 'createdAt', b), 'hatalı kod');
  denied(await createWithServerTime(`investors/${B.uid}`, { displayName: 'Bora', code: 'INV-2222', staff: true, createdAt: null }, 'createdAt', b), 'fazladan alan');
  denied(await createWithServerTime(`investors/${B.uid}`, { displayName: '', code: 'INV-2222', createdAt: null }, 'createdAt', b), 'boş ad');
});
await test('yatırımcı yalnızca adını ve telefonunu günceller; kaydı yalnızca kendisi okur', async () => {
  allowed(await patchFields(`investors/${A.uid}`, { displayName: 'Ayşe T.' }, a), 'ad');
  denied(await patchFields(`investors/${A.uid}`, { code: 'INV-9999' }, a), 'kod');
  allowed(await getDoc(`investors/${A.uid}`, a), 'kendi kaydı');
  denied(await getDoc(`investors/${A.uid}`, b), 'başkasının kaydı');
  denied(await deleteDoc(`investors/${A.uid}`, a), 'silme');
});

/* ---------- yatırım talepleri ---------- */
await test('yatırımcı geçerli bir talep oluşturur ve yalnızca kendi taleplerini görür', async () => {
  allowed(await createWithServerTime('requests/a-1', validRequest(A), 'createdAt', a), 'talep');
  const mine = await queryEq('requests', 'uid', A.uid, a); allowed(mine, 'kendi talepleri'); assert(mine.docs.length === 1, `talep sayısı ${mine.docs.length}`);
  denied(await getDoc('requests/a-1', b), 'başkasının talebi');
  denied(await queryEq('requests', 'uid', A.uid, b), 'başkasının sorgusu');
});
await test('geçersiz talepler reddedilir', async () => {
  denied(await createWithServerTime('requests/x1', validRequest(A, { uid: B.uid }), 'createdAt', a), 'başkası adına');
  denied(await createWithServerTime('requests/x2', validRequest(A, { status: 'approved' }), 'createdAt', a), 'onaylı durum');
  denied(await createWithServerTime('requests/x3', validRequest(A, { axes: 6 }), 'createdAt', a), '6 eksen');
  denied(await createWithServerTime('requests/x4', validRequest(A, { facilityId: 'yok' }), 'createdAt', a), 'olmayan tesis');
  denied(await createWithServerTime('requests/x5', validRequest(A, { email: 'baska@test.local' }), 'createdAt', a), 'başka e-posta');
  denied(await createWithServerTime('requests/x6', validRequest(A, { note: 'x'.repeat(1001) }), 'createdAt', a), 'uzun not');
  denied(await createWithServerTime('requests/x7', validRequest(A, { ownShare: 2 }), 'createdAt', a), 'geçersiz oran');
  denied(await createWithServerTime('requests/x8', validRequest(A, { approvedBy: 'x' }), 'createdAt', a), 'fazladan alan');
  denied(await writeDoc('requests/x9', validRequest(A, { createdAt: new Date(0) }), { token: A.token, overwrite: true }).then(() => ({ status: 200 }), e => ({ status: /403/.test(e.message) ? 403 : 500 })), 'sahte tarih');
});
await test('yatırımcı talebinin durumunu değiştiremez, yalnızca incelenmemiş talebini silebilir', async () => {
  denied(await patchFields('requests/a-1', { status: 'approved' }, a), 'durum');
  allowed(await createWithServerTime('requests/a-2', validRequest(A, { slot: 'A05' }), 'createdAt', a), 'ikinci talep');
  allowed(await deleteDoc('requests/a-2', a), 'kendi yeni talebini silme');
  denied(await deleteDoc('requests/a-1', b), 'başkasının talebini silme');
});

/* ---------- personel ---------- */
await test('kimse kendini personel yapamaz', async () => {
  denied(await createWithServerTime(`staff/${A.uid}`, { role: 'admin', createdAt: null }, 'createdAt', a), 'kendini ekleme');
  denied(await patchFields(`staff/${C.uid}`, { role: 'x' }, c), 'personelin kendi kaydı');
  allowed(await getDoc(`staff/${C.uid}`, c), 'personel kendi kaydını okur');
  denied(await getDoc(`staff/${C.uid}`, a), 'başkası okuyamaz');
});
await test('personel tüm işleri ve talepleri okur, makine durumunu ve talepleri yönetir', async () => {
  const jobs = await listDocs('jobs', c); allowed(jobs, 'işler'); assert(jobs.docs.length === 2, `iş ${jobs.docs.length}`);
  const reqs = await listDocs('requests', c); allowed(reqs, 'talepler'); assert(reqs.docs.length >= 1, 'talep yok');
  allowed(await patchFields('machines/KZN-A01', { liveStatus: 'maintenance' }, c), 'makine durumu');
  allowed(await patchFields('requests/a-1', { status: 'approved' }, c), 'talep onayı');
  allowed(await writeDoc('jobs/test-3', { ...jobBase, startsAt: new Date(Date.now() + 20 * 36e5), endsAt: new Date(Date.now() + 26 * 36e5) }, { token: C.token, overwrite: true }).then(() => ({ ok: true }), e => ({ ok: false, status: 0, text: e.message })), 'iş ekleme');
  allowed(await writeDoc('news/test-haber', { title: 'Test', publishedAt: new Date() }, { token: C.token, overwrite: true }).then(() => ({ ok: true }), e => ({ ok: false, status: 0, text: e.message })), 'haber ekleme');
});
await test('onaylanmış talebi yatırımcı silemez', async () => {
  denied(await deleteDoc('requests/a-1', a), 'onaylı talebi silme');
});

console.log(out.join('\n'));
console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
