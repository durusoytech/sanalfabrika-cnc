/* Emek Sermaye · tanıtım sitesi
   Sayfadaki fiyat, ücret ve süreler platformla aynı veri katmanından (data.js / Supabase) okunur.
   HTML'deki değerler varsayılandır; bu betik onları güncel değerlerle değiştirir. */
(function () {
  'use strict';
  const SF = window.SF, B = window.Backend;
  if (!SF) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfC = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const _u0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const _u2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = v => _u0.format(v || 0);
  const usd2 = v => _u2.format(v || 0);
  const pct = v => '%' + nf0.format((v || 0) * 100);
  const set = (key, text) => $$(`[data-v="${key}"]`).forEach(el => { el.textContent = text; });

  const state = { util: 0.7, own: 0.5 };
  const AXES = () => [3, 4, 5].filter(a => SF.TYPES[a]);
  const procMonths = () => SF.PROC_TOTAL_DAYS / 30.44;

  /* makine tablosu */
  function renderMachines() {
    const pm = procMonths();
    $('#machines').innerHTML = AXES().map(ax => {
      const T = SF.TYPES[ax];
      const pr = SF.projectMonthly(ax, state.util, state.own);
      const payback = pr.net > 0 ? pm + pr.invest / pr.net : Infinity;
      return `<tr><th scope="row"><b>${ax} eksen</b><small>${esc(String(T.family).split(' · ')[0])}</small></th>
        <td>${usd(pr.invest)}</td><td class="opt">${usd2(T.rate)}</td>
        <td class="strong">${usd(pr.net)}</td><td>${isFinite(payback) ? nf1.format(payback) + ' ay' : '—'}</td></tr>`;
    }).join('');
  }

  /* bir dakikanın paylaşımı */
  function renderSplit() {
    const ax = SF.TYPES[4] ? 4 : AXES()[0];
    if (!ax) return;
    const T = SF.TYPES[ax];
    const own = SF.perMinute(ax, 'own'), pl = SF.perMinute(ax, 'platform');
    set('split-name', `${ax} eksen tezgâhta`);
    set('split-rate', usd2(T.rate));
    set('split-op', usd2(own.op));
    set('split-fee', usd2(own.fee));
    set('split-net', usd2(own.net));
    set('split-share', pct(own.net / T.rate));
    set('split-net-platform', usd2(pl.net));
    const bar = $('#split-bar').children;
    [own.op, own.fee, own.net].forEach((v, i) => { bar[i].style.flexGrow = String(Math.max(0.5, v / T.rate * 100)); });
  }

  /* sık sorulan sorulardaki rakamlar */
  function renderFacts() {
    set('fee-own', pct(SF.FEES.own));
    set('fee-platform', pct(SF.FEES.platform));
    AXES().forEach(a => set('invest-' + a, usd(SF.TYPES[a].price + SF.TYPES[a].installFee)));
    set('proc-days', String(SF.PROC_TOTAL_DAYS));
    set('proc-months', nfC.format(procMonths()));
    $('#proc-steps').innerHTML = SF.PROC_STEPS.filter(s => s.days > 0)
      .map(s => `<li>${esc(String(s.label).replace(' & ', ' ve '))}: ${s.days} gün</li>`).join('');
    const axes = AXES();
    if (axes.length === 3) {
      $('#costs').innerHTML = SF.COST_KEYS.map(k =>
        `<tr><th scope="row">${esc(SF.COST_LABELS[k])}</th>${axes.map(a => `<td>${usd2(SF.TYPES[a].cost[k])}</td>`).join('')}</tr>`
      ).join('') + `<tr class="total"><th scope="row">Toplam</th>${axes.map(a => `<td>${usd2(SF.TYPES[a].opRate)}</td>`).join('')}</tr>`;
    }
    set('year', String(new Date().getFullYear()));
  }

  function renderAll() { renderMachines(); renderSplit(); renderFacts(); }

  /* doluluk varsayımı */
  const util = $('#util'), utilOut = $('#util-v');
  util.addEventListener('input', () => {
    state.util = +util.value / 100;
    utilOut.textContent = pct(state.util);
    renderMachines();
  });

  /* sayfa içi bağlantı bir soruya gidiyorsa o soruyu aç */
  function openTarget(id) {
    const el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a) openTarget(a.getAttribute('href').slice(1));
  });
  openTarget(location.hash.slice(1));

  renderAll();
  if (B && B.enabled) {
    B.init().then(renderAll).catch(err => console.warn('Emek Sermaye: veritabanına bağlanılamadı, varsayılan değerler gösteriliyor.', err));
  }
})();
