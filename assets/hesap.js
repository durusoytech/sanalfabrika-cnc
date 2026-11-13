/* Emek Sermaye · hesaplama aracı
   Bir tesisi iki taraftan hesaplar.
   Yatırımcı: tezgâhı satın alır (fiyat + kurulum). İş geliri = saatlik iş ücreti × çalışma saati × dolu gün.
     Platform payını; dolu günlerde operatör, planlamacı, elektrik ve takım giderini;
     iş olsun olmasın her ay slot kirasını, sigortayı ve bakımı öder.
   Platform: tesisi hazırlar (tek seferlik yatırım), tesisin aylık giderlerini öder (bina kirası, güvenlik, tesis ekibi…).
     Geliri platform payı ve yatırımcıların ödediği slot kiralarıdır. Tezgâh almaz.
   Operatör ve planlamacı saatlik ücretle, yalnızca dolu günlerde vardiya süresi kadar ücret alır.
   Dolu gün = ayda çalışma günü × doluluk. Günlük tutarlar ortalama bir çalışma günü içindir (aylık ÷ çalışma günü).
   Girilen değerler yalnızca bu tarayıcıda saklanır, sunucuya gönderilmez. */
(function () {
  'use strict';
  const KEY = 'emek-hesap-v5';
  const n0 = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

  /* ---------- başlangıç değerleri ----------
     Tezgâh fiyatları sitedeki makine tiplerinden gelir; saatlik iş ücreti sitedeki dakika ücretinin 60 katıdır,
     sigorta fiyatın %1'idir. Ücretler, kira ve tesis giderleri örnektir. */
  const FALLBACK = { 3: { price: 105000, installFee: 4500, rate: 0.75 }, 4: { price: 210000, installFee: 6500, rate: 1 }, 5: { price: 360000, installFee: 9500, rate: 1.5 } };
  function defaults(types) {
    const row = (axes, count) => {
      const t = types && types[axes] && types[axes].rate ? types[axes] : FALLBACK[axes];
      return { name: axes + ' eksen', count, price: t.price, install: t.installFee, insYear: Math.round(t.price / 100 / 50) * 50, hourly: Math.round(t.rate * 60) };
    };
    return {
      slots: 8, slotRent: 1000,
      machines: [row(3, 3), row(4, 3), row(5, 2)],
      days: 26, shifts: 2, hours: 8, util: 65,
      perOperator: 2, operatorHour: 7.5, perPlanner: 8, plannerHour: 11,
      elec24: 36, tool24: 72, maintPct: 3,
      feeOwn: 5, feePlatform: 20, ownShare: 30,
      platformMonthly: [
        { name: 'Bina kirası', amount: 5000 }, { name: 'Güvenlik', amount: 1800 },
        { name: 'Tesis sorumlusu', amount: 3000 }, { name: 'Kalite kontrol', amount: 1800 },
        { name: 'Genel giderler', amount: 1500 }, { name: 'Yazılım lisansları', amount: 600 }
      ],
      oneTime: [
        { name: 'Tesis hazırlığı (zemin, elektrik)', amount: 60000 }, { name: 'Kompresör ve hava hattı', amount: 15000 },
        { name: 'Ölçüm ve kalite ekipmanı', amount: 35000 }, { name: 'Güvenlik sistemi (kamera, alarm)', amount: 8000 },
        { name: 'Ortak takım ve bağlama seti', amount: 25000 }
      ],
      period: 'year', view: '0'
    };
  }

  /* ---------- önceki sürümlerden taşıma ---------- */
  // v2: tezgâh ücreti, elektrik ve takım çalışılan gün için girilirdi (vardiya 8 saat sayılırdı); 24 saate çevrilir.
  function migrateV2(old) {
    const x = Object.assign({}, old);
    const planned = Math.min(24, Math.ceil(n0(old.shifts)) * 8) || 16, k = 24 / planned;
    const conv = v => Math.round(n0(v) * k * 100) / 100;
    x.hours = 8;
    x.machines = (old.machines || []).map(m => { const o = Object.assign({}, m); o.rate24 = conv(m.dayRate); delete o.dayRate; return o; });
    x.elec24 = conv(old.elecDay); x.tool24 = conv(old.toolDay);
    delete x.elecDay; delete x.toolDay;
    return x;
  }
  // v3: tezgâh satırında 24 saatlik ücret vardı; saatlik iş ücretine çevrilir.
  function migrateV3(old) {
    const x = Object.assign({}, old);
    x.machines = (old.machines || []).map(m => { const o = Object.assign({}, m); o.hourly = Math.round(n0(m.rate24) / 24 * 100) / 100; delete o.rate24; return o; });
    return x;
  }
  // v4: operatör ve planlamacı günlük ücretliydi; diğer ekip, kira ve diğer giderler yatırımcılara yansırdı.
  // Ücretler saatliğe çevrilir; bu giderler platformun aylık giderleri olur, yatırımcı aynı tutarı slot kirası olarak öder.
  function migrateV4(old) {
    const x = Object.assign({}, old), h = n0(old.hours) || 8, days = n0(old.days) || 26;
    const N = (old.machines || []).reduce((a, m) => a + Math.floor(n0(m.count)), 0);
    x.operatorHour = Math.round(n0(old.operatorDay) / h * 100) / 100;
    x.plannerHour = Math.round(n0(old.plannerDay) / h * 100) / 100;
    const staff = (old.staff || []).map(s => ({ name: s.name || 'Tesis ekibi', amount: Math.round(Math.floor(n0(s.count)) * n0(s.day) * days) }));
    x.platformMonthly = [{ name: 'Bina kirası', amount: n0(old.rent) }].concat(staff, (old.monthly || []).map(r => ({ name: r.name, amount: n0(r.amount) })));
    x.slotRent = N ? Math.round(sum(x.platformMonthly, r => r.amount) / N) : 0;
    ['operatorDay', 'plannerDay', 'staff', 'rent', 'monthly'].forEach(k => delete x[k]);
    return x;
  }

  /* ---------- hesap: tüm tutarlar aylık ---------- */
  function compute(x) {
    const slots = Math.floor(n0(x.slots));
    const days = n0(x.days), shifts = Math.ceil(n0(x.shifts));
    const planned = shifts * n0(x.hours), workHours = Math.min(24, planned);
    const shiftLen = shifts ? workHours / shifts : 0;          // bir vardiyanın süresi (günde en çok 24 saat)
    const ratio = workHours / 24;
    const util = Math.min(100, n0(x.util)) / 100;
    const busy = days * util;                                  // tezgâh başına ayda dolu gün
    const daily = v => (days ? v / days : 0);
    const ms = (x.machines || []).map(m => ({
      name: m.name, count: Math.floor(n0(m.count)), price: n0(m.price), install: n0(m.install), insYear: n0(m.insYear),
      hourly: n0(m.hourly), dayRate: n0(m.hourly) * workHours
    }));
    const N = sum(ms, m => m.count);

    // ekip: her operatör ve planlamacı dolu bir günde bir vardiya çalışır
    const perOp = n0(x.perOperator), perPl = n0(x.perPlanner);
    const opPerShift = perOp > 0 ? Math.ceil(N / perOp) : 0;
    const operators = opPerShift * shifts;
    const planners = perPl > 0 ? Math.ceil(N / perPl) : 0;
    const opHoursDay = operators * shiftLen, plHoursDay = planners * shiftLen;
    const opDayCost = opHoursDay * n0(x.operatorHour), plDayCost = plHoursDay * n0(x.plannerHour);
    const people = { operators, opPerShift, planners, opHoursDay, plHoursDay, opDayCost, plDayCost };

    // tezgâh başına dolu bir günün elektrik ve takım gideri
    const elecDay = n0(x.elec24) * ratio, toolDay = n0(x.tool24) * ratio;
    const maint = n0(x.maintPct) / 100, rentOne = n0(x.slotRent);

    // gelir ve platform payı
    const own = Math.min(100, n0(x.ownShare)) / 100;
    const fee = own * n0(x.feeOwn) / 100 + (1 - own) * n0(x.feePlatform) / 100;

    // bir tezgâhın sahibi için aylık döküm; ekip gideri tezgâhlara eşit bölünür
    const opOne = N ? opDayCost * busy / N : 0, plOne = N ? plDayCost * busy / N : 0;
    const types = ms.map(m => {
      const gross = m.dayRate * busy;
      const lines = {
        gross, pf: gross * fee, operator: opOne, planner: plOne, elec: busy * elecDay, tool: busy * toolDay,
        rent: rentOne, ins: m.insYear / 12, maint: m.price * maint / 12
      };
      const cost = lines.operator + lines.planner + lines.elec + lines.tool + lines.rent + lines.ins + lines.maint;
      const net = gross - lines.pf - cost, invest = m.price + m.install;
      return {
        name: m.name, count: m.count, hourly: m.hourly, dayRate: m.dayRate, price: m.price, install: m.install, invest,
        lines, cost, net, costDay: busy ? cost / busy : null, netDay: busy ? net / busy : null,
        yearly: invest ? net * 12 / invest : 0, paybackYears: net > 0 ? invest / (net * 12) : Infinity
      };
    });

    // tüm yatırımcılar
    const gross = sum(ms, m => m.count * m.dayRate) * busy, pf = gross * fee;
    const inv = {
      gross, pf, operator: opDayCost * busy, planner: plDayCost * busy,
      elec: N * busy * elecDay, tool: N * busy * toolDay, rent: N * rentOne,
      ins: sum(ms, m => m.count * m.insYear) / 12, maint: sum(ms, m => m.count * m.price) * maint / 12
    };
    const invCost = inv.operator + inv.planner + inv.elec + inv.tool + inv.rent + inv.ins + inv.maint;
    const investorNet = gross - pf - invCost;
    const machinesInvest = sum(types, t => t.invest * t.count);
    const all = {
      name: 'Tüm tezgâhlar', count: N, lines: inv, cost: invCost, net: investorNet, invest: machinesInvest,
      price: sum(ms, m => m.count * m.price), install: sum(ms, m => m.count * m.install),
      yearly: machinesInvest ? investorNet * 12 / machinesInvest : 0,
      paybackYears: investorNet > 0 ? machinesInvest / (investorNet * 12) : Infinity
    };

    // platform: tesis giderleri onundur, geliri platform payı ve slot kiralarıdır
    const platCosts = (x.platformMonthly || []).map(r => ({ name: r.name, amount: n0(r.amount) }));
    const platMonthly = sum(platCosts, r => r.amount);
    const rentIncome = inv.rent;
    const platformProfit = pf + rentIncome - platMonthly;
    const facility = sum(x.oneTime || [], r => n0(r.amount));

    // başabaş dolulukları: ciro, operatör, planlamacı, elektrik ve takım dolulukla doğru orantılıdır
    const fullGross = days * sum(ms, m => m.count * m.dayRate);
    const fullNet = fullGross * (1 - fee) - days * (N * (elecDay + toolDay) + opDayCost + plDayCost);
    const invFixed = inv.rent + inv.ins + inv.maint;
    const breakEven = N && fullNet > 0 ? invFixed / fullNet : Infinity;
    const platGap = platMonthly - rentIncome;
    const platBreakEven = platGap <= 0 ? 0 : fullGross * fee > 0 ? platGap / (fullGross * fee) : Infinity;

    return {
      slots, N, free: slots - N, days, shifts, hours: n0(x.hours), workHours, shiftLen, ratio, overHours: planned > 24,
      util, busy, fee, people, elecDay, toolDay, types, all, gross, pf, inv, invCost, investorNet,
      platCosts, platMonthly, rentIncome, platformProfit, facility, machinesInvest,
      platformPaybackMonths: platformProfit > 0 ? facility / platformProfit : Infinity,
      breakEven, platBreakEven,
      costBusyDay: N && busy ? invCost / (N * busy) : null,
      daily
    };
  }

  window.EmekHesapModel = { defaults, compute, migrateV2, migrateV3, migrateV4 };

  /* ---------- arayüz ---------- */
  const SF = window.SF, P = window.EmekPlatform;
  if (!SF || !P || typeof document === 'undefined') return;
  const { esc, usd, num } = P;
  const $ = (s, r = document) => r.querySelector(s);
  const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const pct0 = v => (v < 0 ? '−%' + num(-v * 100) : '%' + num(v * 100));
  const pct1 = v => '%' + nf1.format(v * 100);
  const money = v => (v <= -0.5 ? '−' + usd(-v) : usd(v));
  const sgn = v => (v >= 0.5 ? '+' + usd(v) : money(v));
  const years = v => nf1.format(v) + ' yıl';
  const months = v => (v < 1 ? '1 aydan kısa' : v > 36 ? nf1.format(v / 12) + ' yıl' : num(Math.round(v)) + ' ay');
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
  const PER = {
    day: { k: 'Günlük', head: 'Ortalama bir çalışma gününde', net: 'Günde eline geçen', pnet: 'Platformun günlük kârı', bar: 'gün' },
    month: { k: 'Aylık', head: 'Bir ayda', net: 'Ayda eline geçen', pnet: 'Platformun aylık kârı', bar: 'ay' },
    year: { k: 'Yıllık', head: 'Bir yılda', net: 'Yıl sonunda eline geçen', pnet: 'Platformun yıllık kârı', bar: 'yıl' }
  };

  let S = null;
  function load() {
    const d = defaults(SF.TYPES);
    try {
      const get = k => { const o = JSON.parse(localStorage.getItem(k) || 'null'); return o && typeof o === 'object' && Array.isArray(o.machines) ? o : null; };
      let saved = get(KEY);
      if (!saved && get('emek-hesap-v4')) saved = migrateV4(get('emek-hesap-v4'));
      if (!saved && get('emek-hesap-v3')) saved = migrateV4(migrateV3(get('emek-hesap-v3')));
      if (!saved && get('emek-hesap-v2')) saved = migrateV4(migrateV3(migrateV2(get('emek-hesap-v2'))));
      if (saved) {
        for (const k of ['machines', 'platformMonthly', 'oneTime']) if (!Array.isArray(saved[k])) delete saved[k];
        return Object.assign(d, saved);
      }
    } catch (e) { /* kayıt okunamadıysa örnek değerlerle başla */ }
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* gizli pencere: saklanamaz */ } }
  function setPath(path, value) {
    const ks = path.split('.'); let o = S;
    for (let i = 0; i < ks.length - 1; i++) { o = o[ks[i]]; if (o == null) return; }
    o[ks[ks.length - 1]] = value;
  }

  const val = v => (v === '' || v == null ? '' : esc(String(v)));
  const fld = (label, unit, path, v, step) => `<label class="field"><span>${esc(label)}${unit ? ` <em>${esc(unit)}</em>` : ''}</span>
    <input type="number" inputmode="decimal" min="0" step="${step || 'any'}" data-h="${path}" value="${val(v)}"></label>`;
  const mfld = (label, path, v, step) => `<label class="field"><span class="lbl">${esc(label)}</span><input type="number" inputmode="decimal" min="0" step="${step || 'any'}" data-h="${path}" value="${val(v)}"></label>`;
  const range = (label, path, v, id) => `<label class="field calc-range"><span>${esc(label)} <output id="${id}">%${num(n0(v))}</output></span>
    <input type="range" min="0" max="100" step="1" data-h="${path}" data-out="${id}" value="${n0(v)}"></label>`;
  const del = (list, i, what) => `<button type="button" class="icon-btn" data-hesap="del" data-list="${list}" data-i="${i}" aria-label="${esc(what)} satırını sil">${X}</button>`;
  const add = (list, text) => `<button type="button" class="text-link as-btn calc-add" data-hesap="add" data-list="${list}">+ ${esc(text)}</button>`;
  const rows = (list, label, amountLabel) => (S[list].length ? `<p class="calc-cols calc-cols-2" aria-hidden="true"><span>${esc(label)}</span><span>${esc(amountLabel)}</span></p>` : '') + S[list].map((r, i) => `<div class="calc-row">
      <label class="field"><span class="sr-only">${esc(label)} adı</span><input type="text" maxlength="60" data-h="${list}.${i}.name" value="${val(r.name)}" placeholder="${esc(label)}"></label>
      <label class="field"><span class="sr-only">${esc(amountLabel)}</span><input type="number" inputmode="decimal" min="0" step="any" data-h="${list}.${i}.amount" value="${val(r.amount)}"></label>
      ${del(list, i, r.name || label)}</div>`).join('');

  /* ---------- giriş alanları ---------- */
  function inputsHTML() {
    return `
      <section class="calc-sec"><h2>Tesis</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Slot sayısı', '', 'slots', S.slots, 1)}
          ${fld('Slot kirası', '$ / ay', 'slotRent', S.slotRent)}
        </div>
        <p class="calc-note">Slot kirası, tezgâh sahibinin tezgâh başına her ay platforma ödediği kiradır; iş olsun olmasın ödenir.</p>
        <p class="calc-hint" id="h-slots"></p>
      </section>

      <section class="calc-sec"><h2>Tezgâhlar</h2>
        <p class="calc-intro">Tezgâhları yatırımcılar satın alır.</p>
        ${S.machines.length ? '<p class="calc-m calc-mhead" aria-hidden="true"><span>Tip</span><span>Adet</span><span>Fiyat $</span><span>Kurulum $</span><span>Yıllık sigorta $</span><span></span></p>' : ''}
        ${S.machines.map((m, i) => `<div class="calc-m">
          <label class="field"><span class="lbl">Tip</span><input type="text" maxlength="40" data-h="machines.${i}.name" value="${val(m.name)}" placeholder="Tezgâh tipi"></label>
          ${mfld('Adet', `machines.${i}.count`, m.count, 1)}
          ${mfld('Fiyat $', `machines.${i}.price`, m.price)}
          ${mfld('Kurulum $', `machines.${i}.install`, m.install)}
          ${mfld('Yıllık sigorta $', `machines.${i}.insYear`, m.insYear)}
          ${del('machines', i, m.name || 'Tezgâh')}</div>`).join('')}
        ${add('machines', 'Tezgâh tipi ekle')}
        <p class="calc-note">Yıllık sigorta, tezgâh başına poliçe bedelidir. Tezgâhların kazandırdığı saatlik ücret, Gelir ve kâr oranı bölümünde girilir.</p>
      </section>

      <section class="calc-sec"><h2>Çalışma düzeni</h2>
        <div class="calc-grid">
          ${fld('Ayda çalışma günü', '', 'days', S.days)}
          ${fld('Günlük vardiya', '', 'shifts', S.shifts, 1)}
          ${fld('Vardiya süresi', 'saat', 'hours', S.hours)}
        </div>
        <p class="calc-hint" id="h-ops"></p>
      </section>

      <section class="calc-sec"><h2>Operatör ve planlama</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Operatör başına tezgâh', '', 'perOperator', S.perOperator)}
          ${fld('Operatörün saatlik ücreti', '$', 'operatorHour', S.operatorHour)}
          ${fld('Planlamacı başına tezgâh', '', 'perPlanner', S.perPlanner)}
          ${fld('Planlamacının saatlik ücreti', '$', 'plannerHour', S.plannerHour)}
        </div>
        <p class="calc-note">Saatlik ücret, işverene toplam maliyettir: maaş, SGK, yemek ve yol dahil. Operatör ve planlamacı yalnızca dolu günlerde, bir vardiya süresince ücret alır; doluluk sıfırsa ücret de sıfırdır. Bu ücreti tezgâh sahipleri öder.</p>
        <p class="calc-hint" id="h-team"></p>
      </section>

      <section class="calc-sec"><h2>Tezgâh giderleri</h2>
        <div class="calc-grid">
          ${fld('Elektrik', '$ / 24 saat', 'elec24', S.elec24)}
          ${fld('Takım ve sarf', '$ / 24 saat', 'tool24', S.tool24)}
          ${fld('Bakım', '% / yıl', 'maintPct', S.maintPct)}
        </div>
        <p class="calc-note">Bu giderleri tezgâh sahibi öder. Elektrik ile takım ve sarf bir tezgâhın 24 saat çalışması içindir ve çalışılan saate göre hesaplanır. Bakım, tezgâh fiyatının yıllık yüzdesidir.</p>
      </section>

      <section class="calc-sec"><h2>Gelir ve kâr oranı</h2>
        <h3>Saatlik iş ücreti</h3>
        <p class="calc-intro">İşin tezgâhın bir çalışma saati için bıraktığı tutar, yani müşterinin ödediği.</p>
        ${S.machines.map((m, i) => `<div class="calc-rate">
          <span id="hn-${i}">${esc(m.name || 'Tezgâh')}</span>
          <label class="field"><span class="sr-only">${esc(m.name || 'Tezgâh')} saatlik iş ücreti, dolar</span><input type="number" inputmode="decimal" min="0" step="any" data-h="machines.${i}.hourly" value="${val(m.hourly)}"></label>
          <small id="hr-${i}"></small></div>`).join('') || '<p class="calc-note">Önce bir tezgâh tipi ekleyin.</p>'}
        ${range('Doluluk', 'util', S.util, 'o-util')}
        <p class="calc-hint" id="h-util"></p>
        <h3>Platform payı</h3>
        <p class="calc-intro">Platformun iş gelirinden aldığı pay.</p>
        <div class="calc-grid calc-grid-2">
          ${fld('Yatırımcının getirdiği işte', '%', 'feeOwn', S.feeOwn)}
          ${fld('Platformun bulduğu işte', '%', 'feePlatform', S.feePlatform)}
        </div>
        ${range('Yatırımcının getirdiği işlerin payı', 'ownShare', S.ownShare, 'o-own')}
        <p class="calc-hint" id="h-fee"></p>
      </section>

      <section class="calc-sec"><h2>Platformun tesis giderleri</h2>
        <p class="calc-intro">Bu giderleri platform öder; tezgâh sahiplerine yansımaz.</p>
        <h3>Aylık giderler</h3>
        ${rows('platformMonthly', 'Gider', 'Aylık $')}
        ${add('platformMonthly', 'Gider ekle')}
        <h3>Tek seferlik yatırım</h3>
        ${rows('oneTime', 'Yatırım', 'Tutar $')}
        ${add('oneTime', 'Yatırım ekle')}
        <p class="calc-hint" id="h-plat"></p>
      </section>

      <p class="calc-note">Başlangıç değerleri örnektir, kendi rakamlarınızı girin. Girdikleriniz yalnızca bu tarayıcıda saklanır.
        <button type="button" class="text-link as-btn" data-hesap="reset">Örnek değerlere dön</button></p>`;
  }

  /* ---------- sağ panel: yatırımcının ve platformun hesabı ---------- */
  function pickView(r) {
    if (S.view === 'all') return { key: 'all', v: r.all };
    const i = +S.view;
    if (r.types[i] && r.types[i].count > 0) return { key: String(i), v: r.types[i] };
    const j = r.types.findIndex(t => t.count > 0);
    return j >= 0 ? { key: String(j), v: r.types[j] } : { key: 'all', v: r.all };
  }
  function outHTML(r) {
    const p = PER[S.period] ? S.period : 'year', L = PER[p];
    const f = v => (p === 'day' ? r.daily(v) : p === 'year' ? v * 12 : v);
    const { key, v } = pickView(r);
    const one = key !== 'all', l = v.lines;
    const line = (label, note, amount) => `<tr><th scope="row">${label}${note ? ` <small>${note}</small>` : ''}</th><td class="${amount <= -0.5 ? 'neg' : ''}">${sgn(amount)}</td></tr>`;
    const opts = r.types.map((t, i) => (t.count > 0 ? `<option value="${i}" ${key === String(i) ? 'selected' : ''}>${esc(t.name || 'Tezgâh')} · 1 tezgâh</option>` : '')).join('')
      + `<option value="all" ${key === 'all' ? 'selected' : ''}>Tüm tezgâhlar · ${num(r.N)}</option>`;
    const platNames = r.platCosts.filter(c => c.amount > 0).slice(0, 3).map(c => (c.name || '').toLocaleLowerCase('tr-TR')).filter(Boolean).join(', ');
    return `
      <div class="calc-period" role="group" aria-label="Dönem">
        ${['day', 'month', 'year'].map(k => `<button type="button" id="hs-p-${k}" data-hesap="period" data-p="${k}" aria-pressed="${k === p}">${PER[k].k}</button>`).join('')}
      </div>

      <section class="calc-stmt" aria-label="Yatırımcının hesabı">
        <div class="calc-stmt-head"><h2>Yatırımcı</h2>
          <label class="calc-view"><span class="sr-only">Hangi tezgâhın sahibi</span><select id="hs-view" data-h="view">${opts}</select></label></div>
        <dl class="calc-paid"><dt>Başta ödediği</dt><dd>${usd(v.invest)}</dd>
          <small>Tezgâh ${usd(v.price)} + kurulum ${usd(v.install)}</small></dl>
        <h3>${L.head}</h3>
        <table class="calc-lines"><tbody>
          ${line('İş geliri', one ? `${usd(v.hourly)} / saat · %${num(r.util * 100)} doluluk` : `%${num(r.util * 100)} doluluk`, f(l.gross))}
          ${line('Platform payı', pct1(r.fee), -f(l.pf))}
          ${line('Operatör', 'dolu günlerde', -f(l.operator))}
          ${line('Planlamacı', 'dolu günlerde', -f(l.planner))}
          ${line('Elektrik', 'dolu günlerde', -f(l.elec))}
          ${line('Takım ve sarf', 'dolu günlerde', -f(l.tool))}
          ${line('Slot kirası', 'iş olmasa da', -f(l.rent))}
          ${line('Sigorta', 'iş olmasa da', -f(l.ins))}
          ${line('Bakım', 'iş olmasa da', -f(l.maint))}
        </tbody></table>
        <div class="calc-net"><span>${L.net}</span><b class="${v.net < 0 ? 'neg' : ''}">${money(f(v.net))}</b></div>
        <p class="calc-sub">${v.net > 0 ? `Yıllık getiri ${pct0(v.yearly)} · başta ödediğini ${years(v.paybackYears)}da geri alır` : 'Bu dolulukla gelir giderleri karşılamıyor.'}</p>
      </section>

      <section class="calc-stmt" aria-label="Platformun hesabı">
        <div class="calc-stmt-head"><h2>Platform</h2><span class="calc-stmt-tag">${num(r.slots)} slotluk tesis</span></div>
        <dl class="calc-paid"><dt>Başta yatırdığı</dt><dd>${usd(r.facility)}</dd><small>Tesis hazırlığı ve ekipman; tezgâhlar yatırımcıların</small></dl>
        <h3>${L.head}</h3>
        <table class="calc-lines"><tbody>
          ${line('Platform payı', 'iş gelirinden', f(r.pf))}
          ${line('Slot kiraları', `${num(r.N)} tezgâh`, f(r.rentIncome))}
          ${line('Tesis giderleri', platNames ? platNames + (r.platCosts.length > 3 ? '…' : '') : '', -f(r.platMonthly))}
        </tbody></table>
        <div class="calc-net"><span>${L.pnet}</span><b class="${r.platformProfit < 0 ? 'neg' : ''}">${money(f(r.platformProfit))}</b></div>
        <p class="calc-sub">${!r.facility ? '' : isFinite(r.platformPaybackMonths) ? `Tesis yatırımını ${r.platformPaybackMonths < 1 ? 'bir aydan kısa sürede' : months(r.platformPaybackMonths) + ' içinde'} geri alır` : 'Bu kârla tesis yatırımı geri dönmez.'}</p>
      </section>

      <dl class="calc-facts">
        <div><dt>Yatırımcının başabaşı</dt><dd>${isFinite(r.breakEven) ? (r.breakEven > 1 ? '%100’ün üstü' : pct0(r.breakEven)) : 'Ulaşılamıyor'}</dd><small>Yatırımcının zarar etmediği en düşük doluluk</small></div>
        <div><dt>Platformun başabaşı</dt><dd>${isFinite(r.platBreakEven) ? (r.platBreakEven > 1 ? '%100’ün üstü' : pct0(r.platBreakEven)) : 'Ulaşılamıyor'}</dd><small>Platformun zarar etmediği en düşük doluluk</small></div>
      </dl>
      ${p === 'day' ? `<p class="calc-note">Günlük tutarlar ortalama bir çalışma günü içindir: aylık tutar ÷ ${nf1.format(r.days)} gün.</p>` : ''}`;
  }

  /* ---------- ayrıntı tabloları ---------- */
  function detailHTML(r) {
    const two = (label, m, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th><td>${money(m)}</td><td>${money(m * 12)}</td></tr>`;
    const head = '<thead><tr><th scope="col"><span class="sr-only">Kalem</span></th><th scope="col">Aylık</th><th scope="col">Yıllık</th></tr></thead>';
    const i = r.inv;
    const investors = `<h2>Yatırımcılar toplamı</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm calc-tbl">${head}<tbody>
        ${two('İş geliri', i.gross, 'strong')}
        ${two(`Platform payı <small>${pct1(r.fee)}</small>`, -i.pf)}
        ${two(`Operatör <small>${num(r.people.operators)} kişi · ${nf1.format(r.busy)} gün</small>`, -i.operator)}
        ${two(`Planlamacı <small>${num(r.people.planners)} kişi · ${nf1.format(r.busy)} gün</small>`, -i.planner)}
        ${two('Elektrik', -i.elec)}
        ${two('Takım ve sarf', -i.tool)}
        ${two(`Slot kirası <small>${num(r.N)} tezgâh</small>`, -i.rent)}
        ${two('Sigorta', -i.ins)}
        ${two('Bakım', -i.maint)}
        ${two('Yatırımcılara kalan', r.investorNet, 'total' + (r.investorNet < 0 ? ' neg' : ''))}
      </tbody></table></div>
      <p class="calc-note">Tezgâhlar için başta ödenen: ${usd(r.machinesInvest)}.</p>`;
    const platform = `<h2>Platform</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm calc-tbl">${head}<tbody>
        ${two('Platform payı', r.pf, 'strong')}
        ${two(`Slot kiraları <small>${num(r.N)} tezgâh</small>`, r.rentIncome, 'strong')}
        ${r.platCosts.map(c => two(esc(c.name || 'Gider'), -c.amount)).join('')}
        ${two('Platformun kârı', r.platformProfit, 'total' + (r.platformProfit < 0 ? ' neg' : ''))}
      </tbody></table></div>
      <p class="calc-note">Tesis için başta yatırılan: ${usd(r.facility)}${r.facility && isFinite(r.platformPaybackMonths) ? `, geri dönüşü ${months(r.platformPaybackMonths)}` : ''}.</p>`;
    const row = (label, v) => `<tr><th scope="row">${label}</th><td>${v}</td></tr>`;
    const ops = `<h2>Operasyon</h2>
      <table class="tbl tbl-sm calc-tbl"><tbody>
        ${row('Operatör', `${num(r.people.operators)} kişi${r.people.operators ? ` <small>vardiya başına ${num(r.people.opPerShift)}</small>` : ''}`)}
        ${row('Planlamacı', `${num(r.people.planners)} kişi`)}
        ${row('Dolu bir günde operatör', `${nf1.format(r.people.opHoursDay)} saat <small>${usd(r.people.opDayCost)}</small>`)}
        ${row('Dolu bir günde planlamacı', `${nf1.format(r.people.plHoursDay)} saat <small>${usd(r.people.plDayCost)}</small>`)}
        ${row('Ücretli gün', `${nf1.format(r.busy)} <small>/ ${nf1.format(r.days)} gün</small>`)}
        ${row('Tezgâhın günlük çalışması', `${nf1.format(r.workHours)} <small>/ 24 saat</small>`)}
        ${row('Boş slot', num(Math.max(0, r.free)))}
      </tbody></table>`;
    const list = r.types.filter(t => t.count > 0);
    const typesTbl = !list.length ? '' : `<h2 class="calc-h2">Tezgâh tipine göre</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm">
        <thead><tr><th scope="col">Tip</th><th scope="col">Saatlik ücret</th><th scope="col">Dolu günde gelir</th><th scope="col">Dolu günde gider</th><th scope="col">Yatırımcıya</th><th scope="col">Yıllık net</th><th scope="col">Başta ödenen</th><th scope="col">Geri dönüş</th></tr></thead>
        <tbody>${list.map(t => `<tr><th scope="row">${esc(t.name || 'Tezgâh')}<small>${num(t.count)} adet</small></th>
          <td>${usd(t.hourly)}</td><td>${usd(t.dayRate)}</td>
          <td>${t.costDay == null ? '—' : usd(t.costDay + t.dayRate * r.fee)}</td>
          <td class="strong ${t.netDay != null && t.netDay < 0 ? 'neg' : ''}">${t.netDay == null ? '—' : money(t.netDay)}</td>
          <td class="${t.net < 0 ? 'neg' : ''}">${money(t.net * 12)}</td><td>${usd(t.invest)}</td>
          <td>${isFinite(t.paybackYears) ? years(t.paybackYears) : 'Geri dönmez'}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="calc-note">Tutarlar bir tezgâh içindir. Dolu günde gider; platform payı, operatör, planlamacı, elektrik, takım ile kira, sigorta ve bakımın o güne düşen payıdır. Operatör ve planlamacı gideri tezgâhlara eşit bölünür.</p>`;
    return `<div class="two calc-two"><div>${investors}</div><div>${platform}</div></div>
      <div class="two calc-two calc-gap"><div>${ops}</div><div></div></div>
      ${typesTbl}`;
  }

  function paint(refocus) {
    const r = compute(S);
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('hesap-out', outHTML(r));
    set('hesap-types', detailHTML(r));
    set('h-slots', (r.slots <= 0 ? '' : r.N > r.slots ? `<span class="neg">${num(r.slots)} slota ${num(r.N)} tezgâh girildi.</span> ` : r.free > 0 ? `${num(r.slots)} slotun ${num(r.N)} tanesi dolu, ${num(r.free)} slot boş. ` : `${num(r.slots)} slotun tamamı dolu. `)
      + `Tezgâh sahipleri platforma ayda toplam ${usd(r.rentIncome)} kira öder.`);
    set('h-ops', `${r.overHours ? '<span class="neg">Vardiyalar günde 24 saati aşıyor, 24 saat alındı.</span> ' : ''}Tezgâh dolu bir günde ${nf1.format(r.workHours)} saat çalışır; elektrik ve takımın 24 saatlik tutarının ${pct0(r.ratio)} kadarı hesaba girer.`);
    set('h-team', `Gereken ekip: ${num(r.people.operators)} operatör${r.people.operators ? ` (vardiya başına ${num(r.people.opPerShift)})` : ''} ve ${num(r.people.planners)} planlamacı. Dolu bir günde ${nf1.format(r.people.opHoursDay)} operatör saati (${usd(r.people.opDayCost)}) ve ${nf1.format(r.people.plHoursDay)} planlamacı saati (${usd(r.people.plDayCost)}). Ayda ${nf1.format(r.busy)} dolu gün için ${usd(r.inv.operator + r.inv.planner)}.`);
    set('h-util', `Tezgâh başına ayda ${nf1.format(r.days)} çalışma gününün ${nf1.format(r.busy)} günü dolu. İş geliri, operatör, planlamacı, elektrik ve takım bu günler için yazılır.`);
    S.machines.forEach((m, i) => {
      const t = r.types[i];
      set('hn-' + i, `${esc(m.name || 'Tezgâh')} <em>${num(t ? t.count : 0)} adet</em>`);
      set('hr-' + i, t ? `$ / saat · dolu bir günde ${usd(t.dayRate)}` : '');
    });
    set('h-fee', `Ortalama platform payı ${pct1(r.fee)}.`);
    set('h-plat', `Platformun aylık tesis gideri ${usd(r.platMonthly)}, tek seferlik yatırımı ${usd(r.facility)}. Tezgâhları yatırımcılar alır: ${usd(r.machinesInvest)}.`);
    const p = PER[S.period] ? S.period : 'year', mul = p === 'day' ? (r.days ? 1 / r.days : 0) : p === 'year' ? 12 : 1;
    const v = pickView(r).v;
    set('hesap-bar', `<span>Yatırımcı / ${PER[p].bar} <b class="${v.net < 0 ? 'neg' : ''}">${money(v.net * mul)}</b></span><span>Platform / ${PER[p].bar} <b class="${r.platformProfit < 0 ? 'neg' : ''}">${money(r.platformProfit * mul)}</b></span><button type="button" class="as-btn" data-hesap="goto">Sonuç</button>`);
    if (refocus) { const el = document.getElementById(refocus); if (el) el.focus(); }
  }

  function view() {
    if (!S) S = load();
    setTimeout(() => paint(), 0);
    return `<section class="page-head"><h1>Hesaplama</h1>
        <p class="lead">Bir tesisi iki taraftan hesaplayın: tezgâhı alan yatırımcı ve tesisi kuran platform. Değerleri değiştirdikçe sonuç güncellenir.</p></section>
      <div class="calc" id="hesap">
        <div class="calc-in">${inputsHTML()}</div>
        <aside class="calc-out" id="hesap-out" aria-live="polite" aria-label="Sonuç"></aside>
      </div>
      <section class="block" id="hesap-types"></section>
      <div class="calc-bar" id="hesap-bar"></div>`;
  }

  document.addEventListener('input', e => {
    const t = e.target;
    if (!S || !t.dataset || !t.dataset.h || !t.closest('#hesap')) return;
    setPath(t.dataset.h, t.type === 'text' || t.tagName === 'SELECT' ? t.value : n0(t.value));
    if (t.dataset.out) { const o = document.getElementById(t.dataset.out); if (o) o.textContent = '%' + num(n0(t.value)); }
    save(); paint(t.closest('#hesap-out') ? t.id : null);
  });
  const BLANK = { machines: { name: '', count: 1, price: 0, install: 0, insYear: 0, hourly: 0 }, platformMonthly: { name: '', amount: 0 }, oneTime: { name: '', amount: 0 } };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-hesap]');
    if (!b || !S) return;
    const a = b.dataset.hesap, list = b.dataset.list;
    if (a === 'goto') { const out = $('#hesap-out'); if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (a === 'period') { S.period = b.dataset.p; save(); paint('hs-p-' + b.dataset.p); return; }
    let focus = null;
    if (a === 'add' && BLANK[list]) { S[list].push(Object.assign({}, BLANK[list])); focus = `[data-h="${list}.${S[list].length - 1}.name"]`; }
    else if (a === 'del' && S[list]) S[list].splice(+b.dataset.i, 1);
    else if (a === 'reset') { if (!window.confirm('Girdiğiniz değerler silinip örnek değerlere dönülsün mü?')) return; S = defaults(SF.TYPES); }
    else return;
    save();
    const y = window.scrollY;
    P.render();
    window.scrollTo({ top: y });
    if (focus) { const el = $(focus); if (el) el.focus(); }
  });

  window.EmekHesap = { view };
})();
