/* Emek Sermaye · hesaplama aracı
   Bir tesisin günlük ve aylık gelirini, giderini, gereken ekibi ve kârını hesaplar.
   Hesap gün üzerinden yapılır: tezgâhın günlük ücreti, ekip ücretleri, elektrik ve takım gideri günlüktür.
   Kira ve diğer giderler aylık, sigorta yıllık girilir; günlük karşılıkları ayda çalışma gününe bölünerek bulunur.
   Model: ciro = yatırımcılara kalan + işletme giderleri + platform payı.
   İşletme giderleri girilen gerçek giderlerdir ve yatırımcının kazancından düşülür; şirketin kârı platform payıdır.
   Girilen değerler yalnızca bu tarayıcıda saklanır, sunucuya gönderilmez. */
(function () {
  'use strict';
  const KEY = 'emek-hesap-v2';
  const n0 = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

  /* ---------- başlangıç değerleri ----------
     Tezgâh fiyatları sitedeki makine tiplerinden gelir. Günlük ücret, dakika ücretinin iki vardiya × 8 saatlik
     bir günle (960 dakika) çarpılıp 10 dolara yuvarlanmasıdır. Sigorta fiyatın %1'idir.
     Ekip, kira ve kurulum rakamları örnektir. */
  const FALLBACK = { 3: { price: 105000, installFee: 4500, rate: 0.75 }, 4: { price: 210000, installFee: 6500, rate: 1 }, 5: { price: 360000, installFee: 9500, rate: 1.5 } };
  function defaults(types) {
    const row = (axes, count) => {
      const t = types && types[axes] && types[axes].rate ? types[axes] : FALLBACK[axes];
      return { name: axes + ' eksen', count, price: t.price, install: t.installFee, dayRate: Math.round(t.rate * 960 / 10) * 10, insYear: Math.round(t.price / 100 / 50) * 50 };
    };
    return {
      slots: 8,
      machines: [row(3, 3), row(4, 3), row(5, 2)],
      days: 26, shifts: 2, util: 65,
      perOperator: 2, operatorDay: 60, perPlanner: 8, plannerDay: 90,
      staff: [{ name: 'Tesis sorumlusu', count: 1, day: 115 }, { name: 'Kalite kontrol', count: 1, day: 70 }],
      elecDay: 24, toolDay: 48, rent: 5000, maintPct: 3,
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
    const days = n0(x.days), shifts = Math.ceil(n0(x.shifts));
    const util = Math.min(100, n0(x.util)) / 100;
    const busy = days * util;                          // tezgâh başına ayda dolu gün
    const daily = v => (days ? v / days : 0);          // aylık tutarın ortalama bir çalışma günündeki karşılığı
    const ms = (x.machines || []).map(m => ({ name: m.name, count: Math.floor(n0(m.count)), price: n0(m.price), install: n0(m.install), dayRate: n0(m.dayRate), insYear: n0(m.insYear) }));
    const N = sum(ms, m => m.count);
    const value = sum(ms, m => m.count * m.price);

    // ekip: her operatör günde bir vardiya çalışır
    const perOp = n0(x.perOperator), perPl = n0(x.perPlanner);
    const opPerShift = perOp > 0 ? Math.ceil(N / perOp) : 0;
    const operators = opPerShift * shifts;
    const planners = perPl > 0 ? Math.ceil(N / perPl) : 0;
    const staffRows = (x.staff || []).map(s => ({ count: Math.floor(n0(s.count)), day: n0(s.day) }));
    const others = sum(staffRows, s => s.count);
    const people = { operators, opPerShift, planners, others, total: operators + planners + others };

    // aylık giderler: günlük ücretler ayda çalışma günüyle, dolu güne bağlı giderler dolu günle çarpılır
    const perBusyDay = n0(x.elecDay) + n0(x.toolDay);
    const maint = n0(x.maintPct) / 100;
    const cost = {
      operators: operators * n0(x.operatorDay) * days,
      planners: planners * n0(x.plannerDay) * days,
      others: sum(staffRows, s => s.count * s.day) * days,
      rent: n0(x.rent),
      elec: N * busy * n0(x.elecDay),
      tool: N * busy * n0(x.toolDay),
      maint: value * maint / 12,
      ins: sum(ms, m => m.count * m.insYear) / 12,
      other: sum(x.monthly || [], r => n0(r.amount))
    };
    cost.staff = cost.operators + cost.planners + cost.others;
    cost.total = cost.staff + cost.rent + cost.elec + cost.tool + cost.maint + cost.ins + cost.other;
    const fixed = cost.total - cost.elec - cost.tool;                  // doluluktan bağımsız giderler
    const shared = N ? (cost.staff + cost.rent + cost.other) / N : 0;   // tezgâhlara eşit bölünen giderler

    // gelir ve paylaşım
    const own = Math.min(100, n0(x.ownShare)) / 100;
    const fee = own * n0(x.feeOwn) / 100 + (1 - own) * n0(x.feePlatform) / 100;   // ortalama platform payı
    const types = ms.map(m => {
      const opCost = shared + busy * perBusyDay + m.price * maint / 12 + m.insYear / 12;   // bu tezgâha düşen aylık işletme gideri
      const gross = m.dayRate * busy, pf = gross * fee, net = gross - pf - opCost;
      const invest = m.price + m.install;
      return {
        name: m.name, count: m.count, dayRate: m.dayRate, insYear: m.insYear, invest, gross, pf, opCost, net,
        pfDay: m.dayRate * fee,
        costDay: busy ? opCost / busy : null,
        netDay: busy ? net / busy : null,
        yearly: invest ? net * 12 / invest : 0,
        paybackYears: net > 0 ? invest / (net * 12) : Infinity
      };
    });
    const gross = sum(types, t => t.gross * t.count), pf = gross * fee;
    const investorNet = gross - pf - cost.total;
    const profit = pf;
    const investorOne = N ? investorNet / N : 0;
    const machinesInvest = sum(types, t => t.invest * t.count);
    const facility = sum(x.oneTime || [], r => n0(r.amount));

    // başabaş doluluk: yatırımcının zarar etmediği en düşük doluluk.
    // Ciro ve dolu güne bağlı giderler dolulukla doğru orantılıdır, diğer giderler sabittir.
    const fullNet = sum(ms, m => m.count * days * m.dayRate) * (1 - fee) - N * days * perBusyDay;
    const breakEven = N && fullNet > 0 ? fixed / fullNet : Infinity;

    return {
      slots, N, free: slots - N, days, shifts, util, busy, busyDays: N * busy, capDays: N * days,
      people, cost, fixed, fee, types, gross, pf, investorNet, profit, investorOne,
      investorYearly: machinesInvest ? investorNet * 12 / machinesInvest : 0,
      costBusyDay: N && busy ? cost.total / (N * busy) : null,
      dayRateAvg: N ? sum(ms, m => m.count * m.dayRate) / N : null,
      breakEven, breakEvenDays: breakEven * days, facility, machinesInvest,
      facilityPaybackMonths: profit > 0 ? facility / profit : Infinity,
      fixedPerSlotDay: slots && days ? fixed / slots / days : null,
      day: {
        gross: daily(gross), pf: daily(pf), cost: daily(cost.total), investorNet: daily(investorNet),
        investorOne: daily(investorOne), profit: daily(profit), staff: daily(cost.staff)
      },
      daily
    };
  }

  window.EmekHesapModel = { defaults, compute };

  /* ---------- arayüz ---------- */
  const SF = window.SF, P = window.EmekPlatform;
  if (!SF || !P || typeof document === 'undefined') return;
  const { esc, usd, num } = P;
  const $ = (s, r = document) => r.querySelector(s);
  const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const pct0 = v => (v < 0 ? '−%' + num(-v * 100) : '%' + num(v * 100));
  const pct1 = v => '%' + nf1.format(v * 100);
  const money = v => (v < 0 ? '−' + usd(-v) : usd(v));
  const years = v => (isFinite(v) ? nf1.format(v) + ' yıl' : 'Geri dönmez');
  const months = v => (isFinite(v) ? (v < 1 ? '1 aydan kısa' : v > 36 ? nf1.format(v / 12) + ' yıl' : num(Math.round(v)) + ' ay') : '');
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
  const mfld = (label, path, v, step) => `<label class="field"><span class="lbl">${esc(label)}</span><input type="number" inputmode="decimal" min="0" step="${step || 'any'}" data-h="${path}" value="${val(v)}"></label>`;
  const range = (label, path, v, id) => `<label class="field calc-range"><span>${esc(label)} <output id="${id}">%${num(n0(v))}</output></span>
    <input type="range" min="0" max="100" step="1" data-h="${path}" data-out="${id}" value="${n0(v)}"></label>`;
  const del = (list, i, what) => `<button type="button" class="icon-btn" data-hesap="del" data-list="${list}" data-i="${i}" aria-label="${esc(what)} satırını sil">${X}</button>`;
  const add = (list, text) => `<button type="button" class="text-link as-btn calc-add" data-hesap="add" data-list="${list}">+ ${esc(text)}</button>`;
  const rows = (list, label, amountLabel) => (S[list].length ? `<p class="calc-cols calc-cols-2" aria-hidden="true"><span>${esc(label)}</span><span>${esc(amountLabel)}</span></p>` : '') + S[list].map((r, i) => `<div class="calc-row">
      <label class="field"><span class="sr-only">${esc(label)} adı</span><input type="text" maxlength="60" data-h="${list}.${i}.name" value="${val(r.name)}" placeholder="${esc(label)}"></label>
      <label class="field"><span class="sr-only">${esc(amountLabel)}</span><input type="number" inputmode="decimal" min="0" step="any" data-h="${list}.${i}.amount" value="${val(r.amount)}"></label>
      ${del(list, i, r.name || label)}</div>`).join('');

  function inputsHTML() {
    return `
      <section class="calc-sec"><h2>Tesis</h2>
        <div class="calc-grid calc-narrow">${fld('Slot sayısı', '', 'slots', S.slots, 1)}</div>
        <p class="calc-hint" id="h-slots"></p>
        <h3>Tezgâhlar</h3>
        ${S.machines.length ? '<p class="calc-m calc-mhead" aria-hidden="true"><span>Tip</span><span>Adet</span><span>Fiyat $</span><span>Kurulum $</span><span>Günlük ücret $</span><span>Yıllık sigorta $</span><span></span></p>' : ''}
        ${S.machines.map((m, i) => `<div class="calc-m">
          <label class="field"><span class="lbl">Tip</span><input type="text" maxlength="40" data-h="machines.${i}.name" value="${val(m.name)}" placeholder="Tezgâh tipi"></label>
          ${mfld('Adet', `machines.${i}.count`, m.count, 1)}
          ${mfld('Fiyat $', `machines.${i}.price`, m.price)}
          ${mfld('Kurulum $', `machines.${i}.install`, m.install)}
          ${mfld('Günlük ücret $', `machines.${i}.dayRate`, m.dayRate)}
          ${mfld('Yıllık sigorta $', `machines.${i}.insYear`, m.insYear)}
          ${del('machines', i, m.name || 'Tezgâh')}</div>`).join('')}
        ${add('machines', 'Tezgâh tipi ekle')}
        <p class="calc-note">Günlük ücret, tezgâhın dolu bir günü için müşteriden alınan tutardır. Yıllık sigorta, tezgâh başına poliçe bedelidir.</p>
      </section>

      <section class="calc-sec"><h2>Çalışma düzeni</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Ayda çalışma günü', '', 'days', S.days)}
          ${fld('Günlük vardiya', '', 'shifts', S.shifts, 1)}
        </div>
        ${range('Doluluk', 'util', S.util, 'o-util')}
        <p class="calc-hint" id="h-ops"></p>
      </section>

      <section class="calc-sec"><h2>Ekip</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Operatör başına tezgâh', '', 'perOperator', S.perOperator)}
          ${fld('Operatörün günlük ücreti', '$', 'operatorDay', S.operatorDay)}
          ${fld('Planlamacı başına tezgâh', '', 'perPlanner', S.perPlanner)}
          ${fld('Planlamacının günlük ücreti', '$', 'plannerDay', S.plannerDay)}
        </div>
        <p class="calc-hint" id="h-team"></p>
        <h3>Diğer ekip</h3>
        ${S.staff.length ? '<p class="calc-cols" aria-hidden="true"><span>Görev</span><span>Kişi</span><span>Günlük ücret $</span></p>' : ''}
        ${S.staff.map((r, i) => `<div class="calc-row calc-row-3">
          <label class="field"><span class="sr-only">Görev</span><input type="text" maxlength="60" data-h="staff.${i}.name" value="${val(r.name)}" placeholder="Görev"></label>
          <label class="field"><span class="sr-only">Kişi sayısı</span><input type="number" inputmode="numeric" min="0" step="1" data-h="staff.${i}.count" value="${val(r.count)}"></label>
          <label class="field"><span class="sr-only">Kişi başı günlük ücret, dolar</span><input type="number" inputmode="decimal" min="0" step="any" data-h="staff.${i}.day" value="${val(r.day)}"></label>
          ${del('staff', i, r.name || 'Görev')}</div>`).join('')}
        ${add('staff', 'Görev ekle')}
        <p class="calc-note">Ücretler kişi başına, bir çalışma günü için işverene toplam maliyettir. Aylık ekip gideri, günlük ücretin ayda çalışma günüyle çarpımıdır.</p>
      </section>

      <section class="calc-sec"><h2>İşletme giderleri</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Elektrik', '$ / gün', 'elecDay', S.elecDay)}
          ${fld('Takım ve sarf', '$ / gün', 'toolDay', S.toolDay)}
          ${fld('Kira ve aidat', '$ / ay', 'rent', S.rent)}
          ${fld('Bakım', '% / yıl', 'maintPct', S.maintPct)}
        </div>
        <p class="calc-note">Elektrik ile takım ve sarf, bir tezgâhın dolu bir günü içindir. Bakım, tezgâh fiyatının yıllık yüzdesidir. Sigorta, tezgâhlar bölümünde girilir.</p>
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
        <div><dt>Yatırımcının günlük neti</dt><dd class="${r.investorOne < 0 ? 'neg' : ''}">${money(r.day.investorOne)}</dd>
          <small>${r.investorNet < 0 ? 'Ciro giderleri karşılamıyor' : `Tezgâh başına · aylık ${money(r.investorOne)} · yıllık ${pct0(r.investorYearly)}`}</small></div>
        <div><dt>Şirketin günlük kârı</dt><dd>${money(r.day.profit)}</dd>
          <small>Aylık ${money(r.profit)} · platform payı</small></div>
      </dl>
      <figure class="calc-split">
        <figcaption><span>Günlük ciro</span><b>${usd(r.day.gross)}</b></figcaption>
        <div class="split-bar" aria-hidden="true">
          <span class="sb-net" style="flex-grow:${Math.max(0, r.investorNet)}"></span><span class="sb-op" style="flex-grow:${r.cost.total}"></span><span class="sb-fee" style="flex-grow:${r.pf}"></span>
        </div>
        <ul>
          <li><i class="sb-net"></i>Yatırımcılara <b class="${r.investorNet < 0 ? 'neg' : ''}">${money(r.day.investorNet)}</b> <small>${pct0(share(r.investorNet))}</small></li>
          <li><i class="sb-op"></i>İşletme giderleri <b>${usd(r.day.cost)}</b> <small>${pct0(share(r.cost.total))}</small></li>
          <li><i class="sb-fee"></i>Platform payı <b>${usd(r.day.pf)}</b> <small>${pct0(share(r.pf))}</small></li>
        </ul>
      </figure>
      <dl class="calc-facts">
        <div><dt>Dolu tezgâh gününün maliyeti</dt><dd>${r.costBusyDay == null ? '—' : usd(r.costBusyDay)}</dd><small>${r.dayRateAvg == null ? '' : 'Ortalama günlük ücret ' + usd(r.dayRateAvg)}</small></div>
        <div><dt>Başabaş doluluk</dt><dd>${isFinite(r.breakEven) ? (r.breakEven > 1 ? '%100’ün üstü' : pct0(r.breakEven)) : 'Ulaşılamıyor'}</dd><small>${isFinite(r.breakEven) && r.breakEven <= 1 ? `Ayda ${nf1.format(r.breakEvenDays)} dolu gün. Altında yatırımcı zarar eder.` : 'Yatırımcının zarar etmediği en düşük doluluk'}</small></div>
        <div><dt>Tesis kurulumu</dt><dd>${usd(r.facility)}</dd><small>${!r.facility ? '' : isFinite(r.facilityPaybackMonths) ? 'Şirket kârıyla geri dönüş ' + months(r.facilityPaybackMonths) : 'Şirket kâr etmeden geri dönmez'}</small></div>
        <div><dt>Tezgâh yatırımı</dt><dd>${usd(r.machinesInvest)}</dd><small>${num(r.N)} tezgâh, yatırımcılar öder</small></div>
      </dl>
      <p class="calc-note">Günlük tutarlar ortalama bir çalışma günü içindir: aylık tutar ÷ ${nf1.format(r.days)} gün.</p>`;
  }

  function detailHTML(r) {
    const d = r.daily;
    const line = (label, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th><td>${money(d(v))}</td><td>${money(v)}</td></tr>`;
    const company = `<h2>Tesis hesabı</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm calc-tbl">
        <thead><tr><th scope="col"><span class="sr-only">Kalem</span></th><th scope="col">Günlük</th><th scope="col">Aylık</th></tr></thead>
        <tbody>
        ${line('Ciro', r.gross, 'strong')}
        ${line(`Operatörler <small>${num(r.people.operators)} kişi</small>`, -r.cost.operators)}
        ${line(`Planlamacılar <small>${num(r.people.planners)} kişi</small>`, -r.cost.planners)}
        ${line(`Diğer ekip <small>${num(r.people.others)} kişi</small>`, -r.cost.others)}
        ${line('Kira ve aidat', -r.cost.rent)}
        ${line('Elektrik', -r.cost.elec)}
        ${line('Takım ve sarf', -r.cost.tool)}
        ${line('Bakım', -r.cost.maint)}
        ${line('Sigorta', -r.cost.ins)}
        ${line('Diğer giderler', -r.cost.other)}
        ${line('Platform payı <small>şirketin kârı</small>', -r.pf)}
        ${line('Yatırımcılara kalan', r.investorNet, 'total' + (r.investorNet < 0 ? ' neg' : ''))}
        </tbody></table></div>`;
    const row = (label, v) => `<tr><th scope="row">${label}</th><td>${v}</td></tr>`;
    const ops = `<h2>Operasyon</h2>
      <table class="tbl tbl-sm calc-tbl"><tbody>
        ${row('Operatör', `${num(r.people.operators)} kişi${r.people.operators ? ` <small>vardiya başına ${num(r.people.opPerShift)}</small>` : ''}`)}
        ${row('Planlamacı', `${num(r.people.planners)} kişi`)}
        ${row('Diğer ekip', `${num(r.people.others)} kişi`)}
        ${row('Ekibin günlük maliyeti', usd(d(r.cost.staff)))}
        ${row('Ayda dolu tezgâh günü', `${nf1.format(r.busyDays)} <small>/ ${nf1.format(r.capDays)}</small>`)}
        ${row('Boş slot', num(Math.max(0, r.free)))}
        ${row('Slot başına günlük sabit gider', r.fixedPerSlotDay == null ? '—' : usd(r.fixedPerSlotDay))}
      </tbody></table>`;
    const top = `<div class="two calc-two"><div>${company}</div><div>${ops}</div></div>`;
    const list = r.types.filter(t => t.count > 0);
    if (!list.length) return top;
    return `${top}
      <h2 class="calc-h2">Tezgâh tipine göre</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm">
        <thead><tr><th scope="col">Tip</th><th scope="col">Günlük ücret</th><th scope="col">İşletme gideri</th><th scope="col">Platform payı</th><th scope="col">Yatırımcıya</th><th scope="col">Aylık net</th><th scope="col">Yıllık getiri</th><th scope="col">Geri dönüş</th></tr></thead>
        <tbody>${list.map(t => `<tr><th scope="row">${esc(t.name || 'Tezgâh')}<small>${num(t.count)} adet</small></th>
          <td>${usd(t.dayRate)}</td>
          <td>${t.costDay == null ? '—' : usd(t.costDay)}</td>
          <td>${usd(t.pfDay)}</td>
          <td class="strong ${t.netDay < 0 ? 'neg' : ''}">${t.netDay == null ? '—' : money(t.netDay)}</td>
          <td class="${t.net < 0 ? 'neg' : ''}">${money(t.net)}</td><td>${pct0(t.yearly)}</td><td>${years(t.paybackYears)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="calc-note">İlk dört tutar, bir tezgâhın dolu bir günü içindir. İşletme gideri; ekip, kira, elektrik, takım, bakım, sigorta ve diğer giderlerden o tezgâha düşen paydır. Ekip, kira ve diğer giderler tezgâhlara eşit bölünür.</p>`;
  }

  function paint() {
    const r = compute(S);
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('hesap-out', outHTML(r));
    set('hesap-types', detailHTML(r));
    set('h-slots', r.slots <= 0 ? '' : r.N > r.slots ? `<span class="neg">${num(r.slots)} slota ${num(r.N)} tezgâh girildi.</span>` : r.free > 0 ? `${num(r.slots)} slotun ${num(r.N)} tanesi dolu, ${num(r.free)} slot boş.` : `${num(r.slots)} slotun tamamı dolu.`);
    set('h-ops', `Tezgâh başına ayda ${nf1.format(r.days)} çalışma gününün ${nf1.format(r.busy)} günü dolu.`);
    set('h-team', `Gereken ekip: ${num(r.people.operators)} operatör${r.people.operators ? ` (vardiya başına ${num(r.people.opPerShift)})` : ''} ve ${num(r.people.planners)} planlamacı. Tüm ekip ${num(r.people.total)} kişi, günlük ${usd(r.day.staff)}, aylık ${usd(r.cost.staff)}.`);
    set('h-once', `Tesis kurulumu toplamı ${usd(r.facility)}. Tezgâh alımı ve kurulumu ayrıca ${usd(r.machinesInvest)} tutar, bunu yatırımcılar öder.`);
    set('h-fee', `Ortalama platform payı ${pct1(r.fee)}. Şirketin kârı bu paydır; işletme giderleri yatırımcının kazancından düşülür.`);
    set('hesap-bar', `<span>Yatırımcı neti / gün <b class="${r.investorOne < 0 ? 'neg' : ''}">${money(r.day.investorOne)}</b></span><span>Şirket kârı / gün <b>${money(r.day.profit)}</b></span><button type="button" class="as-btn" data-hesap="goto">Sonuç</button>`);
  }

  function view() {
    if (!S) S = load();
    setTimeout(paint, 0);
    return `<section class="page-head"><h1>Hesaplama</h1>
        <p class="lead">Bir tesisin günlük ve aylık gelirini, giderini, gereken ekibi ve kârını hesaplayın. Değerleri değiştirdikçe sonuç güncellenir.</p></section>
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
  const BLANK = { machines: { name: '', count: 1, price: 0, install: 0, dayRate: 0, insYear: 0 }, staff: { name: '', count: 1, day: 0 }, monthly: { name: '', amount: 0 }, oneTime: { name: '', amount: 0 } };
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
