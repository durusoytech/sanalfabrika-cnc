/* Emek Sermaye · tanıtım sitesi
   Fiyat, ücret, süre ve haberleri Firestore'dan okur (giriş gerektirmeyen REST çağrısıyla, SDK yüklemeden).
   HTML'deki değerler varsayılandır; veri geldiğinde güncellenir, gelmezse sayfa olduğu gibi kalır. */
(function () {
  'use strict';
  const SF = window.SF;
  if (!SF) return;
  const cfg = (window.EMEK_CONFIG || {}).firebase || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfC = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const _u0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const _u2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const usd = v => _u0.format(v || 0);
  const usd2 = v => _u2.format(v || 0);
  const pct = v => '%' + nf0.format((v || 0) * 100);
  const set = (key, text) => $$(`[data-v="${key}"]`).forEach(el => { el.textContent = text; });

  const state = { util: 0.7, own: 0.5 };
  const AXES = () => [3, 4, 5].filter(a => SF.TYPES[a]);
  const procMonths = () => SF.PROC_TOTAL_DAYS / 30.44;

  /* ---------- makine tablosu ---------- */
  function renderMachines() {
    const pm = procMonths();
    $('#machines').innerHTML = AXES().map(ax => {
      const T = SF.TYPES[ax];
      const pr = SF.projectMonthly(ax, state.util, state.own);
      const payback = pr.net > 0 ? pm + pr.invest / pr.net : Infinity;
      return `<tr><th scope="row"><b>${ax} eksen</b><small>${esc(T.family)}</small></th>
        <td>${usd(pr.invest)}</td><td class="opt">${usd2(T.rate)}</td>
        <td class="strong">${usd(pr.net)}</td><td>${isFinite(payback) ? nf1.format(payback) + ' ay' : '—'}</td></tr>`;
    }).join('');
  }

  /* ---------- bir dakikanın paylaşımı ---------- */
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

  /* ---------- sık sorulan sorulardaki rakamlar ---------- */
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

  /* ---------- haberler ---------- */
  function renderNews(items) {
    if (!items.length) return;
    $('#news').innerHTML = items.slice(0, 4).map(n => {
      const img = n.image && n.image.src ? n.image : null;
      const body = Array.isArray(n.body) && n.body.length ? n.body : (n.summary ? [n.summary] : []);
      const credit = img && (img.representative || img.credit)
        ? `<small class="credit">${img.representative ? 'Temsili görsel' : ''}${img.representative && img.credit ? ' · ' : ''}${img.credit ? `Fotoğraf: ${img.sourceUrl ? `<a href="${esc(img.sourceUrl)}" target="_blank" rel="noopener">${esc(img.credit)}</a>` : esc(img.credit)}${img.license ? ', ' + esc(img.license) : ''}` : ''}</small>`
        : '';
      const when = n.publishedAt ? new Date(n.publishedAt) : null;
      return `<article class="news-item${img ? ' has-photo' : ''}">
        ${img ? `<a class="news-photo" href="platform.html#tesisler" tabindex="-1" aria-hidden="true"><img src="${esc(img.src)}" width="1280" height="852" loading="lazy" alt=""></a>` : ''}
        <div class="news-text">
          ${when ? `<time datetime="${when.toISOString().slice(0, 10)}">${fDate.format(when)}</time>` : ''}
          <h3>${esc(n.title)}</h3>
          ${body.map(p => `<p>${esc(p)}</p>`).join('')}
          ${n.facilityId ? '<p><a href="platform.html#tesisler">Tesisi platformda görün</a></p>' : ''}
          ${credit}
        </div></article>`;
    }).join('');
  }

  /* ---------- Firestore'dan okuma ---------- */
  function decode(v) {
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return Date.parse(v.timestampValue);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
    if ('mapValue' in v) return fields(v.mapValue.fields);
    return undefined;
  }
  const fields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decode(v)]));
  const docOf = d => Object.assign({ id: d.name.split('/').pop() }, fields(d.fields));
  async function list(path) {
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${path}?pageSize=50&key=${cfg.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return ((await r.json()).documents || []).map(docOf);
  }
  async function loadLive() {
    if (!cfg.projectId || !cfg.apiKey) return;
    const [types, config, news] = await Promise.all([list('machineTypes'), list('config'), list('news')]);
    const pricing = config.find(d => d.id === 'pricing'), procurement = config.find(d => d.id === 'procurement');
    SF.setConfig({
      types, fees: pricing ? pricing.fees : null, depositRate: pricing ? pricing.depositRate : null,
      steps: procurement ? procurement.steps : null
    });
    renderAll();
    renderNews(news.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)));
  }

  /* ---------- doluluk varsayımı ---------- */
  const util = $('#util'), utilOut = $('#util-v');
  util.addEventListener('input', () => {
    state.util = +util.value / 100;
    utilOut.textContent = pct(state.util);
    renderMachines();
  });

  /* ---------- sayfa içi bağlantı bir soruya gidiyorsa o soruyu aç ---------- */
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
  loadLive().catch(err => console.warn('Emek Sermaye: güncel veriler okunamadı, varsayılan değerler gösteriliyor.', err));
})();
