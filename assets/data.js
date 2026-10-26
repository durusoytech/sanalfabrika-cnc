/* SanalFabrika · veri modeli, iş takvimi simülasyonu ve gelir hesabı.
   Tüm veriler demo amaçlıdır. Makine takvimleri, sayfa açıldığı ana göre
   tohumlanmış (deterministik) bir rastgele üreteçle oluşturulur. */
(function () {
  'use strict';

  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const NOW0 = Date.now();

  /* ---------- yardımcılar ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const rr = (rnd, a, b) => a + rnd() * (b - a);
  const ri = (rnd, a, b) => Math.floor(rr(rnd, a, b + 1));
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

  /* ---------- gelir modeli ---------- */
  // Kendi bulduğunuz işte platform yalnızca işletme ücreti + küçük bir hizmet bedeli alır.
  // Platformun bulduğu işte komisyon daha yüksektir, dolayısıyla size kalan marj düşer.
  const FEES = { own: 0.05, platform: 0.20 };
  const SOURCE_LABEL = { own: 'Kendi işim', platform: 'Platform işi' };

  const COST_KEYS = ['operator', 'electricity', 'maintenance', 'tooling', 'facility', 'insurance'];
  const COST_LABELS = {
    operator: 'Operatör', electricity: 'Elektrik', maintenance: 'Bakım & servis',
    tooling: 'Takım & sarf', facility: 'Tesis & kira', insurance: 'Sigorta & yönetim'
  };
  const COST_HINTS = {
    operator: 'Vardiya operatörü ve hazırlıkçı payı',
    electricity: 'Makine, kompresör ve aydınlatma tüketimi',
    maintenance: 'Periyodik bakım ve servis sözleşmesi',
    tooling: 'Kesici takımlar, soğutma sıvısı, sarf malzeme',
    facility: 'Alan kirası, vinç ve ortak alanlar',
    insurance: 'Makine sigortası, kalite ve yönetim'
  };

  const TYPES = {
    3: {
      axes: 3, code: 'VMC-850', family: 'Dikey işleme merkezi', price: 105000, installFee: 4500, rate: 0.75,
      cost: { operator: 0.14, electricity: 0.05, maintenance: 0.04, tooling: 0.05, facility: 0.03, insurance: 0.02 },
      powerKw: 9,
      specs: [
        ['Eksen yolları X/Y/Z', '850 × 510 × 560 mm'], ['İş mili', '12.000 dev/dk · BT40 · 18,5 kW'],
        ['Tabla', '1.000 × 500 mm · 600 kg'], ['Takım magazini', '24 takım'],
        ['Hızlı hareket', '36 m/dk'], ['Konumlama hassasiyeti', '±0,005 mm']
      ],
      uses: ['Kalıp ve plaka işleri', 'Flanş, kapak, braket', 'Fikstür ve aparatlar'],
      blurb: 'Seri plaka ve prizmatik parçalar için ekonomik başlangıç.'
    },
    4: {
      axes: 4, code: 'HMC-500', family: 'Yatay işleme merkezi · B ekseni', price: 210000, installFee: 6500, rate: 1.00,
      cost: { operator: 0.17, electricity: 0.07, maintenance: 0.05, tooling: 0.07, facility: 0.04, insurance: 0.02 },
      powerKw: 14,
      specs: [
        ['Eksen yolları X/Y/Z', '730 × 730 × 800 mm'], ['4. eksen', 'B döner tabla · 0,001° indeks'],
        ['İş mili', '15.000 dev/dk · BT40 · 22 kW'], ['Palet', '2 × 500 × 500 mm'],
        ['Takım magazini', '60 takım'], ['Konumlama hassasiyeti', '±0,004 mm']
      ],
      uses: ['Gövde ve blok parçalar', 'Valf blokları, pompa gövdeleri', 'Otomotiv seri üretim'],
      blurb: 'Çift paletle duruşsuz seri üretim, tek bağlamada 4 yüzey.'
    },
    5: {
      axes: 5, code: 'UMC-650', family: '5 eksen simultane · Trunnion', price: 360000, installFee: 9500, rate: 1.50,
      cost: { operator: 0.22, electricity: 0.10, maintenance: 0.08, tooling: 0.10, facility: 0.05, insurance: 0.03 },
      powerKw: 18,
      specs: [
        ['Eksen yolları X/Y/Z', '650 × 520 × 475 mm'], ['A / C eksenleri', '−120°…+30° · 360° sürekli'],
        ['İş mili', '20.000 dev/dk · HSK-A63 · 25 kW'], ['Tabla', 'Ø500 mm · 300 kg'],
        ['Takım magazini', '40 takım'], ['Konumlama hassasiyeti', '±0,003 mm']
      ],
      uses: ['Medikal implantlar', 'Havacılık ve türbin parçaları', 'Karmaşık serbest yüzeyler'],
      blurb: 'Tek bağlamada karmaşık geometri, en yüksek dakika ücreti.'
    }
  };
  Object.values(TYPES).forEach(t => {
    t.opRate = Math.round(COST_KEYS.reduce((a, k) => a + t.cost[k], 0) * 1000) / 1000;
  });

  /* ---------- parça kataloğu ---------- */
  const PARTS = {
    3: [
      { name: 'Montaj Braketi', mat: 'Al 6082', cyc: [4, 8], qty: [120, 300] },
      { name: 'Bağlantı Flanşı DN80', mat: 'S355 çelik', cyc: [7, 12], qty: [60, 160] },
      { name: 'Elektronik Kutu Kapağı', mat: 'Al 5083', cyc: [5, 9], qty: [90, 220] },
      { name: 'Kalıp Göbeği', mat: '1.2738 takım çeliği', cyc: [22, 38], qty: [10, 36] },
      { name: 'Fikstür Plakası', mat: 'Al 6061', cyc: [26, 44], qty: [8, 24] }
    ],
    4: [
      { name: 'Hidrolik Valf Bloğu', mat: 'Al 7075', cyc: [14, 26], qty: [30, 100] },
      { name: 'Şanzıman Kapağı', mat: 'AlSi9Cu3 döküm', cyc: [9, 16], qty: [60, 180] },
      { name: 'Pompa Gövdesi', mat: 'GGG40 döküm', cyc: [18, 32], qty: [24, 80] },
      { name: 'Motor Bağlantı Braketi', mat: 'Al 6082', cyc: [7, 12], qty: [90, 220] },
      { name: 'Eksantrik Mil Yatağı', mat: 'C45 çelik', cyc: [11, 20], qty: [40, 130] }
    ],
    5: [
      { name: 'Spinal Füzyon Kafesi', mat: 'Ti6Al4V', cyc: [16, 26], qty: [30, 90] },
      { name: 'Kalça Protezi Femoral Stem', mat: 'Ti6Al4V', cyc: [28, 45], qty: [16, 50] },
      { name: 'Diz İmplantı Tibial Plato', mat: 'CoCrMo', cyc: [30, 50], qty: [12, 40] },
      { name: 'Türbin Kanadı', mat: 'Inconel 718', cyc: [45, 80], qty: [8, 22] },
      { name: 'Pervane Göbeği', mat: 'Al 7075-T6', cyc: [35, 60], qty: [10, 28] },
      { name: 'Havacılık Montaj Braketi', mat: 'Al 7075-T6', cyc: [18, 30], qty: [24, 70] }
    ]
  };

  const OWN_CUSTOMERS = ['Kartal Hidrolik', 'Arda Medikal', 'Nova Havacılık', 'Selin Kalıp', 'Pusula Otomotiv', 'Mavi Enerji Sistemleri', 'Ufuk Makina'];
  const PLATFORM_CUSTOMERS = ['Atlas Otomotiv', 'Doruk Medikal', 'Kule Makina', 'Sarp Havacılık', 'Ege Pompa', 'Lider Hidrolik', 'Orion Savunma'];
  const MAINT_TITLES = ['Periyodik bakım', 'İş mili titreşim kontrolü', 'Lazer kalibrasyonu', 'Soğutma sıvısı değişimi', 'Eksen yağlama ve kontrol'];

  /* ---------- tedarik ve kurulum adımları ---------- */
  const PROC_STEPS = [
    { key: 'order', label: 'Sipariş & ön ödeme', days: 2, desc: 'Sözleşme imzalanır, %30 ön ödeme alınır ve slot sizin adınıza rezerve edilir.' },
    { key: 'supply', label: 'Üretim & tedarik', days: 90, desc: 'Makine üreticide üretilir, fabrika kabul testi (FAT) yapılır. Ortalama 3 ay sürer.' },
    { key: 'ship', label: 'Sevkiyat & teslimat', days: 7, desc: 'Nakliye, sigorta ve gümrük işlemleri tamamlanır, makine tesise indirilir.' },
    { key: 'install', label: 'Kurulum', days: 5, desc: 'Temel, enerji ve basınçlı hava bağlantıları yapılır, makine terazilenir.' },
    { key: 'calib', label: 'Kalibrasyon & deneme üretimi', days: 3, desc: 'Lazer ve ballbar ölçümü yapılır, ilk parça onayı alınır.' },
    { key: 'live', label: 'Üretime hazır', days: 0, desc: 'Makine takvime açılır ve iş almaya başlar.' }
  ];
  let PROC_TOTAL_DAYS = PROC_STEPS.reduce((a, s) => a + s.days, 0);

  /* ---------- tesisler ---------- */
  const FACTORIES = [
    {
      id: 'gbz', code: 'GBZ', name: 'Gebze OSB Tesisi', short: 'Gebze', city: 'Gebze, Kocaeli',
      lead: 'Havacılık ve medikal ağırlıklı 4 ve 5 eksen tesis', area: 2400, powerKva: 630,
      operatorsPerShift: 4, status: 'active', since: 'Mart 2024'
    },
    {
      id: 'brs', code: 'BRS', name: 'Bursa NOSAB Tesisi', short: 'Bursa', city: 'Nilüfer, Bursa',
      lead: 'Otomotiv yan sanayi odaklı karma tesis', area: 1800, powerKva: 500,
      operatorsPerShift: 3, status: 'active', since: 'Ocak 2025'
    },
    {
      id: 'izm', code: 'IZM', name: 'İzmir Kemalpaşa Tesisi', short: 'İzmir', city: 'Kemalpaşa, İzmir',
      lead: 'Kurulum aşamasında, ön sipariş açık', area: 2600, powerKva: 800,
      operatorsPerShift: 0, status: 'building', openAt: NOW0 + 38 * DAY, since: null
    }
  ];
  const FACTORY_BY_ID = Object.fromEntries(FACTORIES.map(f => [f.id, f]));
  const SLOTS = ['A01', 'A02', 'A03', 'A04', 'A05', 'B01', 'B02', 'B03', 'B04', 'B05'];

  const ME = { id: 'me', name: 'Deniz Aksoy', initials: 'DA', code: 'INV-1000', signedIn: true };

  // f: tesis, slot, axes, owner, durum (şu anki), commission: kaç gün önce devreye alındı
  const MACHINE_DEFS = [
    { f: 'gbz', slot: 'A01', axes: 5, owner: 'INV-2041', state: 'running' },
    { f: 'gbz', slot: 'A02', axes: 4, owner: 'INV-1187', state: 'running' },
    { f: 'gbz', slot: 'A03', axes: 5, owner: 'me', state: 'running', commission: -428, ownShare: 0.62, busy: 0.56, anchorPart: 'Spinal Füzyon Kafesi', anchorSource: 'own' },
    { f: 'gbz', slot: 'A04', axes: 4, owner: 'INV-3310', state: 'maint' },
    { f: 'gbz', slot: 'A05', axes: 4, owner: 'INV-2041', state: 'running' },
    { f: 'gbz', slot: 'B01', axes: 5, owner: 'INV-0954', state: 'setup' },
    { f: 'gbz', slot: 'B02', axes: 4, owner: 'INV-1187', state: 'running' },
    { f: 'gbz', slot: 'B03', axes: 4, owner: 'me', state: 'running', commission: -342, ownShare: 0.34, busy: 0.5, anchorPart: 'Hidrolik Valf Bloğu', anchorSource: 'platform' },
    { f: 'gbz', slot: 'B04', axes: 5, owner: 'INV-4402', state: 'idle' },
    { f: 'gbz', slot: 'B05', axes: 4, owner: 'INV-3310', state: 'running' },

    { f: 'brs', slot: 'A01', axes: 3, owner: 'INV-5120', state: 'running' },
    { f: 'brs', slot: 'A02', axes: 4, owner: 'me', state: 'setup', commission: -256, ownShare: 0.5, busy: 0.46, anchorPart: 'Pompa Gövdesi', anchorSource: 'own' },
    { f: 'brs', slot: 'A03', axes: 3, owner: 'INV-5120', state: 'idle' },
    { f: 'brs', slot: 'A04', axes: 5, owner: 'INV-2214', state: 'running' },
    { f: 'brs', slot: 'B01', axes: 4, owner: 'INV-0954', state: 'running' },
    { f: 'brs', slot: 'B02', axes: 3, owner: 'me', state: 'running', commission: -158, ownShare: 0.24, busy: 0.42, anchorPart: 'Montaj Braketi', anchorSource: 'platform' },
    { f: 'brs', slot: 'B04', axes: 5, owner: 'INV-6630', state: 'running' },

    // İzmir: tesis kurulumda, makineler tedarik aşamasında (proc = siparişin kaç gün önce verildiği)
    { f: 'izm', slot: 'A01', axes: 5, owner: 'INV-2041', proc: -41 },
    { f: 'izm', slot: 'A02', axes: 5, owner: 'me', proc: -70, ownShare: 0.5 },
    { f: 'izm', slot: 'B01', axes: 4, owner: 'INV-7781', proc: -24 },
    { f: 'izm', slot: 'B02', axes: 3, owner: 'INV-5120', proc: -12 }
  ];

  /* ---------- takvim üretimi ---------- */
  function genJobSpec(m, rnd, partName, forcedSource) {
    const list = PARTS[m.axes];
    const p = (partName && list.find(x => x.name === partName)) || pick(rnd, list);
    const cycle = Math.max(3, Math.round(rr(rnd, p.cyc[0], p.cyc[1])));
    let qty = ri(rnd, p.qty[0], p.qty[1]);
    const setup = 5 * ri(rnd, 6, 18);
    const maxDur = 32 * 60;
    if (setup + qty * cycle > maxDur) qty = Math.max(4, Math.floor((maxDur - setup) / cycle));
    if (qty > 30) qty = Math.floor(qty / 5) * 5;
    const source = forcedSource || (rnd() < m.ownShare ? 'own' : 'platform');
    const customer = source === 'own' ? pick(rnd, OWN_CUSTOMERS) : pick(rnd, PLATFORM_CUSTOMERS);
    const order = (source === 'own' ? 'SİP-' : 'PLT-') + (24000 + Math.floor(rnd() * 9000));
    return { kind: 'job', part: p.name, mat: p.mat, cycle, qty, setup, source, customer, order, durMin: setup + qty * cycle };
  }

  function genGap(m, rnd, t) {
    let g = rnd() < m.busy ? rr(rnd, 15, 90) : rr(rnd, 5 * 60, 20 * 60);
    if (t - m.commission < 50 * DAY) g *= 2.4;               // devreye alma dönemi: daha seyrek iş
    if (t > NOW0 + 6 * DAY) g *= 1 + Math.min(2.6, (t - NOW0 - 6 * DAY) / (7 * DAY)); // ileri tarihler daha az rezerve
    return g * MIN;
  }

  function buildSchedule(m) {
    const rnd = mulberry32(hashStr(m.id + ':takvim-v4'));
    const from = Math.max(m.commission, NOW0 - (m.mine ? 520 : 75) * DAY);
    const to = NOW0 + 36 * DAY;
    const jobs = [];
    let seq = 0;
    const add = (spec, start) => { jobs.push(Object.assign({ id: `${m.id}-${++seq}`, start, end: start + spec.durMin * MIN }, spec)); };
    const addMaint = (start, durMs) => {
      jobs.push({ id: `${m.id}-${++seq}`, kind: 'maint', title: pick(rnd, MAINT_TITLES), start, end: start + durMs, durMin: durMs / MIN });
    };

    let anchorStart, anchorEnd;
    const st = m.state0;
    if (st === 'running' || st === 'setup') {
      const j = genJobSpec(m, rnd, m.anchorPart, m.anchorSource);
      const start = st === 'setup'
        ? NOW0 - j.setup * MIN * rr(rnd, 0.25, 0.65)
        : NOW0 - (j.setup + j.qty * j.cycle * rr(rnd, 0.24, 0.72)) * MIN;
      add(j, start);
      anchorStart = start; anchorEnd = start + j.durMin * MIN;
    } else if (st === 'maint') {
      const dur = rr(rnd, 3, 5) * HOUR;
      const start = NOW0 - dur * rr(rnd, 0.3, 0.6);
      addMaint(start, dur);
      anchorStart = start; anchorEnd = start + dur;
    } else {
      anchorStart = NOW0 - rr(rnd, 0.8, 2.4) * HOUR;
      anchorEnd = NOW0 + rr(rnd, 0.8, 2.2) * HOUR;
    }

    // geriye doğru
    let t = anchorStart, lastMaint = anchorStart, maintEvery = rr(rnd, 6, 12) * DAY;
    for (let guard = 0; guard < 4000; guard++) {
      const end = t - genGap(m, rnd, t);
      if (lastMaint - end > maintEvery) {
        const dur = rr(rnd, 3, 5) * HOUR;
        if (end - dur < from) break;
        addMaint(end - dur, dur);
        t = end - dur; lastMaint = t; maintEvery = rr(rnd, 12, 17) * DAY;
        continue;
      }
      const j = genJobSpec(m, rnd);
      const start = end - j.durMin * MIN;
      if (start < from) break;
      add(j, start); t = start;
    }
    // ileriye doğru
    t = anchorEnd; lastMaint = anchorEnd; maintEvery = rr(rnd, 5, 11) * DAY;
    for (let guard = 0; guard < 4000 && t < to; guard++) {
      const start = t + genGap(m, rnd, t);
      if (start - lastMaint > maintEvery) {
        const dur = rr(rnd, 3, 5) * HOUR;
        addMaint(start, dur);
        t = start + dur; lastMaint = t; maintEvery = rr(rnd, 12, 17) * DAY;
        continue;
      }
      const j = genJobSpec(m, rnd);
      add(j, start); t = start + j.durMin * MIN;
    }
    jobs.sort((a, b) => a.start - b.start);
    return jobs;
  }

  function makeMachine(d) {
    const f = FACTORY_BY_ID[d.f];
    const rnd = mulberry32(hashStr(d.f + d.slot + ':tanım'));
    const isProc = d.proc != null;
    const m = {
      id: `${f.code}-${d.slot}`, factory: d.f, slot: d.slot, axes: d.axes, owner: d.owner,
      mine: d.owner === 'me',
      ownShare: d.ownShare != null ? d.ownShare : 0.25 + rnd() * 0.45,
      busy: d.busy != null ? d.busy : 0.42 + rnd() * 0.2,
      state0: d.state || 'running',
      anchorPart: d.anchorPart || null,
      anchorSource: d.anchorSource || null,
      commission: NOW0 + (d.commission != null ? d.commission : -(220 + Math.floor(rnd() * 480))) * DAY,
      proc: isProc,
      orderDate: isProc ? (d.orderDate || NOW0 + d.proc * DAY) : null,
      isNew: !!d.isNew
    };
    m.type = TYPES[m.axes];
    m.model = m.type.code;
    m.invest = m.type.price + m.type.installFee;
    if (!isProc) m.orderDate = m.commission - PROC_TOTAL_DAYS * DAY;
    m.jobs = isProc ? [] : buildSchedule(m);
    return m;
  }

  const MACHINES = MACHINE_DEFS.map(makeMachine);

  /* ---------- sorgular ---------- */
  const machine = id => MACHINES.find(m => m.id === id);
  const factory = id => FACTORY_BY_ID[id];
  const machinesIn = fid => MACHINES.filter(m => m.factory === fid);
  const machineAt = (fid, slot) => MACHINES.find(m => m.factory === fid && m.slot === slot);
  const myMachines = () => MACHINES.filter(m => m.mine);

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
  const prevJob = (m, t) => { for (let i = m.jobs.length - 1; i >= 0; i--) { const j = m.jobs[i]; if (j.end <= t && j.kind === 'job') return j; } return null; };

  function statusAt(m, t) {
    if (m.proc) return 'proc';
    const j = jobAt(m, t);
    if (!j) return 'idle';
    if (j.kind === 'maint') return 'maint';
    if (t < j.start + j.setup * MIN) return 'setup';
    return 'running';
  }
  const STATUS_LABEL = { running: 'Çalışıyor', setup: 'Ayar yapılıyor', idle: 'Boşta', maint: 'Bakımda', proc: 'Tedarikte' };

  function partsDone(j, t) {
    if (!j || j.kind !== 'job') return 0;
    const s = j.start + j.setup * MIN;
    if (t <= s) return 0;
    return Math.min(j.qty, Math.floor((t - s) / (j.cycle * MIN) + 1e-9));
  }

  function emptyStats() {
    const cost = {}; COST_KEYS.forEach(k => { cost[k] = 0; });
    return { minutes: 0, windowMin: 0, maintMin: 0, parts: 0, gross: 0, op: 0, fee: 0, net: 0, cost,
      own: { minutes: 0, gross: 0, fee: 0, net: 0, parts: 0 }, platform: { minutes: 0, gross: 0, fee: 0, net: 0, parts: 0 }, util: 0 };
  }
  // [a, b) aralığında makinenin gelir/gider özeti
  function windowStats(m, a, b) {
    const s = emptyStats();
    if (b <= a || m.proc) return s;
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
      const aa = Math.max(a, m.commission);
      if (m.proc || b <= aa) return;
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
  function procInfo(m, t) {
    let acc = 0;
    const steps = PROC_STEPS.map(s => {
      const o = Object.assign({}, s, { start: m.orderDate + acc * DAY, end: m.orderDate + (acc + s.days) * DAY });
      acc += s.days; return o;
    });
    let idx = steps.findIndex(s => t < s.end);
    if (idx === -1) idx = steps.length - 1;
    const cur = steps[idx];
    const elapsed = (t - m.orderDate) / DAY;
    return {
      steps, idx, cur,
      stepProg: cur.days ? clamp((t - cur.start) / (cur.end - cur.start)) : 1,
      overall: clamp(elapsed / PROC_TOTAL_DAYS),
      readyAt: m.orderDate + PROC_TOTAL_DAYS * DAY,
      daysLeft: Math.max(0, Math.ceil(PROC_TOTAL_DAYS - elapsed))
    };
  }
  function procPlan(startT) {
    let acc = 0;
    return PROC_STEPS.map(s => { const o = Object.assign({}, s, { start: startT + acc * DAY, end: startT + (acc + s.days) * DAY }); acc += s.days; return o; });
  }

  /* ---------- projeksiyon ---------- */
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
    const cost = {}; COST_KEYS.forEach(k => { cost[k] = minutes * T.cost[k]; });
    return { minutes, gross, op, fee, net, cost, invest, paybackMonths: net > 0 ? invest / net : Infinity };
  }

  /* ---------- tesis canlı göstergeleri ---------- */
  function machinePowerKw(m, t) {
    const st = statusAt(m, t);
    const p = m.type.powerKw;
    if (st === 'running') return p * (0.62 + 0.18 * Math.sin(t / 9000 + hashStr(m.id) % 7));
    if (st === 'setup') return p * 0.22;
    if (st === 'idle') return p * 0.1;
    if (st === 'maint') return p * 0.04;
    return 0;
  }
  function factoryLive(fid, t) {
    const f = FACTORY_BY_ID[fid];
    const ms = machinesIn(fid);
    const counts = { running: 0, setup: 0, idle: 0, maint: 0, proc: 0 };
    let power = f.status === 'active' ? 16 : 3, partsToday = 0;
    const d0 = startOfDay(t);
    ms.forEach(m => {
      counts[statusAt(m, t)]++;
      power += machinePowerKw(m, t);
      if (!m.proc) partsToday += windowStats(m, d0, t).parts;
    });
    const week = ms.filter(m => !m.proc);
    const u7 = week.length ? week.reduce((a, m) => a + windowStats(m, Math.max(t - 7 * DAY, m.commission), t).util, 0) / week.length : 0;
    return { filled: ms.length, counts, power, partsToday, util7: u7, empty: SLOTS.length - ms.length };
  }
  function factoryEvents(fid, t, limit = 7) {
    const ev = [];
    machinesIn(fid).forEach(m => {
      m.jobs.forEach(j => {
        if (j.start <= t && j.start > t - 14 * HOUR) ev.push({ t: j.start, m, j, type: j.kind === 'maint' ? 'maint' : 'start' });
        if (j.end <= t && j.end > t - 14 * HOUR) ev.push({ t: j.end, m, j, type: j.kind === 'maint' ? 'maintEnd' : 'end' });
      });
    });
    return ev.sort((a, b) => b.t - a.t).slice(0, limit);
  }
  function shiftAt(t) {
    const h = new Date(t).getHours();
    if (h >= 8 && h < 16) return { no: 1, label: '1. vardiya', range: '08:00–16:00' };
    if (h >= 16) return { no: 2, label: '2. vardiya', range: '16:00–24:00' };
    return { no: 3, label: '3. vardiya', range: '00:00–08:00' };
  }

  /* ---------- satın alma ---------- */
  function purchase(opts) {
    const exists = machineAt(opts.factory, opts.slot);
    if (exists) return exists;
    const m = makeMachine({ f: opts.factory, slot: opts.slot, axes: opts.axes, owner: 'me', proc: 0, orderDate: Date.now(), ownShare: opts.ownShare, isNew: true });
    m.plan = { util: opts.util, ownShare: opts.ownShare };
    MACHINES.push(m);
    return m;
  }

  /* ---------- canlı veri (Supabase) ile doldurma ----------
     backend.js veritabanından okuduğu satırları buraya verir. Diziler ve nesneler yerinde
     güncellenir; böylece uygulamanın geri kalanı demo ve canlı modda aynı kodu kullanır. */
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toLocaleUpperCase('tr-TR')).join('') || '?';
  function mapJob(r) {
    const start = Date.parse(r.starts_at), end = Date.parse(r.ends_at);
    return {
      id: 'j' + r.id, kind: r.kind, title: r.title, part: r.kind === 'job' ? r.title : null, mat: r.material || '',
      cycle: r.cycle_min == null ? null : Number(r.cycle_min), qty: r.qty, setup: r.setup_min || 0,
      source: r.source, customer: r.customer_name || null, order: r.order_no || '',
      start, end, durMin: (end - start) / MIN
    };
  }
  function hydrate(d) {
    Object.keys(TYPES).forEach(k => { delete TYPES[k]; });
    d.types.forEach(r => {
      const cost = {
        operator: +r.cost_operator, electricity: +r.cost_electricity, maintenance: +r.cost_maintenance,
        tooling: +r.cost_tooling, facility: +r.cost_facility, insurance: +r.cost_insurance
      };
      TYPES[r.axes] = {
        axes: r.axes, code: r.code, family: r.family, price: +r.price, installFee: +r.install_fee, rate: +r.rate_per_min,
        cost, opRate: +r.op_rate, powerKw: +r.power_kw, specs: r.specs || [], uses: r.uses || [], blurb: r.blurb || ''
      };
    });
    d.fees.forEach(f => { FEES[f.source] = +f.rate; });
    PROC_STEPS.length = 0;
    d.steps.forEach(s => PROC_STEPS.push({ key: s.key, label: s.label, days: s.days, desc: s.description }));
    PROC_TOTAL_DAYS = PROC_STEPS.reduce((a, s) => a + s.days, 0);
    FACTORIES.length = 0;
    Object.keys(FACTORY_BY_ID).forEach(k => { delete FACTORY_BY_ID[k]; });
    d.factories.forEach(f => {
      const o = {
        id: f.id, code: f.code, name: f.name, short: f.short_name, city: f.city, lead: f.lead, area: f.area_m2,
        powerKva: f.power_kva, operatorsPerShift: f.operators_per_shift, status: f.status,
        openAt: f.open_at ? Date.parse(f.open_at) : null, since: f.since_label
      };
      FACTORIES.push(o); FACTORY_BY_ID[o.id] = o;
    });
    if (d.slots && d.slots.length) { SLOTS.length = 0; [...new Set(d.slots.map(s => s.code))].sort().forEach(c => SLOTS.push(c)); }
    const ownJobs = {}, pubJobs = {};
    (d.ownJobs || []).forEach(r => { (ownJobs[r.machine_id] = ownJobs[r.machine_id] || []).push(mapJob(r)); });
    (d.publicJobs || []).forEach(r => { (pubJobs[r.machine_id] = pubJobs[r.machine_id] || []).push(mapJob(r)); });
    MACHINES.length = 0;
    d.machines.forEach(r => {
      const T = TYPES[r.axes];
      const proc = r.status === 'procurement';
      const jobs = (r.is_mine && ownJobs[r.id]) ? ownJobs[r.id] : (pubJobs[r.id] || []);
      jobs.sort((a, b) => a.start - b.start);
      MACHINES.push({
        id: r.id, factory: r.factory_id, slot: r.slot_code, axes: r.axes, owner: r.owner_code, mine: !!r.is_mine,
        ownShare: +r.own_share_target, state0: null, commission: r.commissioned_at ? Date.parse(r.commissioned_at) : null,
        proc, orderDate: Date.parse(r.ordered_at), isNew: proc && !!r.is_mine && Date.now() - Date.parse(r.ordered_at) < 7 * DAY,
        type: T, model: T.code, invest: T.price + T.installFee, jobs, jobsFrom: r.is_mine ? -Infinity : d.publicFrom, jobsTo: r.is_mine ? Infinity : d.publicTo
      });
    });
    ME.name = d.investor ? d.investor.display_name : '';
    ME.code = d.investor ? d.investor.code : '';
    ME.initials = initials(ME.name);
    ME.signedIn = !!d.investor;
    SF.mode = 'live';
  }
  // Başka bir yatırımcının makinesi için yüklü aralığın dışındaki takvimi ekler
  function mergeJobs(machineId, rows, from, to) {
    const m = machine(machineId); if (!m) return;
    const have = new Set(m.jobs.map(j => j.id));
    rows.map(mapJob).forEach(j => { if (!have.has(j.id)) m.jobs.push(j); });
    m.jobs.sort((a, b) => a.start - b.start);
    m.jobsFrom = Math.min(m.jobsFrom, from); m.jobsTo = Math.max(m.jobsTo, to);
  }

  const SF = window.SF = {
    mode: 'demo', hydrate, mergeJobs,
    get PROC_TOTAL_DAYS() { return PROC_TOTAL_DAYS; },
    MIN, HOUR, DAY, NOW0, FEES, SOURCE_LABEL, COST_KEYS, COST_LABELS, COST_HINTS, TYPES, PARTS,
    PROC_STEPS, FACTORIES, SLOTS, ME, MACHINES, STATUS_LABEL,
    machine, factory, machinesIn, machineAt, myMachines, jobAt, nextJob, prevJob, statusAt, partsDone,
    windowStats, sumStats, emptyStats, addStats, procInfo, procPlan, perMinute, projectMonthly,
    factoryLive, factoryEvents, shiftAt, machinePowerKw, purchase,
    startOfDay, addDays, startOfMonth, addMonths, startOfWeek, clamp, hashStr, mulberry32
  };
})();
