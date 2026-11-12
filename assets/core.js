/* Emek Sermaye · çekirdek
   Varsayılan ayarlar, bellekteki veri modeli ve gelir hesabı.
   Veri üretmez: tesisler, makineler, işler ve haberler Firestore'dan okunup buraya yüklenir.
   Buradaki makine tipleri, ücret oranları ve tedarik adımları yalnızca varsayılandır;
   Firestore'daki config ve machineTypes belgeleri okunduğunda onların değerleri geçerli olur. */
(function () {
  'use strict';

  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /* ---------- gelir modeli ---------- */
  // Kendi bulduğunuz işte platform yalnızca işletme ücreti ve küçük bir hizmet bedeli alır.
  // Platformun bulduğu işte pay daha yüksektir.
  const FEES = { own: 0.05, platform: 0.20 };
  const SOURCE_LABEL = { own: 'Kendi işim', platform: 'Platform işi' };

  const COST_KEYS = ['operator', 'electricity', 'maintenance', 'tooling', 'facility', 'insurance'];
  const COST_LABELS = {
    operator: 'Operatör', electricity: 'Elektrik', maintenance: 'Bakım & servis',
    tooling: 'Takım & sarf', facility: 'Tesis & kira', insurance: 'Sigorta & yönetim'
  };

  const opRateOf = cost => Math.round(COST_KEYS.reduce((a, k) => a + (+cost[k] || 0), 0) * 1000) / 1000;

  const TYPES = {
    3: {
      axes: 3, code: 'VMC-850', family: 'Dikey işleme merkezi', price: 105000, installFee: 4500, rate: 0.75,
      cost: { operator: 0.14, electricity: 0.05, maintenance: 0.04, tooling: 0.05, facility: 0.03, insurance: 0.02 },
      specs: [
        ['Eksen yolları X/Y/Z', '850 × 510 × 560 mm'], ['İş mili', '12.000 dev/dk · BT40 · 18,5 kW'],
        ['Tabla', '1.000 × 500 mm · 600 kg'], ['Takım magazini', '24 takım']
      ],
      uses: ['Kalıp ve plaka işleri', 'Flanş, kapak, braket', 'Fikstür ve aparatlar'],
      blurb: 'Seri plaka ve prizmatik parçalar için ekonomik başlangıç.'
    },
    4: {
      axes: 4, code: 'HMC-500', family: 'Yatay işleme merkezi', price: 210000, installFee: 6500, rate: 1.00,
      cost: { operator: 0.17, electricity: 0.07, maintenance: 0.05, tooling: 0.07, facility: 0.04, insurance: 0.02 },
      specs: [
        ['Eksen yolları X/Y/Z', '730 × 730 × 800 mm'], ['4. eksen', 'B döner tabla · 0,001° indeks'],
        ['İş mili', '15.000 dev/dk · BT40 · 22 kW'], ['Takım magazini', '60 takım']
      ],
      uses: ['Gövde ve blok parçalar', 'Valf blokları, pompa gövdeleri', 'Otomotiv seri üretim'],
      blurb: 'Tek bağlamada dört yüzey, seri üretime uygun.'
    },
    5: {
      axes: 5, code: 'UMC-650', family: '5 eksen simultane', price: 360000, installFee: 9500, rate: 1.50,
      cost: { operator: 0.22, electricity: 0.10, maintenance: 0.08, tooling: 0.10, facility: 0.05, insurance: 0.03 },
      specs: [
        ['Eksen yolları X/Y/Z', '650 × 520 × 475 mm'], ['A / C eksenleri', '−120°…+30° · 360° sürekli'],
        ['İş mili', '20.000 dev/dk · HSK-A63 · 25 kW'], ['Takım magazini', '40 takım']
      ],
      uses: ['Medikal implantlar', 'Havacılık ve türbin parçaları', 'Karmaşık serbest yüzeyler'],
      blurb: 'Tek bağlamada karmaşık geometri, en yüksek dakika ücreti.'
    }
  };
  Object.values(TYPES).forEach(t => { t.opRate = opRateOf(t.cost); });

  /* ---------- tedarik ve kurulum adımları ---------- */
  const PROC_STEPS = [
    { key: 'order', label: 'Sipariş & ön ödeme', days: 2, desc: 'Sözleşme imzalanır, %30 ön ödeme alınır ve slot sizin adınıza ayrılır.' },
    { key: 'supply', label: 'Üretim & tedarik', days: 90, desc: 'Makine üreticide üretilir ve fabrika kabul testinden geçer. Ortalama 3 ay sürer.' },
    { key: 'ship', label: 'Sevkiyat & teslimat', days: 7, desc: 'Nakliye, sigorta ve gümrük işlemleri tamamlanır, makine tesise indirilir.' },
    { key: 'install', label: 'Kurulum', days: 5, desc: 'Temel, enerji ve basınçlı hava bağlantıları yapılır, makine terazilenir.' },
    { key: 'calib', label: 'Kalibrasyon & deneme üretimi', days: 3, desc: 'Lazer ve ballbar ölçümü yapılır, ilk parça onayı alınır.' },
    { key: 'live', label: 'Üretime hazır', days: 0, desc: 'Makine takvime açılır ve iş almaya başlar.' }
  ];
  let PROC_TOTAL_DAYS = PROC_STEPS.reduce((a, s) => a + s.days, 0);
  let DEPOSIT_RATE = 0.30;

  /* ---------- bellekteki veri ---------- */
  const FACILITIES = [], MACHINES = [], NEWS = [], REQUESTS = [];
  const ME = { uid: null, name: '', code: '', email: '', initials: '', signedIn: false, staff: false };
  const STATUS_LABEL = { running: 'Çalışıyor', setup: 'Ayar yapılıyor', idle: 'Boşta', maintenance: 'Bakımda', proc: 'Tedarikte' };
  const REQUEST_STATUS = { new: 'İnceleniyor', contacted: 'Görüşülüyor', approved: 'Onaylandı', rejected: 'Kapatıldı' };

  /* ---------- Firestore belgesi ↔ iç model ---------- */
  function typeFromDoc(d) {
    const cost = {}; COST_KEYS.forEach(k => { cost[k] = +((d.cost || {})[k]) || 0; });
    return {
      axes: +d.axes, code: d.code || '', family: d.family || '', price: +d.price || 0, installFee: +d.installFee || 0,
      rate: +d.ratePerMin || 0, cost, opRate: opRateOf(cost),
      specs: (d.specs || []).map(s => [s.label, s.value]), uses: d.uses || [], blurb: d.blurb || ''
    };
  }
  function typeToDoc(T) {
    return {
      axes: T.axes, code: T.code, family: T.family, price: T.price, installFee: T.installFee, ratePerMin: T.rate,
      cost: Object.assign({}, T.cost), specs: T.specs.map(s => ({ label: s[0], value: s[1] })), uses: T.uses.slice(), blurb: T.blurb
    };
  }
  const initials = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toLocaleUpperCase('tr-TR')).join('') || '?';

  /* ---------- yükleme ---------- */
  function setConfig(c) {
    if (c.types && c.types.length) {
      Object.keys(TYPES).forEach(k => { delete TYPES[k]; });
      c.types.forEach(d => { const T = typeFromDoc(d); if (T.axes) TYPES[T.axes] = T; });
    }
    if (c.fees) { ['own', 'platform'].forEach(k => { if (c.fees[k] != null) FEES[k] = +c.fees[k]; }); }
    if (c.depositRate != null) DEPOSIT_RATE = +c.depositRate;
    if (c.steps && c.steps.length) {
      PROC_STEPS.length = 0;
      c.steps.forEach(s => PROC_STEPS.push({ key: s.key, label: s.label, days: +s.days || 0, desc: s.description || s.desc || '' }));
      PROC_TOTAL_DAYS = PROC_STEPS.reduce((a, s) => a + s.days, 0);
    }
  }
  function setFacilities(list) {
    FACILITIES.length = 0;
    list.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).forEach(f => FACILITIES.push({
      id: f.id, code: f.code || '', name: f.name || '', short: f.shortName || f.name || '', city: f.city || '',
      address: f.address || '', description: f.description || '', status: f.status || 'active',
      lat: +f.lat, lng: +f.lng, openedAt: f.openedAt || null, slots: (f.slots || []).slice(), photos: f.photos || []
    }));
  }
  function setMachines(list) {
    MACHINES.length = 0;
    list.forEach(d => {
      const T = TYPES[d.axes] || null;
      const proc = d.status === 'procurement';
      MACHINES.push({
        id: d.id, facility: d.facilityId, slot: d.slot, axes: +d.axes, model: d.model || (T ? T.code : ''),
        ownerUid: d.ownerUid || null, ownerLabel: d.ownerLabel || '', mine: !!ME.uid && d.ownerUid === ME.uid,
        proc, liveStatus: d.liveStatus || 'idle', liveNote: d.liveNote || '',
        orderDate: d.orderedAt || null, commission: d.commissionedAt || null,
        ownShare: d.ownShareTarget != null ? +d.ownShareTarget : 0.5,
        type: T, invest: (d.price != null ? +d.price : (T ? T.price : 0)) + (d.installFee != null ? +d.installFee : (T ? T.installFee : 0)),
        jobs: []
      });
    });
    MACHINES.sort((a, b) => (a.facility + a.slot).localeCompare(b.facility + b.slot));
  }
  function setJobs(list) {
    MACHINES.forEach(m => { m.jobs = []; });
    list.forEach(d => {
      const m = machine(d.machineId); if (!m) return;
      m.jobs.push({
        id: d.id, kind: d.kind === 'maint' ? 'maint' : 'job', title: d.title || '', part: d.kind === 'maint' ? null : (d.title || ''),
        mat: d.material || '', cycle: +d.cycleMin || 0, qty: +d.qty || 0, setup: +d.setupMin || 0,
        source: d.source === 'own' ? 'own' : 'platform', customer: d.customerName || '', order: d.orderNo || '',
        start: d.startsAt, end: d.endsAt, durMin: (d.endsAt - d.startsAt) / MIN
      });
    });
    MACHINES.forEach(m => m.jobs.sort((a, b) => a.start - b.start));
  }
  function setNews(list) {
    NEWS.length = 0;
    list.slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)).forEach(n => NEWS.push(n));
  }
  function setRequests(list) {
    REQUESTS.length = 0;
    list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(r => REQUESTS.push(r));
  }
  function setUser(u) {
    ME.uid = u ? u.uid : null;
    ME.email = u ? (u.email || '') : '';
    ME.name = u ? (u.displayName || '') : '';
    ME.code = u ? (u.code || '') : '';
    ME.staff = !!(u && u.staff);
    ME.initials = initials(ME.name || ME.email);
    ME.signedIn = !!u;
    MACHINES.forEach(m => { m.mine = !!ME.uid && m.ownerUid === ME.uid; });
  }

  /* ---------- sorgular ---------- */
  const machine = id => MACHINES.find(m => m.id === id);
  const facility = id => FACILITIES.find(f => f.id === id);
  const machinesIn = fid => MACHINES.filter(m => m.facility === fid);
  const machineAt = (fid, slot) => MACHINES.find(m => m.facility === fid && m.slot === slot);
  const myMachines = () => MACHINES.filter(m => m.mine);
  const statusOf = m => (m.proc ? 'proc' : (STATUS_LABEL[m.liveStatus] ? m.liveStatus : 'idle'));

  function jobAt(m, t) {
    const js = m.jobs;
    let lo = 0, hi = js.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (js[mid].end <= t) lo = mid + 1;
      else if (js[mid].start > t) hi = mid - 1;
      else return js[mid];
    }
    return null;
  }
  const nextJob = (m, t) => m.jobs.find(j => j.start > t && j.kind === 'job') || null;

  function partsDone(j, t) {
    if (!j || j.kind !== 'job' || !j.cycle) return 0;
    const s = j.start + j.setup * MIN;
    if (t <= s) return 0;
    return Math.min(j.qty, Math.floor((t - s) / (j.cycle * MIN) + 1e-9));
  }

  /* ---------- gelir hesabı ----------
     brüt = dakika × dakika ücreti; işletme = dakika × işletme ücreti;
     platform payı = brüt × kaynak oranı; net = brüt − işletme − platform payı. */
  function emptyStats() {
    const cost = {}; COST_KEYS.forEach(k => { cost[k] = 0; });
    return {
      minutes: 0, windowMin: 0, maintMin: 0, parts: 0, gross: 0, op: 0, fee: 0, net: 0, cost,
      own: { minutes: 0, gross: 0, fee: 0, net: 0, parts: 0 }, platform: { minutes: 0, gross: 0, fee: 0, net: 0, parts: 0 }, util: 0
    };
  }
  function windowStats(m, a, b) {
    const s = emptyStats();
    if (b <= a || m.proc || !m.type) return s;
    s.windowMin = (b - a) / MIN;
    const T = m.type;
    for (const j of m.jobs) {
      if (j.end <= a) continue;
      if (j.start >= b) break;
      const mins = (Math.min(j.end, b) - Math.max(j.start, a)) / MIN;
      if (j.kind === 'maint') { s.maintMin += mins; continue; }
      const g = mins * T.rate, op = mins * T.opRate, fee = g * FEES[j.source], net = g - op - fee;
      const parts = partsDone(j, Math.min(b, j.end)) - partsDone(j, Math.max(a, j.start));
      s.minutes += mins; s.gross += g; s.op += op; s.fee += fee; s.net += net; s.parts += parts;
      const src = s[j.source]; src.minutes += mins; src.gross += g; src.fee += fee; src.net += net; src.parts += parts;
      for (const k of COST_KEYS) s.cost[k] += mins * T.cost[k];
    }
    s.util = s.windowMin ? s.minutes / s.windowMin : 0;
    return s;
  }
  function addStats(acc, s) {
    acc.minutes += s.minutes; acc.windowMin += s.windowMin; acc.maintMin += s.maintMin; acc.parts += s.parts;
    acc.gross += s.gross; acc.op += s.op; acc.fee += s.fee; acc.net += s.net;
    COST_KEYS.forEach(k => { acc.cost[k] += s.cost[k]; });
    ['own', 'platform'].forEach(src => { for (const k in acc[src]) acc[src][k] += s[src][k]; });
    acc.util = acc.windowMin ? acc.minutes / acc.windowMin : 0;
    return acc;
  }
  function sumStats(machines, a, b) {
    const acc = emptyStats();
    machines.forEach(m => {
      if (m.proc || !m.commission) return;
      const aa = Math.max(a, m.commission);
      if (b <= aa) return;
      addStats(acc, windowStats(m, aa, b));
    });
    return acc;
  }

  /* ---------- tarih yardımcıları ---------- */
  const startOfDay = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const addDays = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()).getTime(); };
  const startOfMonth = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const addMonths = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };
  const startOfWeek = t => { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; return addDays(d.getTime(), -wd); };

  /* ---------- tedarik ilerlemesi ---------- */
  function procPlan(startT) {
    let acc = 0;
    return PROC_STEPS.map(s => { const o = Object.assign({}, s, { start: startT + acc * DAY, end: startT + (acc + s.days) * DAY }); acc += s.days; return o; });
  }
  function procInfo(m, t) {
    const steps = procPlan(m.orderDate);
    let idx = steps.findIndex(s => t < s.end);
    if (idx === -1) idx = steps.length - 1;
    const cur = steps[idx];
    const elapsed = (t - m.orderDate) / DAY;
    return {
      steps, idx, cur,
      stepProg: cur.days ? clamp((t - cur.start) / (cur.end - cur.start)) : 1,
      overall: PROC_TOTAL_DAYS ? clamp(elapsed / PROC_TOTAL_DAYS) : 1,
      readyAt: m.orderDate + PROC_TOTAL_DAYS * DAY,
      daysLeft: Math.max(0, Math.ceil(PROC_TOTAL_DAYS - elapsed))
    };
  }

  /* ---------- tahmin ---------- */
  function perMinute(axes, source) {
    const T = TYPES[axes]; const fee = T.rate * FEES[source];
    return { rate: T.rate, op: T.opRate, fee, net: T.rate - T.opRate - fee, cost: T.cost };
  }
  function projectMonthly(axes, util, ownShare) {
    const T = TYPES[axes];
    const minutes = 30 * 1440 * util;
    const gross = minutes * T.rate, op = minutes * T.opRate;
    const fee = gross * (ownShare * FEES.own + (1 - ownShare) * FEES.platform);
    const net = gross - op - fee;
    const invest = T.price + T.installFee;
    return { minutes, gross, op, fee, net, invest, paybackMonths: net > 0 ? invest / net : Infinity };
  }

  window.SF = {
    MIN, HOUR, DAY, FEES, SOURCE_LABEL, COST_KEYS, COST_LABELS, TYPES, PROC_STEPS,
    get PROC_TOTAL_DAYS() { return PROC_TOTAL_DAYS; },
    get DEPOSIT_RATE() { return DEPOSIT_RATE; },
    FACILITIES, MACHINES, NEWS, REQUESTS, ME, STATUS_LABEL, REQUEST_STATUS,
    typeFromDoc, typeToDoc, setConfig, setFacilities, setMachines, setJobs, setNews, setRequests, setUser,
    machine, facility, machinesIn, machineAt, myMachines, statusOf, jobAt, nextJob, partsDone,
    emptyStats, windowStats, addStats, sumStats, procPlan, procInfo, perMinute, projectMonthly,
    startOfDay, addDays, startOfMonth, addMonths, startOfWeek, clamp, initials
  };
})();
