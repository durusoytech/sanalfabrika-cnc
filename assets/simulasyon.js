/* Emek Sermaye · fabrika simülasyonu
   Bir tesisteki tek bir cihazın ayını gün gün gösterir: tesis, cihaz, cihazın önündeki iş ve operatör.
   Cihazın sahibi iş olmasa da kira (tesisteki slotun payı), sigorta ve bakım öder.
   İş geldiğinde o günlere operatör, elektrik ve takım gideri eklenir; platform, işin kazancından pay alır.
   İşler sırayla yapılır, ilk iş ayın ilk çalışma günü başlar. Tutarlar dolardır.
   Girilen değerler yalnızca bu tarayıcıda saklanır, sunucuya gönderilmez. */
(function () {
  'use strict';
  const KEY = 'emek-sim-v1';
  const n0 = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

  /* ---------- başlangıç değerleri: hepsi örnektir ---------- */
  function defaults(facility) {
    return {
      fac: {
        name: (facility && facility.name) || 'Kazan Tesisi',
        slots: (facility && facility.slots && facility.slots.length) || 10,
        setup: 135000, monthly: 8000, amortMonths: 60, kwhPrice: 0.12
      },
      mc: { name: '4 eksen yatay işleme merkezi', price: 210000, install: 6500, insYear: 2100, maintMonth: 450, kw: 15, toolHour: 3 },
      days: 26, shifts: 2, shiftHours: 8, operatorDay: 60, perOperator: 2,
      rateOwn: 5, ratePlatform: 20,
      jobs: [
        { name: 'Valf bloğu', days: 8, revenue: 7200, source: 'own', rate: 5 },
        { name: 'Pompa gövdesi', days: 6, revenue: 5100, source: 'platform', rate: 20 },
        { name: 'Bağlantı braketi', days: 5, revenue: 3600, source: 'platform', rate: 20 }
      ]
    };
  }

  /* ---------- hesap ---------- */
  function compute(x) {
    const fac = x.fac || {}, mc = x.mc || {};
    const days = Math.floor(n0(x.days));                              // ayda çalışma günü
    const shifts = Math.ceil(n0(x.shifts));
    const planned = shifts * n0(x.shiftHours), hours = Math.min(24, planned);

    // tesis: slot kirası = aylık tesis giderinin ve kurulumun slot başına payı
    const slots = Math.floor(n0(fac.slots));
    const amort = n0(fac.amortMonths);
    const rentFromMonthly = slots ? n0(fac.monthly) / slots : 0;
    const rentFromSetup = slots && amort ? n0(fac.setup) / amort / slots : 0;
    const rent = rentFromMonthly + rentFromSetup;

    // iş olsun olmasın her ay ödenenler
    const ins = n0(mc.insYear) / 12, maint = n0(mc.maintMonth);
    const fixed = rent + ins + maint;
    const fixedDay = days ? fixed / days : 0;

    // yalnızca iş olan günlerde: operatör, elektrik, takım
    const perOp = n0(x.perOperator);
    const opDay = perOp ? shifts * n0(x.operatorDay) / perOp : 0;
    const elecDay = n0(mc.kw) * hours * n0(fac.kwhPrice);
    const toolDay = n0(mc.toolHour) * hours;
    const varDay = opDay + elecDay + toolDay;

    // işler sırayla dizilir; ayın dışına taşan kısım bu aya sayılmaz
    let cursor = 0;
    const jobs = (x.jobs || []).map((j, i) => {
      const d = n0(j.days), revenue = n0(j.revenue), rate = Math.min(100, n0(j.rate)) / 100;
      const start = cursor, end = cursor + d; cursor = end;
      const inMonth = Math.max(0, Math.min(end, days) - Math.min(start, days));
      const k = d ? inMonth / d : 0;
      const rev = revenue * k, share = rev * rate, cost = inMonth * varDay;
      return {
        i, name: j.name, source: j.source === 'platform' ? 'platform' : 'own', days: d, revenue, rate,
        start, end, inMonth, perDay: d ? revenue / d : 0, rev, share, cost, contrib: rev - share - cost
      };
    });
    const busy = sum(jobs, j => j.inMonth);
    const revenue = sum(jobs, j => j.rev), share = sum(jobs, j => j.share);
    const cost = { operator: busy * opDay, elec: busy * elecDay, tool: busy * toolDay, rent, ins, maint };
    cost.variable = cost.operator + cost.elec + cost.tool;
    const net = revenue - share - cost.variable - fixed;
    const invest = n0(mc.price) + n0(mc.install);

    return {
      days, shifts, hours, overHours: planned > 24, slots, rent, rentFromMonthly, rentFromSetup, ins, maint, fixed, fixedDay,
      opDay, elecDay, toolDay, varDay, jobs, jobDays: cursor, busy, idle: Math.max(0, days - busy), over: Math.max(0, cursor - days),
      revenue, share, cost, net, invest, util: days ? busy / days : 0,
      paybackMonths: net > 0 ? invest / net : Infinity, yearly: invest ? net * 12 / invest : 0,
      fac: { setup: n0(fac.setup), monthly: n0(fac.monthly) }
    };
  }

  // Ayın belirli bir günü (1'den başlar): o gün cihazda hangi iş var, ay başından o günün sonuna kadar toplamlar
  function dayState(r, day) {
    const t = day - 0.5;
    const job = r.jobs.find(j => j.inMonth > 0 && t >= j.start && t < j.end) || null;
    let rev = 0, share = 0, vcost = 0;
    for (const j of r.jobs) {
      const dd = Math.max(0, Math.min(j.end, day, r.days) - Math.min(j.start, day, r.days));
      if (dd > 0 && j.days) { const x = j.revenue * dd / j.days; rev += x; share += x * j.rate; vcost += dd * r.varDay; }
    }
    const fixed = r.fixedDay * Math.min(day, r.days);
    return {
      day, job,
      jobDay: job ? Math.floor(t - job.start) + 1 : 0,
      progress: job && job.days ? Math.min(1, (day - job.start) / job.days) : 0,
      cum: { rev, share, vcost, fixed, net: rev - share - vcost - fixed }
    };
  }

  window.EmekSimModel = { defaults, compute, dayState };

  /* ---------- arayüz ---------- */
  const SF = window.SF, P = window.EmekPlatform;
  if (!SF || !P || typeof document === 'undefined') return;
  const { esc, num } = P;
  const $ = (s, r = document) => r.querySelector(s);
  const _m = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = v => (v <= -0.5 ? '−' + _m.format(-v) : _m.format(v < 0.5 ? 0 : v));
  const sgn = v => (v >= 0.5 ? '+' + _m.format(v) : money(v));
  const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const pct0 = v => (v < 0 ? '−%' : '%') + num(Math.abs(v) * 100);
  const months = v => (v < 1 ? '1 aydan kısa' : v > 36 ? nf1.format(v / 12) + ' yıl' : num(Math.round(v)) + ' ay');
  const SRC = { own: 'Yatırımcı', platform: 'Platform' };
  const SRC_JOB = { own: 'Yatırımcının getirdiği iş', platform: 'Platformun bulduğu iş' };
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
  const OP_SVG = '<svg viewBox="0 0 60 92" aria-hidden="true"><circle cx="30" cy="17" r="13"/><path d="M7 90V58c0-12.7 10.3-23 23-23s23 10.3 23 23v32z"/></svg>';
  const MC_SVG = `<svg viewBox="0 0 176 132" aria-hidden="true">
      <rect class="mc-base" x="4" y="118" width="150" height="10" rx="2"/>
      <rect class="mc-body" x="8" y="14" width="142" height="104" rx="8"/>
      <rect class="mc-win" x="20" y="28" width="84" height="66" rx="4"/>
      <rect class="mc-head" x="52" y="28" width="20" height="16" rx="2"/>
      <rect class="mc-tool" x="60" y="44" width="4" height="16"/>
      <rect class="mc-part" x="46" y="68" width="32" height="12" rx="1.5"/>
      <rect class="mc-table" x="26" y="80" width="72" height="6" rx="1.5"/>
      <rect class="mc-panel" x="114" y="28" width="26" height="46" rx="3"/>
      <rect class="mc-screen" x="118" y="32" width="18" height="12" rx="1.5"/>
      <rect class="mc-tower" x="160" y="34" width="4" height="40" rx="1"/>
      <circle class="mc-light" cx="162" cy="27" r="6"/>
    </svg>`;

  let S = null, day = 1, timer = null;

  function load() {
    const d = defaults(SF.FACILITIES && SF.FACILITIES[0]);
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        if (s.fac && typeof s.fac === 'object') Object.assign(d.fac, s.fac);
        if (s.mc && typeof s.mc === 'object') Object.assign(d.mc, s.mc);
        for (const k of ['days', 'shifts', 'shiftHours', 'operatorDay', 'perOperator', 'rateOwn', 'ratePlatform']) if (k in s) d[k] = s[k];
        if (Array.isArray(s.jobs)) d.jobs = s.jobs;
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
    <input type="number" inputmode="decimal" min="0" step="${step || 'any'}" data-s="${path}" value="${val(v)}"></label>`;
  const tfld = (label, path, v, cls) => `<label class="field${cls ? ' ' + cls : ''}"><span>${esc(label)}</span>
    <input type="text" maxlength="60" data-s="${path}" value="${val(v)}"></label>`;

  /* ---------- giriş alanları ---------- */
  function inputsHTML() {
    return `
      <section class="calc-sec"><h2>Tesis</h2>
        <div class="calc-grid calc-grid-2">
          ${tfld('Tesis adı', 'fac.name', S.fac.name, 'wide')}
          ${fld('Slot sayısı', '', 'fac.slots', S.fac.slots, 1)}
          ${fld('Kurulum ücreti', '$', 'fac.setup', S.fac.setup)}
          ${fld('Aylık tesis gideri', '$', 'fac.monthly', S.fac.monthly)}
          ${fld('Kurulumun dağıtılacağı süre', 'ay', 'fac.amortMonths', S.fac.amortMonths, 1)}
          ${fld('Elektrik birim fiyatı', '$ / kWh', 'fac.kwhPrice', S.fac.kwhPrice)}
        </div>
        <p class="calc-note">Aylık tesis gideri; bina kirası, güvenlik, temizlik ve ortak giderlerdir. Bu gider ve kurulum ücreti slotlara bölünerek slot kirası bulunur.</p>
        <p class="calc-hint" id="sh-fac"></p>
      </section>

      <section class="calc-sec"><h2>Cihaz</h2>
        <div class="calc-grid calc-grid-2">
          ${tfld('Cihaz', 'mc.name', S.mc.name, 'wide')}
          ${fld('Fiyat', '$', 'mc.price', S.mc.price)}
          ${fld('Kurulum', '$', 'mc.install', S.mc.install)}
          ${fld('Yıllık sigorta', '$', 'mc.insYear', S.mc.insYear)}
          ${fld('Aylık bakım', '$', 'mc.maintMonth', S.mc.maintMonth)}
          ${fld('Elektrik tüketimi', 'kWh / saat', 'mc.kw', S.mc.kw)}
          ${fld('Takım ve sarf', '$ / saat', 'mc.toolHour', S.mc.toolHour)}
        </div>
        <p class="calc-hint" id="sh-mc"></p>
      </section>

      <section class="calc-sec"><h2>Operatör ve çalışma düzeni</h2>
        <div class="calc-grid">
          ${fld('Ayda çalışma günü', '', 'days', S.days, 1)}
          ${fld('Günlük vardiya', '', 'shifts', S.shifts, 1)}
          ${fld('Vardiya süresi', 'saat', 'shiftHours', S.shiftHours)}
        </div>
        <div class="calc-grid calc-grid-2">
          ${fld('Operatörün günlük ücreti', '$', 'operatorDay', S.operatorDay)}
          ${fld('Bir operatörün baktığı cihaz', '', 'perOperator', S.perOperator)}
        </div>
        <p class="calc-note">Günlük ücret, bir operatörün bir vardiyası için işverene toplam maliyetidir. Operatör gideri yalnızca iş olan günlere yazılır; bir operatör birden fazla cihaza bakıyorsa ücret cihazlara bölünür.</p>
        <p class="calc-hint" id="sh-op"></p>
      </section>

      <section class="calc-sec"><h2>İşler</h2>
        <div class="calc-grid calc-grid-2">
          ${fld('Yatırımcının getirdiği işte platform payı', '%', 'rateOwn', S.rateOwn)}
          ${fld('Platformun bulduğu işte platform payı', '%', 'ratePlatform', S.ratePlatform)}
        </div>
        <h3>Bu ayın işleri</h3>
        ${S.jobs.length ? '<p class="sim-jrow sim-jhead" aria-hidden="true"><span>İş</span><span>Gün</span><span>Kazanç $</span><span>Getiren</span><span>Pay %</span><span></span></p>' : ''}
        ${S.jobs.map((j, i) => `<div class="sim-jrow">
          <label class="field"><span class="lbl">İş</span><input type="text" maxlength="60" data-s="jobs.${i}.name" value="${val(j.name)}" placeholder="İşin adı"></label>
          <label class="field"><span class="lbl">Gün</span><input type="number" inputmode="decimal" min="0" step="0.5" data-s="jobs.${i}.days" value="${val(j.days)}"></label>
          <label class="field"><span class="lbl">Kazanç $</span><input type="number" inputmode="decimal" min="0" step="any" data-s="jobs.${i}.revenue" value="${val(j.revenue)}"></label>
          <label class="field"><span class="lbl">Getiren</span><select data-s="jobs.${i}.source">
            <option value="own" ${j.source !== 'platform' ? 'selected' : ''}>Yatırımcı</option>
            <option value="platform" ${j.source === 'platform' ? 'selected' : ''}>Platform</option></select></label>
          <label class="field"><span class="lbl">Pay %</span><input type="number" inputmode="decimal" min="0" max="100" step="any" data-s="jobs.${i}.rate" value="${val(j.rate)}"></label>
          <button type="button" class="icon-btn" data-sim="del" data-i="${i}" aria-label="${esc(j.name || 'İş')} işini sil">${X}</button>
        </div>`).join('')}
        <button type="button" class="text-link as-btn calc-add" data-sim="add">+ İş ekle</button>
        <p class="calc-note">İşler sırayla yapılır, ilk iş ayın ilk günü başlar. Kazanç, işin müşteriden alınan toplam bedelidir. Pay, platformun bu kazançtan aldığı orandır; getireni değiştirince yukarıdaki oran yazılır, isterseniz değiştirebilirsiniz.</p>
        <p class="calc-hint" id="sh-jobs"></p>
      </section>

      <p class="calc-note">Başlangıç değerleri örnektir, kendi rakamlarınızı girin. Girdikleriniz yalnızca bu tarayıcıda saklanır.
        <button type="button" class="text-link as-btn" data-sim="reset">Örnek değerlere dön</button></p>`;
  }

  /* ---------- sahne: tesis, operatör, iş, cihaz ---------- */
  function facHTML(r) {
    const n = Math.min(r.slots, 40);
    const boxes = Array.from({ length: n }, (_, i) => `<span class="sim-slot${i === 0 ? ' me' : ''}"></span>`).join('');
    return `<div><b>${esc(S.fac.name || 'Tesis')}</b>
        <p>${num(r.slots)} slot · kurulum ${money(r.fac.setup)} · aylık gider ${money(r.fac.monthly)} · slot kirası ${money(r.rent)} / ay</p></div>
      <div class="sim-slots" role="img" aria-label="${num(r.slots)} slot, birinde bu cihaz">${boxes}</div>`;
  }
  function sceneHTML(r, st) {
    const j = st.job;
    const job = j
      ? `<p class="sim-job-src">${SRC_JOB[j.source]}</p><h3>${esc(j.name || 'İş')}</h3>
         <p>${num(st.jobDay)}. gün / ${nf1.format(j.days)} gün · ${money(j.revenue)}</p>
         <div class="sim-prog"><span style="width:${(st.progress * 100).toFixed(1)}%"></span></div>`
      : `<h3>İş yok</h3><p>Cihaz boş bekliyor. Bugün yalnızca kira, sigorta ve bakım yazılır.</p>`;
    return `<figure class="sim-op${j ? '' : ' off'}">${OP_SVG}<figcaption>${j ? 'Operatör' : 'Operatör yok'}</figcaption></figure>
      <div class="sim-job ${j ? j.source : 'empty'}">${job}</div>
      <figure class="sim-mc${j ? ' run' : ''}">${MC_SVG}<figcaption><b>${esc(S.mc.name || 'Cihaz')}</b><span class="st ${j ? 'st-running' : 'st-idle'}">${j ? 'Çalışıyor' : 'Boşta'}</span></figcaption></figure>`;
  }
  function timeHTML(r) {
    const D = Math.max(1, r.days);
    const segs = r.jobs.filter(j => j.inMonth > 0).map(j => {
      const w = j.inMonth / D * 100;
      return `<span class="sim-seg ${j.source}" style="left:${(j.start / D * 100).toFixed(2)}%;width:${w.toFixed(2)}%">${w > 9 ? esc(j.name || '') : ''}</span>`;
    }).join('');
    return `<span class="sim-mark" style="left:${((day - 0.5) / D * 100).toFixed(2)}%"></span><div class="sim-bar">${segs}</div>
      <div class="sim-scale"><span>1. gün</span><span>${num(D)}. gün</span></div>`;
  }
  function todayHTML(r, st) {
    const j = st.job;
    const row = (label, v) => `<div><span>${label}</span><b class="${v < -0.5 ? 'neg' : ''}">${sgn(v)}</b></div>`;
    const todayNet = j ? j.perDay * (1 - j.rate) - r.varDay - r.fixedDay : -r.fixedDay;
    const today = j
      ? `${row('İşten gelir', j.perDay)}${row(`Platform payı <small>${pct0(j.rate)}</small>`, -j.perDay * j.rate)}${row('Operatör', -r.opDay)}${row('Elektrik', -r.elecDay)}${row('Takım ve sarf', -r.toolDay)}${row('Kira, sigorta, bakım', -r.fixedDay)}`
      : `${row('Kira, sigorta, bakım', -r.fixedDay)}<p class="sim-off">İş yok: operatör, elektrik ve takım gideri yazılmaz.</p>`;
    const c = st.cum;
    return `<div class="sim-ledger"><h3>${num(day)}. günün hesabı</h3>${today}
        <div class="tot"><span>Günün neti</span><b class="${todayNet < -0.5 ? 'neg' : ''}">${sgn(todayNet)}</b></div></div>
      <div class="sim-ledger"><h3>Ay başından bugüne</h3>
        ${row('İşlerden gelir', c.rev)}${row('Platform payı', -c.share)}${row('Operatör, elektrik, takım', -c.vcost)}${row('Kira, sigorta, bakım', -c.fixed)}
        <div class="tot"><span>Net</span><b class="${c.net < -0.5 ? 'neg' : ''}">${sgn(c.net)}</b></div></div>`;
  }

  /* ---------- sonuçlar ---------- */
  function outHTML(r) {
    const line = (label, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th><td>${money(v)}</td></tr>`;
    return `<dl class="calc-top">
        <div><dt>Yatırımcının aylık kazancı</dt><dd class="${r.net < 0 ? 'neg' : ''}">${money(r.net)}</dd><small>${nf1.format(r.busy)} gün iş, ${nf1.format(r.idle)} gün boş</small></div>
        <div><dt>İş olmazsa aylık</dt><dd class="neg">${money(-r.fixed)}</dd><small>Yalnızca kira, sigorta ve bakım</small></div>
      </dl>
      <table class="tbl tbl-sm calc-tbl sim-sum"><tbody>
        ${line('İşlerden gelir', r.revenue, 'strong')}
        ${line('Platform payı', -r.share)}
        ${line(`Operatör <small>${nf1.format(r.busy)} gün</small>`, -r.cost.operator)}
        ${line('Elektrik', -r.cost.elec)}
        ${line('Takım ve sarf', -r.cost.tool)}
        ${line('Kira <small>slot payı</small>', -r.rent)}
        ${line('Sigorta', -r.ins)}
        ${line('Bakım', -r.maint)}
        ${line('Aylık kazanç', r.net, 'total' + (r.net < 0 ? ' neg' : ''))}
      </tbody></table>
      <dl class="calc-facts">
        <div><dt>Doluluk</dt><dd>${pct0(r.util)}</dd><small>${num(r.days)} çalışma gününün ${nf1.format(r.busy)} günü</small></div>
        <div><dt>Cihaz yatırımı</dt><dd>${money(r.invest)}</dd><small>${isFinite(r.paybackMonths) ? 'Bu kazançla geri dönüş ' + months(r.paybackMonths) : 'Bu kazançla geri dönmez'}</small></div>
        <div><dt>İş olan bir günün gideri</dt><dd>${money(r.varDay)}</dd><small>Operatör, elektrik, takım</small></div>
        <div><dt>Her günün sabit gideri</dt><dd>${money(r.fixedDay)}</dd><small>Kira, sigorta, bakım</small></div>
      </dl>`;
  }
  function detailHTML(r) {
    if (!r.jobs.length) return '';
    const D = r.days;
    const when = j => (j.inMonth <= 0 ? 'Bu aya sığmadı' : `${num(Math.floor(j.start) + 1)}.–${num(Math.ceil(Math.min(j.end, D)))}. gün`);
    return `<h2>İşler</h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm">
        <thead><tr><th scope="col">İş</th><th scope="col">Getiren</th><th scope="col">Gün</th><th scope="col">Kazanç</th><th scope="col">Platform payı</th><th scope="col">İş giderleri</th><th scope="col">Yatırımcıya</th></tr></thead>
        <tbody>${r.jobs.map(j => `<tr><th scope="row">${esc(j.name || 'İş')}<small>${when(j)}</small></th>
          <td>${SRC[j.source]}</td><td>${j.inMonth < j.days ? `${nf1.format(j.inMonth)} / ${nf1.format(j.days)}` : nf1.format(j.days)}</td>
          <td>${money(j.rev)}</td><td>${money(j.share)} <small>${pct0(j.rate)}</small></td><td>${money(j.cost)}</td>
          <td class="strong ${j.contrib < 0 ? 'neg' : ''}">${money(j.contrib)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="calc-note">İş giderleri, işin bu aydaki günlerinde operatör, elektrik ve takım gideridir. Yatırımcıya kalan tutardan ayrıca aylık kira, sigorta ve bakım düşülür.</p>`;
  }

  function set(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function paintStage(r) {
    const D = Math.max(1, r.days);
    if (day > D) day = D;
    if (day < 1) day = 1;
    const st = dayState(r, day);
    set('sim-fac', facHTML(r));
    set('sim-scene', sceneHTML(r, st));
    set('sim-time', timeHTML(r));
    set('sim-today', todayHTML(r, st));
    const sl = $('#sim-day');
    if (sl) { sl.max = String(D); if (+sl.value !== day) sl.value = String(day); }
    const o = $('#sim-day-out');
    if (o) o.textContent = `${num(day)}. gün / ${num(D)}`;
  }
  function paint() {
    const r = compute(S);
    set('sim-out', outHTML(r));
    set('sim-detail', detailHTML(r));
    set('sh-fac', r.slots ? `Slot kirası ayda ${money(r.rent)}: aylık giderden ${money(r.rentFromMonthly)}, kurulumdan ${money(r.rentFromSetup)}. Cihazın sahibi bunu iş olsun olmasın öder.` : '');
    set('sh-mc', `İş olmasa da her ay: kira ${money(r.rent)} + sigorta ${money(r.ins)} + bakım ${money(r.maint)} = ${money(r.fixed)}.`);
    set('sh-op', `${r.overHours ? '<span class="neg">Vardiyalar günde 24 saati aşıyor, 24 saat alındı.</span> ' : ''}Cihaz iş olan günde ${nf1.format(r.hours)} saat çalışır. O günün gideri: operatör ${money(r.opDay)} + elektrik ${money(r.elecDay)} + takım ${money(r.toolDay)} = ${money(r.varDay)}.`);
    set('sh-jobs', r.over > 0
      ? `<span class="neg">İşler ${nf1.format(r.jobDays)} gün sürüyor, ayın ${num(r.days)} gününü ${nf1.format(r.over)} gün aşıyor. Aşan kısım bu aya sayılmadı.</span>`
      : `İşler ${nf1.format(r.jobDays)} gün sürüyor; ayın ${num(r.days)} gününün ${nf1.format(r.idle)} günü boş.`);
    set('sim-bar-m', `<span>Aylık kazanç <b class="${r.net < 0 ? 'neg' : ''}">${money(r.net)}</b></span><span>İş olmazsa <b class="neg">${money(-r.fixed)}</b></span><button type="button" class="as-btn" data-sim="goto">Sonuç</button>`);
    paintStage(r);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    const b = $('#sim-play'); if (b) b.textContent = 'Oynat';
  }
  function play() {
    if (timer) { stop(); return; }
    if (day >= Math.max(1, compute(S).days)) day = 1;
    timer = setInterval(() => {
      if (!document.getElementById('sim')) { stop(); return; }
      const r = compute(S);
      if (day >= Math.max(1, r.days)) { stop(); return; }
      day++; paintStage(r);
    }, 650);
    const b = $('#sim-play'); if (b) b.textContent = 'Durdur';
    paintStage(compute(S));
  }

  function view() {
    if (!S) S = load();
    stop();
    setTimeout(paint, 0);
    return `<section class="page-head"><h1>Simülasyon</h1>
        <p class="lead">Bir cihazın ayını gün gün izleyin. İş yokken cihazın sahibi yalnızca kira, sigorta ve bakım öder; iş geldiğinde operatör, elektrik ve takım gideri eklenir.</p></section>
      <section class="sim-stage" aria-label="Tesis ve cihaz">
        <div class="sim-fac" id="sim-fac"></div>
        <div class="sim-scene" id="sim-scene"></div>
        <div class="sim-time" id="sim-time"></div>
        <p class="sim-legend"><span><i class="own"></i>Yatırımcının işi</span><span><i class="platform"></i>Platformun işi</span><span><i class="idle"></i>Boş gün</span></p>
        <div class="sim-ctrl">
          <button type="button" class="btn btn-plain btn-sm" id="sim-play" data-sim="play">Oynat</button>
          <label class="sr-only" for="sim-day">Ayın günü</label>
          <input type="range" id="sim-day" min="1" max="26" step="1" value="${day}">
          <output id="sim-day-out" for="sim-day"></output>
        </div>
        <div class="sim-today" id="sim-today"></div>
      </section>
      <div class="calc" id="sim">
        <div class="calc-in">${inputsHTML()}</div>
        <aside class="calc-out" id="sim-out" aria-live="polite" aria-label="Aylık sonuç"></aside>
      </div>
      <section class="block" id="sim-detail"></section>
      <div class="calc-bar" id="sim-bar-m"></div>`;
  }

  /* ---------- olaylar ---------- */
  document.addEventListener('input', e => {
    const t = e.target;
    if (!S) return;
    if (t.id === 'sim-day') { day = +t.value || 1; paintStage(compute(S)); return; }
    if (!t.dataset || !t.dataset.s || t.tagName === 'SELECT' || !t.closest('#sim')) return;
    setPath(t.dataset.s, t.type === 'text' ? t.value : n0(t.value));
    save(); paint();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!S || t.tagName !== 'SELECT' || !t.dataset.s || !t.closest('#sim')) return;
    setPath(t.dataset.s, t.value);
    const m = t.dataset.s.match(/^jobs\.(\d+)\.source$/);
    if (m && S.jobs[+m[1]]) {
      const j = S.jobs[+m[1]];
      j.rate = n0(t.value === 'platform' ? S.ratePlatform : S.rateOwn);
      const rate = $(`[data-s="jobs.${m[1]}.rate"]`); if (rate) rate.value = String(j.rate);
    }
    save(); paint();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sim]');
    if (!b || !S) return;
    const a = b.dataset.sim;
    if (a === 'play') { play(); return; }
    if (a === 'goto') { const out = $('#sim-out'); if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    let focus = null;
    if (a === 'add') { S.jobs.push({ name: '', days: 5, revenue: 0, source: 'platform', rate: n0(S.ratePlatform) }); focus = `[data-s="jobs.${S.jobs.length - 1}.name"]`; }
    else if (a === 'del') S.jobs.splice(+b.dataset.i, 1);
    else if (a === 'reset') { if (!window.confirm('Girdiğiniz değerler silinip örnek değerlere dönülsün mü?')) return; S = defaults(SF.FACILITIES && SF.FACILITIES[0]); day = 1; }
    else return;
    save();
    const y = window.scrollY;
    P.render();
    window.scrollTo({ top: y });
    if (focus) { const el = $(focus); if (el) el.focus(); }
  });

  window.EmekSim = { view };
})();
