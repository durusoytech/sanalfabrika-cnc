/* Emek Sermaye · tanıtım sitesi etkileşimleri
   Rakamlar platformla aynı veri katmanından (data.js / Supabase) okunur. */
(function () {
  'use strict';
  const SF = window.SF, B = window.Backend;
  const DAY = SF.DAY;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfC = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const _u0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const _u2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const _pc = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 });
  const usd = v => _u0.format(v || 0);
  const usd2 = v => _u2.format(v || 0);
  const pct = v => _pc.format(v || 0);
  const num = v => nf0.format(v || 0);
  const usdC = v => {
    const a = Math.abs(v || 0);
    if (a >= 1e6) return '$' + nfC.format(a / 1e6) + ' Mn';
    if (a >= 1e5) return '$' + nf0.format(a / 1e3) + ' bin';
    if (a >= 1e3) return '$' + nfC.format(a / 1e3) + ' bin';
    return _u0.format(a);
  };
  const fDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fClock = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const setAll = (key, text) => $$(`[data-live="${key}"]`).forEach(el => { el.textContent = text; });
  const procMonths = () => SF.PROC_TOTAL_DAYS / 30.44;

  /* ---------- tema ve menü ---------- */
  const ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/></svg>';
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  try { const t = localStorage.getItem('sf-theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* depolama yok */ }
  const themeBtn = $('#theme-btn');
  const syncTheme = () => { themeBtn.innerHTML = isDark() ? ICON_SUN : ICON_MOON; };
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sf-theme', next); } catch (e) { /* depolama yok */ }
    syncTheme(); renderCalc();
  });
  syncTheme();

  const header = $('.site-header'), menuBtn = $('#menu-btn');
  menuBtn.addEventListener('click', () => {
    const open = !header.classList.contains('is-open');
    header.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
  });
  $$('#main-nav a').forEach(a => a.addEventListener('click', () => { header.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { header.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus(); } });

  /* ---------- makine çizimi ---------- */
  function machineArt(axes) {
    let inner, sy = 39;
    if (axes === 3) inner = '<rect class="m-table" x="15" y="31" width="54" height="17" rx="2"/><path d="M15 36h54M15 42.5h54" style="stroke:var(--m-glass);stroke-width:1.2"/>';
    else if (axes === 4) { inner = '<circle class="m-table" cx="42" cy="37" r="15"/><rect class="m-panel" x="35" y="30" width="14" height="14" rx="1.5"/>'; sy = 37; }
    else inner = '<rect class="m-table" x="16" y="28" width="52" height="22" rx="11"/><circle class="m-panel" cx="42" cy="39" r="8.5"/><circle class="m-table" cx="42" cy="39" r="4"/>';
    return `<svg viewBox="0 0 120 70" aria-hidden="true">
      <rect class="m-body" x="3" y="5" width="100" height="60" rx="7"/><rect class="m-glass" x="10" y="13" width="64" height="44" rx="4"/>${inner}
      <circle class="m-spindle" cx="42" cy="${sy}" r="3.6"/><circle class="m-ring" cx="42" cy="${sy}" r="7.5"/>
      <rect class="m-panel" x="80" y="13" width="16" height="27" rx="2"/><rect class="m-screen" x="82.5" y="16" width="11" height="8" rx="1"/>
      <rect class="m-edge" x="80" y="45" width="16" height="13" rx="2"/><rect class="m-body" x="104" y="34" width="13" height="26" rx="2"/>
      <circle class="m-light" cx="110.5" cy="8.5" r="3.2"/><circle class="m-light on-run" cx="110.5" cy="16.5" r="3.2"/><circle class="m-light" cx="110.5" cy="24.5" r="3.2"/></svg>`;
  }

  /* ---------- sabit rakamlar ---------- */
  let util30 = 0.72, util7 = 0.74, util7At = 0;
  function renderStatic() {
    setAll('factories', String(SF.FACTORIES.length));
    setAll('slots', String(SF.FACTORIES.length * SF.SLOTS.length));
    setAll('fee-own', '%' + nf0.format(SF.FEES.own * 100));
    setAll('fee-platform', '%' + nf0.format(SF.FEES.platform * 100));
    const minInvest = Math.min(...Object.values(SF.TYPES).map(t => t.price + t.installFee));
    setAll('min-invest', usd(minInvest));
    const now = Date.now();
    const act = SF.MACHINES.filter(m => !m.proc);
    if (act.length) {
      util30 = act.reduce((a, m) => a + SF.windowStats(m, Math.max(now - 30 * DAY, m.commission), now).util, 0) / act.length;
      setAll('util-num', nf0.format(util30 * 100));
    }
    setAll('year', String(new Date().getFullYear()));
    const chip = $('[data-live="mode"]');
    if (chip) { chip.textContent = SF.mode === 'live' ? 'Canlı veri' : 'Demo verisi'; chip.classList.toggle('is-live', SF.mode === 'live'); }
  }

  /* ---------- açılıştaki canlı panel ---------- */
  let liveIds = null;
  function pickLiveMachines(now) {
    const running = SF.MACHINES.filter(m => !m.proc && SF.statusAt(m, now) === 'running');
    const out = [], axesSeen = new Set();
    for (const m of running) { if (!axesSeen.has(m.axes)) { out.push(m.id); axesSeen.add(m.axes); } }
    for (const m of running) { if (out.length >= 4) break; if (!out.includes(m.id)) out.push(m.id); }
    return out.slice(0, 4);
  }
  const STATUS = { running: 'Kesimde', setup: 'Ayar', idle: 'Boşta', maint: 'Bakımda' };
  function liveTick() {
    const now = Date.now();
    const act = SF.MACHINES.filter(m => !m.proc);
    const running = act.filter(m => SF.statusAt(m, now) === 'running').length;
    setAll('running', String(running));
    setAll('active', String(act.length));
    setAll('clock', fClock.format(now));
    let parts = 0;
    SF.FACTORIES.forEach(f => { if (f.status === 'active') parts += SF.factoryLive(f.id, now).partsToday; });
    setAll('parts', num(parts));
    if (now - util7At > 30000 && act.length) {
      util7 = act.reduce((a, m) => a + SF.windowStats(m, Math.max(now - 7 * DAY, m.commission), now).util, 0) / act.length;
      util7At = now;
    }
    setAll('util', pct(util7));
    if (!liveIds || liveIds.some(id => { const m = SF.machine(id); return !m || SF.statusAt(m, now) === 'idle'; })) liveIds = pickLiveMachines(now);
    const list = $('[data-live="list"]');
    if (!list) return;
    list.innerHTML = liveIds.map(id => {
      const m = SF.machine(id); const st = SF.statusAt(m, now); const j = SF.jobAt(m, now);
      const isJob = j && j.kind === 'job';
      const done = isJob ? SF.partsDone(j, now) : 0;
      const prog = isJob ? (st === 'setup' ? 0 : done / j.qty) : 0;
      const f = SF.factory(m.factory);
      return `<li><i class="lamp ${st}" aria-hidden="true"></i>
        <span class="lm"><b>${esc(isJob ? j.part : (j ? j.title : STATUS[st]))}</b><small>${esc(f.short)} ${m.slot} · ${m.axes} eksen · ${STATUS[st] || ''}</small></span>
        <span class="lc">${isJob ? `<b>${done}</b>/${j.qty}` : '—'}</span>
        <span class="bar"><span style="width:${(prog * 100).toFixed(1)}%"></span></span></li>`;
    }).join('');
  }

  /* ---------- bir dakikanın anatomisi ---------- */
  const an = { axes: 4, source: 'own' };
  function renderAnatomy() {
    const T = SF.TYPES[an.axes]; if (!T) return;
    const p = SF.perMinute(an.axes, an.source);
    const other = SF.perMinute(an.axes, an.source === 'own' ? 'platform' : 'own');
    const feePct = nf0.format(SF.FEES[an.source] * 100);
    const items = SF.COST_KEYS.map(k => `<li><span>${SF.COST_LABELS[k]}</span><b>${usd2(T.cost[k])}/dk</b><small>${SF.COST_HINTS[k]}</small></li>`).join('');
    $('#anatomy').innerHTML = `
      <div>
        <div class="an-rate"><b>${usd2(T.rate)}</b><span>müşterinin ${an.axes} eksen ${esc(T.code)} için bir dakikalık üretime ödediği ücret</span></div>
        <div class="an-bar" role="img" aria-label="İşletme ${usd2(p.op)}, platform payı ${usd2(p.fee)}, size kalan ${usd2(p.net)}">
          <span class="s-op" style="flex:${p.op} 1 0">${p.op / T.rate > 0.16 ? usd2(p.op) : ''}</span>
          <span class="s-fee" style="flex:${p.fee} 1 0">${p.fee / T.rate > 0.12 ? usd2(p.fee) : ''}</span>
          <span class="s-net" style="flex:${p.net} 1 0">${usd2(p.net)}</span>
        </div>
        <div class="an-legend">
          <span><i class="key key-cost"></i>İşletme ücreti <b>${usd2(p.op)}</b></span>
          <span><i class="key key-fee"></i>Platform payı %${feePct} <b>${usd2(p.fee)}</b></span>
          <span><i class="key key-net"></i>Size kalan <b>${usd2(p.net)}</b></span>
        </div>
        <ul class="an-costs" aria-label="İşletme ücretinin kalemleri">${items}</ul>
      </div>
      <aside class="an-summary">
        <div class="big"><span>Dakika başına size kalan</span><b>${usd2(p.net)}</b></div>
        <dl>
          <dt>Saatte</dt><dd>${usd2(p.net * 60)}</dd>
          <dt>8 saatlik bir vardiyada</dt><dd>${usd(p.net * 480)}</dd>
          <dt>Dakika ücretindeki payınız</dt><dd>${pct(p.net / T.rate)}</dd>
        </dl>
        <p>${an.source === 'own'
          ? `Aynı dakika, işi platform bulsaydı size ${usd2(other.net)} bırakırdı. Kendi müşterinizi getirmek dakika başına ${usd2(p.net - other.net)} fark yaratır.`
          : `Aynı dakika, işi siz getirseydiniz size ${usd2(other.net)} bırakırdı. Platform bu farkla müşteri bulma, teklif ve sipariş yönetimini üstlenir.`}</p>
      </aside>`;
  }
  function bindSeg(id, key, state, after) {
    const box = $(id);
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset[key];
      state[key] = key === 'axes' ? +v : v;
      $$('button', box).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      after();
    });
  }
  bindSeg('#an-axes', 'axes', an, renderAnatomy);
  bindSeg('#an-source', 'source', an, renderAnatomy);

  /* ---------- makine kartları ---------- */
  const PROFILE = { 3: 'Giriş seviyesi', 4: 'Seri üretim', 5: 'Yüksek katma değer' };
  function renderMachines() {
    const pm = procMonths();
    $('#machines').innerHTML = [3, 4, 5].filter(a => SF.TYPES[a]).map(ax => {
      const T = SF.TYPES[ax];
      const pr = SF.projectMonthly(ax, 0.7, 0.5);
      const payback = pm + pr.invest / pr.net;
      return `<article class="card machine${ax === 4 ? ' is-featured' : ''}">
        <div class="machine-top"><span class="axis-badge">${ax}X</span><span class="badge-soft">${PROFILE[ax]}</span></div>
        <div><h3>${ax} eksen CNC</h3><p class="fam">${esc(T.code)} · ${esc(T.family)}</p></div>
        <div class="machine-art">${machineArt(ax)}</div>
        <div class="price"><b>${usd(T.price)}</b><span>+ ${usd(T.installFee)} nakliye, kurulum ve kalibrasyon</span></div>
        <div class="mrow">
          <div><span>Dakika ücreti</span><b>${usd2(T.rate)}</b></div>
          <div><span>İşletme ücreti</span><b>${usd2(T.opRate)}</b></div>
          <div><span>Toplam yatırım</span><b>${usdC(pr.invest)}</b></div>
        </div>
        <p style="font-size:15px;color:var(--ink-2)">${esc(T.blurb)}</p>
        <ul>${T.uses.map(u => `<li>${esc(u)}</li>`).join('')}</ul>
        <dl>${T.specs.slice(0, 3).map(s => `<dt>${esc(s[0])}</dt><dd>${esc(s[1])}</dd>`).join('')}</dl>
        <div class="machine-est">
          <div><span>Tahmini aylık net</span><b class="net">${usd(pr.net)}</b></div>
          <div style="text-align:right"><span>Geri dönüş</span><b>≈ ${nf1.format(payback)} ay</b></div>
        </div>
        <div class="machine-actions">
          <button class="btn btn-outline" type="button" data-calc="${ax}">Hesapla</button>
          <a class="btn btn-primary" href="platform.html#fabrikalar">Boş slotları gör</a>
        </div>
      </article>`;
    }).join('');
  }
  $('#machines').addEventListener('click', e => {
    const b = e.target.closest('[data-calc]'); if (!b) return;
    calc.axes = +b.dataset.calc;
    $$('#calc-axes button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.axes === calc.axes)));
    renderCalc();
    $('#hesapla').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  /* ---------- kazanç hesaplayıcı ---------- */
  const calc = { axes: 4, count: 1, util: 0.7, own: 0.5 };
  bindSeg('#calc-axes', 'axes', calc, renderCalc);
  [['#calc-count', 'count', v => v, v => String(v)], ['#calc-util', 'util', v => v / 100, v => pct(v)], ['#calc-own', 'own', v => v / 100, v => pct(v)]].forEach(([sel, key, conv, show]) => {
    const el = $(sel);
    el.addEventListener('input', () => { calc[key] = conv(+el.value); $(sel + '-v').textContent = show(calc[key]); renderCalc(); });
  });

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function renderCalc() {
    if (!SF.TYPES[calc.axes]) return;
    const pr = SF.projectMonthly(calc.axes, calc.util, calc.own);
    const k = calc.count;
    const net = pr.net * k, invest = pr.invest * k, pm = procMonths();
    const payback = net > 0 ? pm + invest / net : Infinity;
    $('#calc-net').textContent = usd(net);
    $('#calc-payback').textContent = isFinite(payback) ? `${nf1.format(payback)} ay` : '—';
    const lines = [
      ['Toplam yatırım', usd(invest)],
      ['Aylık brüt gelir', usd(pr.gross * k)],
      ['Aylık işletme gideri', usd(pr.op * k)],
      ['Aylık platform payı', usd(pr.fee * k)],
      ['Yıllık net kazanç', usd(net * 12)],
      ['Aylık çalışma', `${num(pr.minutes / 60 * k)} saat`]
    ];
    $('#calc-lines').innerHTML = lines.map(l => `<div><dt>${l[0]}</dt><dd>${l[1]}</dd></div>`).join('');
    const cum = t => Math.max(0, t - pm) * net;
    $('#calc-milestones').innerHTML = [12, 24, 36, 60].map(t => `${t}. ayda birikimli net <b>${usd(cum(t))}</b>`).join(' · ');
    drawCalcChart(net, invest, pm, payback);
  }

  function drawCalcChart(net, invest, pm, payback) {
    const box = $('#calc-chart');
    const W = Math.max(280, box.clientWidth || 600), H = 250;
    const m = { l: 62, r: 14, t: 18, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const horizon = Math.min(72, Math.max(36, Math.ceil((isFinite(payback) ? payback * 1.4 : 36) / 12) * 12));
    const cum = t => Math.max(0, t - pm) * net;
    const ymaxRaw = Math.max(invest * 1.15, cum(horizon));
    const step = niceStep(ymaxRaw / 4), ymax = Math.ceil(ymaxRaw / step) * step;
    const x = t => m.l + (t / horizon) * pw, y = v => m.t + ph - (v / ymax) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Birikimli net kazanç ve toplam yatırım, ${horizon} ay">`;
    s += `<rect class="proc-zone" x="${x(0)}" y="${m.t}" width="${x(pm) - x(0)}" height="${ph}"/>`;
    s += `<text x="${x(0) + 6}" y="${m.t + 14}">Tedarik</text>`;
    for (let v = 0; v <= ymax + 1e-6; v += step) {
      s += `<line class="${v === 0 ? 'axis-line' : 'grid-line'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${usdC(v)}</text>`;
    }
    for (let t = 0; t <= horizon; t += 12) s += `<text x="${x(t)}" y="${H - 8}" text-anchor="${t === 0 ? 'start' : t === horizon ? 'end' : 'middle'}">${t === 0 ? 'Sipariş' : t + '. ay'}</text>`;
    const pts = []; for (let t = 0; t <= horizon; t += 0.25) pts.push([x(t), y(cum(t))]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    s += `<path d="${line}L${x(horizon)},${y(0)}L${x(0)},${y(0)}Z" style="fill:var(--c-net);opacity:.1"/>`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(invest)}" y2="${y(invest)}" style="stroke:var(--ink-2);stroke-width:1.5;stroke-dasharray:6 4"/>`;
    const invLabel = `Yatırım ${usdC(invest)}`, invX = x(pm) + 8;
    const limitX = isFinite(payback) && payback <= horizon ? x(payback) - 14 : W - m.r;
    if (invX + invLabel.length * 6.8 < limitX) s += `<text x="${invX}" y="${y(invest) - 8}" text-anchor="start" class="lbl-strong">${invLabel}</text>`;
    s += `<path d="${line}" style="fill:none;stroke:var(--c-net);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round"/>`;
    if (isFinite(payback) && payback <= horizon) {
      const px = x(payback), py = y(invest);
      s += `<circle cx="${px}" cy="${py}" r="6" style="fill:var(--c-net);stroke:var(--surface);stroke-width:2.5"/>`;
      const anchor = px > W * 0.7 ? 'end' : 'start';
      s += `<text x="${px + (anchor === 'end' ? -10 : 10)}" y="${py + 20}" text-anchor="${anchor}" class="lbl-strong">Geri dönüş ${nf1.format(payback)}. ay</text>`;
    }
    s += `<line class="hover-line" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" visibility="hidden"/>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent" class="hit" tabindex="0" aria-label="Grafikte ay seçin"/>`;
    s += '</svg><div class="chart-tip" hidden></div>';
    box.innerHTML = s;
    const hit = $('.hit', box), hl = $('.hover-line', box), tip = $('.chart-tip', box);
    const show = (clientX) => {
      const r = hit.getBoundingClientRect();
      const t = Math.max(0, Math.min(horizon, Math.round(((clientX - r.left) / r.width) * horizon)));
      hl.setAttribute('x1', x(t)); hl.setAttribute('x2', x(t)); hl.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = `<b>${t === 0 ? 'Sipariş anı' : t + '. ay'}</b>
        <div class="r"><span><i class="key key-net"></i>Birikimli net</span><b>${usd(cum(t))}</b></div>
        <div class="r"><span><i class="key key-line"></i>Toplam yatırım</span><b>${usd(invest)}</b></div>
        <div class="r"><span>Geri dönen</span><b>${pct(Math.min(1, cum(t) / invest))}</b></div>`;
      const left = (x(t) / W) * box.clientWidth;
      tip.style.left = Math.min(box.clientWidth - tip.offsetWidth, Math.max(0, left + 12)) + 'px';
      tip.style.top = '8px';
    };
    const hide = () => { hl.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    hit.addEventListener('pointermove', e => show(e.clientX));
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', () => { const r = hit.getBoundingClientRect(); show(r.left + r.width * Math.min(1, (isFinite(payback) ? payback : 12) / horizon)); });
    hit.addEventListener('blur', hide);
  }

  /* ---------- tesisler ---------- */
  function renderFactories() {
    const now = Date.now();
    const html = SF.FACTORIES.map(f => {
      const ms = SF.machinesIn(f.id);
      const active = ms.filter(m => !m.proc).length, proc = ms.length - active, empty = SF.SLOTS.length - ms.length;
      const cells = SF.SLOTS.map(sl => { const m = SF.machineAt(f.id, sl); return `<i class="${!m ? 'is-empty' : m.proc ? 'is-proc' : ''}" title="${sl}"></i>`; }).join('');
      const L = SF.factoryLive(f.id, now);
      const status = f.status === 'active'
        ? '<span class="status"><i class="lamp on" aria-hidden="true"></i>Üretimde</span>'
        : `<span class="status"><i class="lamp" style="background:var(--s-proc)" aria-hidden="true"></i>Kurulumda</span>`;
      const stats = f.status === 'active'
        ? `<div><dt>Dolu slot</dt><dd>${active}/${SF.SLOTS.length}</dd></div><div><dt>Şu an kesimde</dt><dd>${L.counts.running}</dd></div>
           <div><dt>7 günlük doluluk</dt><dd>${pct(L.util7)}</dd></div><div><dt>Bugün üretilen parça</dt><dd>${num(L.partsToday)}</dd></div>`
        : `<div><dt>Ön sipariş</dt><dd>${proc}/${SF.SLOTS.length}</dd></div><div><dt>Açılış</dt><dd>${f.openAt ? fDate.format(f.openAt).replace(/ \d{4}$/, '') : '—'}</dd></div>
           <div><dt>Kapalı alan</dt><dd>${num(f.area)} m²</dd></div><div><dt>Enerji kapasitesi</dt><dd>${num(f.powerKva)} kVA</dd></div>`;
      const cta = empty > 0 ? `${f.status === 'active' ? 'Boş slotları gör' : 'Ön sipariş ver'} (${empty})` : 'Zemin planını gör';
      return `<article class="card factory">
        <div class="factory-top"><span class="factory-code">${esc(f.code)} · ${esc(f.city)}</span>${status}</div>
        <div><h3>${esc(f.name)}</h3><p class="city">${esc(f.lead)}</p></div>
        <div class="slotbar" role="img" aria-label="${active} üretimde, ${proc} tedarikte, ${empty} boş slot">${cells}</div>
        <dl class="fstats">${stats}</dl>
        <a class="btn ${empty > 0 ? 'btn-primary' : 'btn-outline'}" href="platform.html#fabrikalar">${cta}</a>
      </article>`;
    }).join('');
    $('#factories').innerHTML = html + `<div class="slot-legend" style="grid-column:1/-1"><span><i style="background:var(--ink-2)"></i>Üretimde</span><span><i style="background:repeating-linear-gradient(45deg,var(--s-proc) 0 2px,transparent 2px 4px);box-shadow:inset 0 0 0 1px var(--s-proc)"></i>Tedarikte</span><span><i style="box-shadow:inset 0 0 0 1.5px var(--line-strong)"></i>Boş slot</span></div>`;
  }

  /* ---------- duyurular ---------- */
  function renderNews() {
    const now = Date.now();
    const izm = SF.FACTORIES.find(f => f.status === 'building');
    const izmProc = izm ? SF.machinesIn(izm.id).length : 0;
    const full = SF.FACTORIES.find(f => f.status === 'active' && SF.machinesIn(f.id).length >= SF.SLOTS.length);
    const items = [];
    if (izm) items.push({ d: now - 3 * DAY, tag: 'Tesis', t: `${izm.name} ön siparişe açıldı`, p: `${num(izm.area)} m² kapalı alana sahip yeni tesisimizde 10 slotun ${izmProc} tanesi ön siparişle doldu. Tesisin ${izm.openAt ? fDate.format(izm.openAt) : 'yakın zamanda'} itibarıyla üretime başlaması planlanıyor.` });
    items.push({ d: now - 12 * DAY, tag: 'Platform', t: 'Canlı izleme ve NC programı görünümü yayında', p: 'Yatırımcılar artık makinelerinin kesim sırasındaki eksen konumlarını, iş mili yükünü, çalışan NC programını ve parça sayacını platformdan izleyebiliyor.' });
    if (full) items.push({ d: now - 26 * DAY, tag: 'Tesis', t: `${full.name} tam kapasiteye ulaştı`, p: `${full.short} tesisindeki 10 slotun tamamı doldu. Yeni yatırımcılar için boş slotlar diğer tesislerimizde bulunuyor.` });
    items.push({ d: now - 41 * DAY, tag: 'Getiri modeli', t: 'Dakika ücretinin kalem kalem dökümü platforma eklendi', p: 'Her makinenin dakika ücretinin operatör, elektrik, bakım, takım, tesis ve sigorta kalemlerine nasıl dağıldığı makine detayında görünüyor.' });
    $('#news').innerHTML = items.map(n => `<li><time datetime="${new Date(n.d).toISOString().slice(0, 10)}">${fDate.format(n.d)}</time>
      <div><span class="tag">${esc(n.tag)}</span><h3>${esc(n.t)}</h3><p>${esc(n.p)}</p></div></li>`).join('');
  }

  function renderAll() {
    renderStatic(); renderAnatomy(); renderMachines(); renderCalc(); renderFactories(); renderNews(); liveTick();
  }
  renderAll();
  setInterval(liveTick, 1000);
  setInterval(renderFactories, 30000);
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderCalc, 150); });

  if (B && B.enabled) {
    B.init().then(() => { liveIds = null; renderAll(); }).catch(err => console.warn('Emek Sermaye: veritabanına bağlanılamadı, demo verisi gösteriliyor.', err));
  }
})();
