/* Emek Sermaye · Firebase bağlantı katmanı (giriş + Firestore)
   Platform sayfası bu modülü kullanır. Veriyi okuyup çekirdeğe (window.SF) yükler,
   giriş, kayıt ve yatırım talebi işlemlerini yapar. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, sendPasswordResetEmail, connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where,
  serverTimestamp, Timestamp, connectFirestoreEmulator
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore-lite.js';

const SF = window.SF;
const cfg = window.EMEK_CONFIG;
const app = initializeApp(cfg.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const useEmulators = isLocal && cfg.emulators && !new URLSearchParams(location.search).has('canli');
if (useEmulators) {
  connectAuthEmulator(auth, cfg.emulators.auth, { disableWarnings: true });
  connectFirestoreEmulator(db, cfg.emulators.firestoreHost, cfg.emulators.firestorePort);
}

// Firestore zaman damgalarını milisaniyeye çevirir
const plainValue = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
const plain = snap => { const o = { id: snap.id }; const d = snap.data(); for (const k in d) o[k] = plainValue(d[k]); return o; };
const all = async q => (await getDocs(q)).docs.map(plain);
const one = async ref => { const s = await getDoc(ref); return s.exists() ? plain(s) : null; };

const MESSAGES = [
  [/auth\/(invalid-credential|wrong-password|user-not-found|invalid-login-credentials)/, 'E-posta veya şifre hatalı.'],
  [/auth\/email-already-in-use/, 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.'],
  [/auth\/weak-password/, 'Şifre en az 6 karakter olmalı.'],
  [/auth\/invalid-email/, 'Geçerli bir e-posta adresi girin.'],
  [/auth\/too-many-requests/, 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.'],
  [/auth\/network-request-failed|Failed to fetch|NetworkError|Load failed/, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'],
  [/permission-denied|Missing or insufficient permissions/, 'Bu işlem için yetkiniz yok.'],
  [/slot-taken/, 'Bu slot dolu. Başka bir slot seçin.']
];
function friendly(err) {
  const raw = (err && (err.code || '')) + ' ' + (err && err.message ? err.message : String(err));
  for (const [re, msg] of MESSAGES) if (re.test(raw)) return new Error(msg);
  return new Error('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
}
const wrap = fn => async (...args) => { try { return await fn(...args); } catch (e) { console.error('Emek Sermaye:', e); throw friendly(e); } };

function investorCode(uid) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < uid.length; i++) { h ^= uid.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'INV-' + (1000 + ((h >>> 0) % 9000));
}

let signingUp = false;

const B = {
  user: null,
  emulated: useEmulators,
  onChange: null,       // giriş durumu değişip veri yeniden yüklendiğinde çağrılır
  friendly,

  init: wrap(async () => {
    await auth.authStateReady();
    B.user = auth.currentUser;
    onAuthStateChanged(auth, async u => {
      if (signingUp) return;          // kayıt akışı yatırımcı kaydını kendisi oluşturup veriyi yükler
      const changed = (u && u.uid) !== (B.user && B.user.uid);
      B.user = u;
      if (!changed) return;
      try { await B.load(); } catch (e) { console.error('Emek Sermaye:', e); }
      if (B.onChange) B.onChange();
    });
    await B.load();
  }),

  // Herkese açık veriler ve giriş yapılmışsa kullanıcıya özel veriler
  load: wrap(async () => {
    const u = B.user;
    let investor = null, staff = null;
    if (u) {
      [investor, staff] = await Promise.all([one(doc(db, 'investors', u.uid)), one(doc(db, 'staff', u.uid))]);
      if (!investor) {
        const displayName = (u.displayName || (u.email || '').split('@')[0] || 'Yatırımcı').slice(0, 80);
        const data = { displayName, code: investorCode(u.uid), createdAt: serverTimestamp() };
        await setDoc(doc(db, 'investors', u.uid), data);
        investor = { displayName, code: data.code };
      }
    }
    SF.setUser(u ? { uid: u.uid, email: u.email, displayName: investor.displayName, code: investor.code, staff: !!staff } : null);

    const [types, pricing, procurement, facilities, machines] = await Promise.all([
      all(collection(db, 'machineTypes')),
      one(doc(db, 'config', 'pricing')),
      one(doc(db, 'config', 'procurement')),
      all(collection(db, 'facilities')),
      all(collection(db, 'machines'))
    ]);
    SF.setConfig({
      types, fees: pricing ? pricing.fees : null, depositRate: pricing ? pricing.depositRate : null,
      steps: procurement ? procurement.steps : null
    });
    SF.setFacilities(facilities);
    SF.setMachines(machines);

    if (u) {
      // Personel tüm işleri ve talepleri görür; yatırımcı yalnızca kendisininkileri
      const [jobs, requests] = await Promise.all([
        all(staff ? collection(db, 'jobs') : query(collection(db, 'jobs'), where('ownerUid', '==', u.uid))),
        all(staff ? collection(db, 'requests') : query(collection(db, 'requests'), where('uid', '==', u.uid)))
      ]);
      SF.setJobs(jobs);
      SF.setRequests(requests);
      if (staff) {
        const [news, investors] = await Promise.all([all(collection(db, 'news')), all(collection(db, 'investors'))]);
        SF.setNews(news);
        B.investors = Object.fromEntries(investors.map(i => [i.id, i]));
      }
    } else {
      SF.setJobs([]);
      SF.setRequests([]);
    }
  }),

  signIn: wrap(async (email, password) => { await signInWithEmailAndPassword(auth, email, password); }),

  signUp: wrap(async (email, password, fullName) => {
    signingUp = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const displayName = String(fullName || '').trim().slice(0, 80) || email.split('@')[0];
      await updateProfile(cred.user, { displayName });
      await setDoc(doc(db, 'investors', cred.user.uid), { displayName, code: investorCode(cred.user.uid), createdAt: serverTimestamp() });
      B.user = cred.user;
    } finally {
      signingUp = false;
    }
    await B.load();
    if (B.onChange) B.onChange();
  }),

  signOut: wrap(async () => { await signOut(auth); }),

  resetPassword: wrap(async email => { await sendPasswordResetEmail(auth, email); }),

  // Yatırım talebi: bir ön başvurudur, slotu kilitlemez ve ödeme almaz.
  createRequest: wrap(async ({ facilityId, slot, axes, ownShare, phone, note }) => {
    const u = B.user;
    if (!u) throw new Error('auth/required');
    const data = { uid: u.uid, email: u.email, displayName: SF.ME.name || '', facilityId, axes, ownShare, status: 'new', createdAt: serverTimestamp() };
    if (slot) data.slot = slot;
    if (phone) data.phone = String(phone).slice(0, 30);
    if (note) data.note = String(note).slice(0, 1000);
    await addDoc(collection(db, 'requests'), data);
    await B.load();
  }),

  cancelRequest: wrap(async id => {
    await deleteDoc(doc(db, 'requests', id));
    await B.load();
  })
};

/* ---------- personel işlemleri ----------
   Bu çağrılar yalnızca staff/{uid} belgesi olan kullanıcılar için Firestore kurallarından geçer. */
B.investors = {};
B.admin = {
  setRequestStatus: wrap(async (id, status) => {
    await updateDoc(doc(db, 'requests', id), { status });
    await B.load();
  }),

  // Onaylanan talep için tezgâhı tanımlar: slot yatırımcıya ayrılır ve tedarik süreci başlar.
  createMachine: wrap(async ({ requestId, uid, facilityId, slot, axes, ownShare }) => {
    const f = SF.facility(facilityId), T = SF.TYPES[axes];
    const id = `${f.code}-${slot}`;
    if ((await getDoc(doc(db, 'machines', id))).exists()) throw new Error('slot-taken');
    await setDoc(doc(db, 'machines', id), {
      facilityId, slot, axes, model: T.code, ownerUid: uid, status: 'procurement', liveStatus: 'idle',
      orderedAt: serverTimestamp(), ownShareTarget: ownShare, price: T.price, installFee: T.installFee
    });
    if (requestId) await updateDoc(doc(db, 'requests', requestId), { status: 'approved', machineId: id });
    await B.load();
    return id;
  }),

  setLiveStatus: wrap(async (id, liveStatus) => {
    await updateDoc(doc(db, 'machines', id), { liveStatus });
    await B.load();
  }),

  // Kurulumu biten tezgâhı üretime alır
  commission: wrap(async id => {
    await updateDoc(doc(db, 'machines', id), { status: 'active', liveStatus: 'idle', commissionedAt: serverTimestamp() });
    await B.load();
  }),

  addJob: wrap(async job => {
    const data = Object.assign({}, job, { startsAt: Timestamp.fromMillis(job.startsAt), endsAt: Timestamp.fromMillis(job.endsAt) });
    await addDoc(collection(db, 'jobs'), data);
    await B.load();
  }),
  deleteJob: wrap(async id => { await deleteDoc(doc(db, 'jobs', id)); await B.load(); }),

  addNews: wrap(async ({ title, body }) => {
    await addDoc(collection(db, 'news'), { title, summary: body[0] || '', body, publishedAt: serverTimestamp() });
    await B.load();
  }),
  deleteNews: wrap(async id => { await deleteDoc(doc(db, 'news', id)); await B.load(); })
};

window.Backend = B;
window.dispatchEvent(new Event('backend-ready'));
