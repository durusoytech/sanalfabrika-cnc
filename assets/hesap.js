/* Emek Sermaye · hesaplama aracı
   Bir tesisin gelirini, giderini, gereken ekibi ve kârını hesaplar.
   Girilen değerler yalnızca bu tarayıcıda saklanır, sunucuya gönderilmez. */
(function () {
  'use strict';
  const KEY = 'emek-hesap-v1';
  const n0 = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

  /* ---------- başlangıç değerleri ----------
     Tezgâh fiyatları ve dakika ücretleri sitedeki makine tiplerinden gelir.
     Ekip, kira ve kurulum rakamları örnektir; kullanıcı kendi rakamlarını girer. */
  const FALLBACK = { 3: { price: 105000, installFee: 4500, rate: 0.75, opRate: 0.33 }, 4: { price: 210000, installFee: 6500, rate: 1, opRate: 0.42 }, 5: { price: 360000, installFee: 9500, rate: 1.5, opRate: 0.58 } };
  function defaults(types) {
    const row = (axes, count) => { const t = (types && types[axes]) || FALLBACK[axes]; return { name: axes + ' eksen', count, price: t.price, install: t.installFee, rate: t.rate, opFee: t.opRate }; };
    return {
      slots: 8,
      machines: [row(3, 3), row(4, 3), row(5, 2)],
      days: 26, shifts: 2, hours: 8, util: 65,
      perOperator: 2, operatorCost: 1600, perPlanner: 8, plannerCost: 2400,
      staff: [{ name: 'Tesis sorumlusu', count: 1, cost: 3000 }, { name: 'Kalite kontrol', count: 1, cost: 1800 }],
      rent: 5000, elecHour: 1.5, toolHour: 3, maintPct: 3, insPct: 1,
      monthly: [{ name: 'Genel giderler', amount: 1500 }, { name: 'Yazılım lisansları', amount: 600 }],
      oneTime: [
        { name: 'Tesis hazırlığı (zemin, elektrik)', amount: 60000 }, { name: 'Kompresör ve hava hattı', amount: 15000 },
        { name: 'Ölçüm ve kalite ekipmanı', amount: 35000 }, { name: 'Takım ve bağlama seti', amount: 25000 }
      ],
      feeOwn: 5, feePlatform: 20, ownShare: 30
    };
  }

  /* ---------- hesap ---------- */
  function compute(x) {
    const slots = Math.floor(n0(x.slots));
    const util = Math.min(100, n0(x.util)) / 100;
    const shifts = Math.ceil(n0(x.shifts));
    const capHours = n0(x.days) * n0(x.shifts) * n0(x.hours);      // tezgâh başına aylık kapasite
    const runHours = capHours * util, minutes = runHours * 60, capMinutes = capHours * 60;
    const ms = (x.machines || []).map(m => ({ name: m.name, count: Math.floor(n0(m.count)), price: n0(m.price), install: n0(m.install), rate: n0(m.rate), opFee: n0(m.opFee) }));
    const N = sum(ms, m => m.count);
    const value = sum(ms, m => m.count * m.price);

    // ekip
    const perOp = n0(x.perOperator), perPl = n0(x.perPlanner);
    const opPerShift = perOp > 0 ? Math.ceil(N / perOp) : 0;
    const operators = opPerShift * shifts;
    const planners = perPl > 0 ? Math.ceil(N / perPl) : 0;
    const others = sum(x.staff || [], s => Math.floor(n0(s.count)));
    const people = { operators, opPerShift, planners, others, total: operators + planners + others };

    // aylık giderler
    const hourly = n0(x.elecHour) + n0(x.toolHour);
    const yearlyPct = (n0(x.maintPct) + n0(x.insPct)) / 100;
    const cost = {
      staff: operators * n0(x.operatorCost) + planners * n0(x.plannerCost) + sum(x.staff || [], s => Math.floor(n0(s.count)) * n0(s.cost)),
      rent: n0(x.rent),
      elec: N * runHours * n0(x.elecHour),
      tool: N * runHours * n0(x.toolHour),
      maint: value * n0(x.maintPct) / 100 / 12,
      ins: value * n0(x.insPct) / 100 / 12,
      other: sum(x.monthly || [], r => n0(r.amount))
    };
    cost.total = cost.staff + cost.rent + cost.elec + cost.tool + cost.maint + cost.ins + cost.other;
    const fixed = cost.total - cost.elec - cost.tool;                // doluluktan bağımsız giderler
    const shared = N ? (cost.staff + cost.rent + cost.other) / N : 0; // tezgâhlara eşit bölünen giderler

    // gelir ve paylaşım
    const own = Math.min(100, n0(x.ownShare)) / 100;
    const fee = own * n0(x.feeOwn) / 100 + (1 - own) * n0(x.feePlatform) / 100;   // ortalama platform payı
    const types = ms.map(m => {
      const gross = minutes * m.rate, op = minutes * m.opFee, pf = gross * fee, net = gross - op - pf;
      const invest = m.price + m.install;
      const costOne = shared + runHours * hourly + m.price * yearlyPct / 12;
      return {
        name: m.name, count: m.count, rate: m.rate, opFee: m.opFee, gross, op, pf, net, invest,
        costMin: minutes ? costOne / minutes : null,
        yearly: invest ? net * 12 / invest : 0,
        paybackYears: net > 0 ? invest / (net * 12) : Infinity
      };
    });
    const gross = sum(types, t => t.gross * t.count), op = sum(types, t => t.op * t.count), pf = sum(types, t => t.pf * t.count);
    const investorNet = gross - op - pf;
    const income = op + pf, profit = income - cost.total;
    const machinesInvest = sum(types, t => t.invest * t.count);
    const facility = sum(x.oneTime || [], r => n0(r.amount));

    // başabaş doluluk: gelir ve değişken gider dolulukla doğru orantılıdır
    const fullIncome = sum(ms, m => m.count * capMinutes * (m.opFee + m.rate * fee));
    const fullVar = N * capHours * hourly;
    const breakEven = fullIncome > fullVar ? fixed / (fullIncome - fullVar) : Infinity;

    return {
      slots, N, free: slots - N, util, capHours, runHours, minutes, people, cost, fixed, fee, types,
      gross, op, pf, investorNet, income, profit,
      margin: gross ? profit / gross : 0,
      investorOne: N ? investorNet / N : 0,
      investorYearly: machinesInvest ? investorNet * 12 / machinesInvest : 0,
      costMin: N && minutes ? cost.total / (N * minutes) : null,
      opFeeAvg: N && minutes ? op / (N * minutes) : null,
      breakEven, facility, machinesInvest,
      facilityPaybackMonths: profit > 0 ? facility / profit : Infinity,
      fixedPerSlot: slots ? fixed / slots : null
    };
  }

  window.EmekHesapModel = { defaults, compute };

  /* ---------- arayüz ---------- */
  const SF = window.SF, P = window.EmekPlatform;
  if (!SF || !P || typeof document === 'undefined') return;
  const { esc, usd, usd2, num } = P;
  const $ = (s, r = document) => r.querySelector(s);
  const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const pct0 = v => (v < 0 ? '−%' + num(-v * 100) : '%' + num(v * 100));
  const pct1 = v => '%' + nf1.format(v * 100);
  const money = v => (v < 0 ? '−' + usd(-v) : usd(v));
  const years = v => (isFinite(v) ? nf1.format(v) + ' yıl' : 'Geri dönmez');
  const months = v => (isFinite(v) ? (v < 1 ? '1 aydan kısa' : v > 36 ? nf1.format(v / 12) + ' yıl' : num(Math.round(v)) + ' ay') : 'Geri dönmez');
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

  let S = null;
  function load() {
    const d = defaults(SF.TYPES);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved === 'object' && Array.isArray(saved.machines)) {
        for (const k of ['machines', 'staff', 'monthly', 'oneTime']) if (!Array.isArray(saved[k])) delete saved[k];
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
  const range = (label, path, v, id) => `<label class="field calc-range"><span>${esc(label)} <output id="${id}">%${num(n0(v))}</output></span>
    <input type="range" min="0" max="100" step="1" data-h="${path}" data-out="${id}" value="${n0(v)}"></label>`;
  const del = (list, i, what) => `<button type="button" class="icon-btn" data-hesap="del" data-list="${list}" data-i="${i}" aria-label="${esc(what)} satırını sil">${X}</button>`;
  const add = (list, text) => `<button type="button" class="text-link as-btn calc-add" data-hesap="add" data-list="${list}">+ ${esc(text)}</button>`;
  const rows = (list, label, amountLabel) => (S[list].length ? `<p class="calc-cols calc-cols-2" aria-hidden="true"><span>${esc(label)}</span><span>${esc(amountLabel)}</span></p>` : '') + S[list].map((r, i) => `<div class="calc-row">
      <label class="field"><span class="sr-only">${esc(label)} adı</span><input type="text" maxlength="60" data-h="${list}.${i}.name" value="${val(r.name)}" placeholder="${esc(label)}"></label>
      <label class="field"><span class="sr-only">Tutar, dolar</span><input type="number" inputmode="decimal" min="0" step="any" data-h="${list}.${i}.amount" value="${val(r.amount)}"></label>
      ${del(list, i, r.name || label)}</div>`).join('');

  const mfld = (label, path, v, step) => `<label class="field"><span class="lbl">${esc(label)}</span><input type="number" inputmode="decimal" min="0" step="${step || 'any'}" data-h="${path}" value="${val(v)}"></label>`;

  function inputsHTML() {
    return `
      <section class="calc-sec"><h2>Tesis</h2>
        <div class="calc-grid calc-narrow">${fld('Slot sayısı', '', 'slots', S.slots, 1)}</div>
        <p class="calc-hint" id="h-slots"></p>
        <h3>Tezgâhlar</h3>
        ${S.machines.length ? '<p class="calc-m calc-mhead" aria-hidden="true"><span>Tip</span><span>Adet</span><span>Fiyat $</span><span>Kurulum $</span><span>Dakika ücreti</span><span>İşletme ücreti</span><span></span></p>' : ''}
        ${S.machines.map((m, i) => `<div class="calc-m">
          <label class="field"><span class="lbl">Tip</span><input type="text" maxlength="40" data-h="machines.${i}.name" value="${val(m.name)}" placeholder="Tezgâh tipi"></label>
          ${mfld('Adet', `machines.${i}.count`, m.count, 1)}
          ${mfld('Fiyat $', `machines.${i}.price`, m.price)}
          ${mfld('Kurulum $', `machines.${i}.install`, m.install)}
          ${mfld('Dakika ücreti $', `machines.${i}.rate`, m.rate)}
          ${mfld('İşletme ücreti $', `machines.${i}.opFee`, m.opFee)}
          ${del('machines', i, m.name || 'Tezgâh')}</div>`).join('')}
        ${add('machines', 'Tezgâh tipi ekle')}
        <p class="calc-note">Ücretler dakika başına dolardır. Dakika ücreti müşteriden alınır. İşletme ücreti, tezgâhın çalıştığı her dakika için yatırımcının kazancından düşülür.</p>
      </section>

      <section class="calc-sec"><h2>Çalışma düzeni</h2>
        <div class="calc-grid">
          ${fld('Ayda çalışma günü', '', 'days', S.days)}
          ${fld('Günlük vardiya', '', 'shifts', S.shifts, 1)}
          ${fld('Vardiya süresi', 'saat', 'hours', S.hours)}
        </div>
        ${range('Doluluk', 'util', S.util, 'o-util')}
        <p class="calc-hint" id="h-ops"></p>
      </section>

      <section class="calc-sec"><h2>Ekip</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Operatör başına tezgâh', '', 'perOperator', S.perOperator)}
          ${fld('Operatörün aylık maliyeti', '$', 'operatorCost', S.operatorCost)}
          ${fld('Planlamacı başına tezgâh', '', 'perPlanner', S.perPlanner)}
          ${fld('Planlamacının aylık maliyeti', '$', 'plannerCost', S.plannerCost)}
        </div>
        <p class="calc-hint" id="h-team"></p>
        <h3>Diğer ekip</h3>
        ${S.staff.length ? '<p class="calc-cols" aria-hidden="true"><span>Görev</span><span>Kişi</span><span>Kişi başı aylık $</span></p>' : ''}
        ${S.staff.map((r, i) => `<div class="calc-row calc-row-3">
          <label class="field"><span class="sr-only">Görev</span><input type="text" maxlength="60" data-h="staff.${i}.name" value="${val(r.name)}" placeholder="Görev"></label>
          <label class="field"><span class="sr-only">Kişi sayısı</span><input type="number" inputmode="numeric" min="0" step="1" data-h="staff.${i}.count" value="${val(r.count)}"></label>
          <label class="field"><span class="sr-only">Kişi başı aylık maliyet, dolar</span><input type="number" inputmode="decimal" min="0" step="any" data-h="staff.${i}.cost" value="${val(r.cost)}"></label>
          ${del('staff', i, r.name || 'Görev')}</div>`).join('')}
        ${add('staff', 'Görev ekle')}
      </section>

      <section class="calc-sec"><h2>Aylık giderler</h2>
        <div class="calc-grid">
          ${fld('Kira ve aidat', '$', 'rent', S.rent)}
          ${fld('Elektrik', '$ / saat', 'elecHour', S.elecHour)}
          ${fld('Takım ve sarf', '$ / saat', 'toolHour', S.toolHour)}
          ${fld('Bakım', '% / yıl', 'maintPct', S.maintPct)}
          ${fld('Sigorta', '% / yıl', 'insPct', S.insPct)}
        </div>
        <p class="calc-note">Elektrik ile takım ve sarf, tezgâhın çalıştığı saat başınadır. Bakım ve sigorta, tezgâh fiyatının yıllık yüzdesidir.</p>
        <h3>Diğer aylık giderler</h3>
        ${rows('monthly', 'Gider', 'Aylık $')}
        ${add('monthly', 'Gider ekle')}
      </section>

      <section class="calc-sec"><h2>Tek seferlik giderler</h2>
        ${rows('oneTime', 'Gider', 'Tutar $')}
        ${add('oneTime', 'Gider ekle')}
        <p class="calc-hint" id="h-once"></p>
      </section>

      <section class="calc-sec"><h2>Kâr oranı</h2>
        <p class="calc-intro">Platformun cirodan aldığı pay.</p>
        <div class="calc-grid calc-grid-2">
          ${fld('Yatırımcının getirdiği işte', '%', 'feeOwn', S.feeOwn)}
          ${fld('Platformun bulduğu işte', '%', 'feePlatform', S.feePlatform)}
        </div>
        ${range('Yatırımcının getirdiği işlerin payı', 'ownShare', S.ownShare, 'o-own')}
        <p class="calc-hint" id="h-fee"></p>
      </section>

      <p class="calc-note">Başlangıç değerleri örnektir, kendi rakamlarınızı girin. Girdikleriniz yalnızca bu tarayıcıda saklanır.
        <button type="button" class="text-link as-btn" data-hesap="reset">Örnek değerlere dön</button></p>`;
  }

  function outHTML(r) {
    const share = v => (r.gross ? v / r.gross : 0);
    const warn = r.N > r.slots && r.slots > 0 ? `<p class="calc-warn" role="status">Tezgâh sayısı slot sayısını ${num(r.N - r.slots)} aşıyor.</p>` : '';
    return `${warn}
      <dl class="calc-top">
        <div><dt>Şirketin aylık kârı</dt><dd class="${r.profit < 0 ? 'neg' : ''}">${money(r.profit)}</dd><small>${r.profit < 0 ? 'Gelir giderleri karşılamıyor' : r.gross ? 'Cironun ' + pct0(r.margin) : ''}</small></div>
        <div><dt>Yatırımcının aylık neti</dt><dd class="${r.investorOne < 0 ? 'neg' : ''}">${money(r.investorOne)}</dd><small>Tezgâh başına ortalama · yıllık ${pct0(r.investorYearly)}</small></div>
      </dl>
      <figure class="calc-split">
        <figcaption><span>Aylık ciro</span><b>${usd(r.gross)}</b></figcaption>
        <div class="split-bar" aria-hidden="true">
          <span class="sb-net" style="flex-grow:${Math.max(0, r.investorNet)}"></span><span class="sb-op" style="flex-grow:${r.op}"></span><span class="sb-fee" style="flex-grow:${r.pf}"></span>
        </div>
        <ul>
          <li><i class="sb-net"></i>Yatırımcılara <b>${money(r.investorNet)}</b> <small>${pct0(share(r.investorNet))}</small></li>
          <li><i class="sb-op"></i>İşletme ücreti <b>${usd(r.op)}</b> <small>${pct0(share(r.op))}</small></li>
          <li><i class="sb-fee"></i>Platform payı <b>${usd(r.pf)}</b> <small>${pct0(share(r.pf))}</small></li>
        </ul>
      </figure>
      <dl class="calc-facts">
        <div><dt>Dakika başına maliyet</dt><dd>${r.costMin == null ? '—' : usd2(r.costMin)}</dd><small>${r.opFeeAvg == null ? '' : 'Ortalama işletme ücreti ' + usd2(r.opFeeAvg)}</small></div>
        <div><dt>Başabaş doluluk</dt><dd>${isFinite(r.breakEven) ? (r.breakEven > 1 ? '%100’ün üstü' : pct0(r.breakEven)) : 'Ulaşılamıyor'}</dd><small>Şirketin zarar etmediği en düşük doluluk</small></div>
        <div><dt>Tesis kurulumu</dt><dd>${usd(r.facility)}</dd><small>${!r.facility ? '' : isFinite(r.facilityPaybackMonths) ? 'Kârla geri dönüş ' + months(r.facilityPaybackMonths) : 'Şirket kâr etmeden geri dönmez'}</small></div>
        <div><dt>Tezgâh yatırımı</dt><dd>${usd(r.machinesInvest)}</dd><small>${num(r.N)} tezgâh, yatırımcılar öder</small></div>
      </dl>`;
  }

  function detailHTML(r) {
    const line = (label, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th><td>${money(v)}</td></tr>`;
    const list = r.types.filter(t => t.count > 0);
    const company = `<h2>Şirket hesabı, aylık</h2>
      <table class="tbl tbl-sm calc-tbl"><tbody>
        ${line('İşletme ücreti geliri', r.op)}
        ${line('Platform payı', r.pf)}
        ${line(`Ekip <small>${num(r.people.total)} kişi</small>`, -r.cost.staff)}
        ${line('Kira ve aidat', -r.cost.rent)}
        ${line('Elektrik', -r.cost.elec)}
        ${line('Takım ve sarf', -r.cost.tool)}
        ${line('Bakım', -r.cost.maint)}
        ${line('Sigorta', -r.cost.ins)}
        ${line('Diğer giderler', -r.cost.other)}
        ${line('Kâr', r.profit, 'total' + (r.profit < 0 ? ' neg' : ''))}
      </tbody></table>`;
    const row = (label, v) => `<tr><th scope="row">${label}</th><td>${v}</td></tr>`;
    const ops = `<h2>Operasyon</h2>
      <table class="tbl tbl-sm calc-tbl"><tbody>
        ${row('Operatör', `${num(r.people.operators)} kişi${r.people.operators ? ` <small>vardiya başına ${num(r.people.opPerShift)}</small>` : ''}`)}
        ${row('Planlamacı', `${num(r.people.planners)} kişi`)}
        ${row('Diğer ekip', `${num(r.people.others)} kişi`)}
        ${row('Aylık kapasite', `${num(r.capHours * r.N)} tezgâh saati`)}
        ${row('Dolu süre', `${num(r.runHours * r.N)} tezgâh saati`)}
        ${row('Boş slot', r.free >= 0 ? num(r.free) : '0')}
        ${row('Slot başına sabit gider', r.fixedPerSlot == null ? '—' : usd(r.fixedPerSlot) + ' <small>aylık</small>')}
      </tbody></table>`;
    const top = `<div class="two calc-two"><div>${company}</div><div>${ops}</div></div>`;
    if (!list.length) return top;
    return `${top}
      <h2 class="calc-h2">Tezgâh tipine göre</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm">
        <thead><tr><th scope="col">Tip</th><th scope="col">Aylık gelir</th><th scope="col">Maliyet / dk</th><th scope="col">İşletme ücreti / dk</th><th scope="col">Yatırımcı neti</th><th scope="col">Yıllık getiri</th><th scope="col">Geri dönüş</th></tr></thead>
        <tbody>${list.map(t => `<tr><th scope="row">${esc(t.name || 'Tezgâh')}<small>${num(t.count)} adet</small></th>
          <td>${usd(t.gross)}</td><td>${t.costMin == null ? '—' : usd2(t.costMin)}</td>
          <td class="${t.costMin != null && t.opFee < t.costMin ? 'neg' : ''}">${usd2(t.opFee)}</td>
          <td class="strong ${t.net < 0 ? 'neg' : ''}">${money(t.net)}</td><td>${pct0(t.yearly)}</td><td>${years(t.paybackYears)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="calc-note">Tutarlar tezgâh başına ve aylıktır. İşletme ücreti maliyetin altındaysa kırmızı görünür: o tezgâhın gideri, yatırımcıdan kesilen ücretle karşılanmıyor demektir.</p>`;
  }

  function paint() {
    const r = compute(S);
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('hesap-out', outHTML(r));
    set('hesap-types', detailHTML(r));
    set('h-slots', r.slots <= 0 ? '' : r.N > r.slots ? `<span class="neg">${num(r.slots)} slota ${num(r.N)} tezgâh girildi.</span>` : r.free > 0 ? `${num(r.slots)} slotun ${num(r.N)} tanesi dolu, ${num(r.free)} slot boş.` : `${num(r.slots)} slotun tamamı dolu.`);
    set('h-ops', `Tezgâh başına ayda ${num(r.capHours)} saat kapasite, ${num(r.runHours)} saati dolu.`);
    set('h-team', `Gereken ekip: ${num(r.people.operators)} operatör${r.people.operators ? ` (vardiya başına ${num(r.people.opPerShift)})` : ''} ve ${num(r.people.planners)} planlamacı.`);
    set('h-once', `Tesis kurulumu toplamı ${usd(r.facility)}. Tezgâh alımı ve kurulumu ayrıca ${usd(r.machinesInvest)} tutar, bunu yatırımcılar öder.`);
    set('h-fee', `Ortalama platform payı ${pct1(r.fee)}.`);
    set('hesap-bar', `<span>Şirket kârı <b class="${r.profit < 0 ? 'neg' : ''}">${money(r.profit)}</b></span><span>Yatırımcı neti <b class="${r.investorOne < 0 ? 'neg' : ''}">${money(r.investorOne)}</b></span><button type="button" class="as-btn" data-hesap="goto">Sonuç</button>`);
  }

  function view() {
    if (!S) S = load();
    setTimeout(paint, 0);
    return `<section class="page-head"><h1>Hesaplama</h1>
        <p class="lead">Bir tesisin gelirini, giderini, gereken ekibi ve kârını hesaplayın. Değerleri değiştirdikçe sonuç güncellenir.</p></section>
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
    setPath(t.dataset.h, t.type === 'text' ? t.value : n0(t.value));
    if (t.dataset.out) { const o = document.getElementById(t.dataset.out); if (o) o.textContent = '%' + num(n0(t.value)); }
    save(); paint();
  });
  const BLANK = { machines: { name: '', count: 1, price: 0, install: 0, rate: 0, opFee: 0 }, staff: { name: '', count: 1, cost: 0 }, monthly: { name: '', amount: 0 }, oneTime: { name: '', amount: 0 } };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-hesap]');
    if (!b || !S) return;
    const a = b.dataset.hesap, list = b.dataset.list;
    if (a === 'goto') { const out = $('#hesap-out'); if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
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
