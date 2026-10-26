/* SanalFabrika · uygulama: görünümler, etkileşimler, canlı güncelleme */
(function () {
  'use strict';
  const SF = window.SF, Charts = window.Charts, Live = window.Live;
  const { MIN, HOUR, DAY } = SF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- biçimlendirme ---------- */
  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const _u0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const _u2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const _pc = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 });
  const usd = v => _u0.format(v || 0);
  const usd2 = v => _u2.format(v || 0);
  const nfC = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const usdC = v => {
    const a = Math.abs(v || 0), sg = v < 0 ? '−' : '';
    if (a >= 1e6) return sg + '$' + nfC.format(a / 1e6) + ' Mn';
    if (a >= 1e5) return sg + '$' + nf0.format(a / 1e3) + ' bin';
    if (a >= 1e3) return sg + '$' + nfC.format(a / 1e3) + ' bin';
    return sg + _u0.format(a);
  };
  const pct = v => _pc.format(v || 0);
  const num = v => nf0.format(v || 0);
  const F = o => new Intl.DateTimeFormat('tr-TR', o);
  const fTime = F({ hour: '2-digit', minute: '2-digit' });
  const fDay = F({ day: 'numeric', month: 'short' });
  const fDayY = F({ day: 'numeric', month: 'short', year: 'numeric' });
  const fFull = F({ day: 'numeric', month: 'long', year: 'numeric' });
  const fWd = F({ weekday: 'short' });
  const fMonth = F({ month: 'long', year: 'numeric' });
  const fMonS = F({ month: 'short' });
  const fClock = F({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayLabel = t => `${fWd.format(t)} ${fDay.format(t)}`;
  function whenShort(t) {
    const diff = Math.round((SF.startOfDay(t) - SF.startOfDay(Date.now())) / DAY);
    const tm = fTime.format(t);
    if (diff === 0) return 'Bugün ' + tm;
    if (diff === 1) return 'Yarın ' + tm;
    if (diff === -1) return 'Dün ' + tm;
    if (Math.abs(diff) < 6) return fWd.format(t) + ' ' + tm;
    return fDay.format(t) + ' ' + tm;
  }
  function dur(min) {
    min = Math.max(0, Math.round(min));
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d) return `${d} g ${h} sa`;
    if (h) return `${h} sa ${m} dk`;
    return `${m} dk`;
  }
  const hrs = min => nf0.format(min / 60) + ' sa';
  const cap = s => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);

  /* ---------- durum ---------- */
  const VIEWS = ['fabrikalar', 'makinelerim', 'analiz'];
  const state = {
    view: 'fabrikalar', factory: 'brs', mineOnly: false,
    period: 'today', splitAxes: 4,
    an: { month: SF.startOfMonth(Date.now()), machine: 'all', table: false },
    drawer: null, wiz: null
  };
  let liveCtl = null;

  /* ---------- simgeler ---------- */
  const ICON = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/></svg>'
  };

  /* ---------- makine çizimi (üstten görünüş) ---------- */
  function machineArt(axes, status, cls) {
    cls = cls || 'slot-art';
    if (status === 'proc' || status === 'ghost') {
      return `<svg class="${cls}" viewBox="0 0 120 70" aria-hidden="true">
        <rect class="m-ghost" x="3" y="5" width="100" height="60" rx="7"/>
        <rect class="m-ghost" x="10" y="13" width="64" height="44" rx="4"/>
        <rect class="m-ghost" x="80" y="13" width="16" height="28" rx="2"/>
        <rect class="m-ghost" x="104" y="34" width="13" height="26" rx="2"/>
        <text x="42" y="39" text-anchor="middle" style="fill:var(--muted);font:600 9px var(--font-mono)">${axes}X</text>
      </svg>`;
    }
    let inner, sy = 39;
    if (axes === 3) inner = '<rect class="m-table" x="15" y="31" width="54" height="17" rx="2"/><path d="M15 36h54M15 42.5h54" style="stroke:var(--m-glass);stroke-width:1.2"/>';
    else if (axes === 4) { inner = '<circle class="m-table" cx="42" cy="37" r="15"/><rect class="m-panel" x="35" y="30" width="14" height="14" rx="1.5"/>'; sy = 37; }
    else { inner = '<rect class="m-table" x="16" y="28" width="52" height="22" rx="11"/><circle class="m-panel" cx="42" cy="39" r="8.5"/><circle class="m-table" cx="42" cy="39" r="4"/>'; }
    return `<svg class="${cls} ${status === 'running' ? 'is-running' : ''}" viewBox="0 0 120 70" aria-hidden="true">
      <rect class="m-body" x="3" y="5" width="100" height="60" rx="7"/>
      <rect class="m-glass" x="10" y="13" width="64" height="44" rx="4"/>
      ${inner}
      <circle class="m-spindle" cx="42" cy="${sy}" r="3.6"/>
      <circle class="m-ring" cx="42" cy="${sy}" r="7.5"/>
      <rect class="m-panel" x="80" y="13" width="16" height="27" rx="2"/>
      <rect class="m-screen" x="82.5" y="16" width="11" height="8" rx="1"/>
      <rect class="m-edge" x="80" y="45" width="16" height="13" rx="2"/>
      <rect class="m-body" x="104" y="34" width="13" height="26" rx="2"/>
      <circle class="m-light ${status === 'setup' ? 'on-setup' : ''}" cx="110.5" cy="8.5" r="3.2"/>
      <circle class="m-light ${status === 'running' ? 'on-run' : ''}" cx="110.5" cy="16.5" r="3.2"/>
      <circle class="m-light ${status === 'maint' ? 'on-maint' : ''}" cx="110.5" cy="24.5" r="3.2"/>
    </svg>`;
  }
  const statusPill = st => `<span class="st st-${st}"><i class="lamp"></i>${SF.STATUS_LABEL[st]}</span>`;
  const axisBadge = ax => `<span class="axis-badge" data-ax="${ax}">${ax}X</span>`;
  const srcTag = s => `<span class="src"><i class="key key-${s}"></i>${SF.SOURCE_LABEL[s]}</span>`;
  const ownerTag = m => m.mine ? '<span class="chip chip-mine">Sizin</span>' : `<span class="slot-owner">Yatırımcı ${esc(m.owner)}</span>`;
  const splitBar = (op, fee, net) => {
    const t = op + fee + net || 1;
    return `<div class="split-bar" role="img" aria-label="İşletme ${usd(op)}, platform payı ${usd(fee)}, net ${usd(net)}">
      <span class="s-op" style="width:${op / t * 100}%"></span><span class="s-fee" style="width:${fee / t * 100}%"></span><span class="s-net" style="width:${net / t * 100}%"></span></div>`;
  };

  /* ---------- yönlendirme ---------- */
  function setView(v, push) {
    if (!VIEWS.includes(v)) v = 'fabrikalar';
    state.view = v;
    if (push !== false) { try { history.replaceState(null, '', '#' + v); } catch (e) { /* önizleme */ } }
    render();
    window.scrollTo({ top: 0 });
  }
  function render() {
    $$('.nav-link').forEach(a => a.setAttribute('aria-current', a.dataset.view === state.view ? 'page' : 'false'));
    const main = $('#view');
    Charts.Tip.hide();
    syncAccount();
    if (state.booting) { main.innerHTML = loadingHTML(); return; }
    if (SF.mode === 'live' && !SF.ME.signedIn && state.view !== 'fabrikalar') main.innerHTML = signInPromptHTML(state.view);
    else if (state.view === 'fabrikalar') main.innerHTML = viewFactories();
    else if (state.view === 'makinelerim') main.innerHTML = viewMine();
    else { main.innerHTML = viewAnalytics(); drawAnalyticsCharts(); }
    document.title = 'SanalFabrika CNC';
  }

  /* =========================================================
     FABRİKALAR
     ========================================================= */
  function factoryCard(f) {
    const ms = SF.machinesIn(f.id);
    const active = ms.filter(m => !m.proc).length, proc = ms.filter(m => m.proc).length, empty = SF.SLOTS.length - ms.length;
    const cells = SF.SLOTS.map(s => {
      const m = SF.machineAt(f.id, s);
      const cls = !m ? 'is-empty' : m.proc ? 'is-proc' : m.mine ? 'is-mine' : '';
      return `<i class="${cls}" title="${s}"></i>`;
    }).join('');
    const statusChip = f.status === 'active'
      ? '<span class="st st-running"><i class="lamp"></i>Üretimde</span>'
      : `<span class="st st-proc"><i class="lamp"></i>Kurulumda · açılış ${fDay.format(f.openAt)}</span>`;
    const foot = f.status === 'active'
      ? `<span><b>${active}/10</b> slot dolu</span><span>${empty ? `<b>${empty}</b> boş slot` : 'Tamamen dolu'}</span>`
      : `<span><b>${proc}</b> ön sipariş</span><span><b>${empty}</b> slot açık</span>`;
    return `<button class="fx-card" data-action="factory" data-id="${f.id}" aria-pressed="${state.factory === f.id}">
      <div class="fx-top"><span class="fx-code">${f.code} · ${esc(f.city)}</span>${statusChip}</div>
      <div class="fx-name"><b>${esc(f.name)}</b><small>${esc(f.lead)}</small></div>
      <div class="slotbar" aria-hidden="true">${cells}</div>
      <div class="fx-foot">${foot}</div>
    </button>`;
  }

  function slotTile(f, slot) {
    const m = SF.machineAt(f.id, slot);
    const now = Date.now();
    if (!m) {
      const pre = f.status === 'building';
      return `<button class="slot slot--empty" data-action="buy" data-factory="${f.id}" data-slot="${slot}" aria-label="${slot} boş slot, CNC satın al">
        <span class="slot-code">${slot}</span><span class="slot-plus" aria-hidden="true">+</span>
        <b>${pre ? 'Ön sipariş ver' : 'CNC Al'}</b><small>Boş slot · 3, 4 veya 5 eksen</small></button>`;
    }
    const dim = state.mineOnly && !m.mine ? ' is-dim' : '';
    const mine = m.mine ? ' is-mine' : '';
    if (m.proc) {
      const p = SF.procInfo(m, now);
      return `<button class="slot slot--proc${mine}${dim}" data-action="open-machine" data-id="${m.id}" aria-label="${m.id} tedarik aşamasında">
        <div class="slot-top"><span class="slot-code">${slot}</span>${axisBadge(m.axes)}</div>
        ${machineArt(m.axes, 'proc')}
        <div class="slot-model">${m.model}<small>${m.axes} eksen</small></div>
        ${statusPill('proc')}
        <div class="slot-job"><b>${p.cur.label}</b><br>Hazır: ${fDay.format(p.readyAt)} · ${p.daysLeft} gün</div>
        <div class="progress is-proc"><span style="width:${(p.overall * 100).toFixed(1)}%"></span></div>
        <div class="slot-foot">${ownerTag(m)}<span class="num">%${nf0.format(p.overall * 100)}</span></div>
      </button>`;
    }
    const st = SF.statusAt(m, now);
    const j = SF.jobAt(m, now);
    let jobTxt = '', prog = 0, pcls = 'is-run';
    if (st === 'running') {
      const done = SF.partsDone(j, now);
      jobTxt = `<b>${esc(j.part)}</b><br>${done}/${j.qty} parça · ${SF.SOURCE_LABEL[j.source].toLocaleLowerCase('tr-TR')}`;
      prog = done / j.qty;
    } else if (st === 'setup') {
      jobTxt = `<b>${esc(j.part)}</b><br>Kesime başlama ${fTime.format(j.start + j.setup * MIN)}`;
      prog = (now - j.start) / (j.setup * MIN); pcls = 'is-setup';
    } else if (st === 'maint') {
      jobTxt = `<b>${esc(j.title)}</b><br>Bitiş ${fTime.format(j.end)}`;
      prog = (now - j.start) / (j.end - j.start); pcls = '';
    } else {
      const nx = SF.nextJob(m, now);
      jobTxt = nx ? `Sonraki: <b>${esc(nx.part)}</b><br>${whenShort(nx.start)}` : 'Takvimde iş yok';
    }
    return `<button class="slot${mine}${dim}" data-action="open-machine" data-id="${m.id}" aria-label="${m.id} ${m.model}, ${SF.STATUS_LABEL[st]}. Takvimi aç">
      <div class="slot-top"><span class="slot-code">${slot}</span>${axisBadge(m.axes)}</div>
      ${machineArt(m.axes, st)}
      <div class="slot-model">${m.model}<small>${usd2(m.type.rate)}/dk</small></div>
      ${statusPill(st)}
      <div class="slot-job">${jobTxt}</div>
      <div class="progress ${pcls}"><span style="width:${(SF.clamp(prog) * 100).toFixed(1)}%"></span></div>
      <div class="slot-foot">${ownerTag(m)}</div>
    </button>`;
  }

  function floorHTML(f) {
    const row = r => SF.SLOTS.filter(s => s[0] === r).map(s => slotTile(f, s)).join('');
    return `<div class="floor-label">${f.code} · ÜRETİM HOLÜ · ${nf0.format(f.area)} m²</div>
      <div class="floor-row" role="group" aria-label="A sırası">${row('A')}</div>
      <div class="aisle" aria-hidden="true"><span>Malzeme ve forklift koridoru</span></div>
      <div class="floor-row" role="group" aria-label="B sırası">${row('B')}</div>`;
  }

  function floorStatsHTML(f) {
    const L = SF.factoryLive(f.id, Date.now());
    if (f.status === 'building') {
      return `<div class="fstat"><b>${L.filled}/10</b> ön sipariş</div>
        <div class="fstat"><b>${fDay.format(f.openAt)}</b> açılış</div>
        <div class="fstat"><b>${nf0.format(f.powerKva)} kVA</b> enerji kapasitesi</div>`;
    }
    return `<div class="fstat"><b>${L.filled}/10</b> slot dolu</div>
      <div class="fstat"><b>${L.counts.running}</b> çalışıyor</div>
      <div class="fstat"><b>${num(L.partsToday)}</b> parça bugün</div>
      <div class="fstat"><b>${nf0.format(L.power)} kW</b> anlık güç</div>
      <div class="fstat"><b>${pct(L.util7)}</b> 7 günlük doluluk</div>`;
  }

  function feedHTML(f) {
    if (f.status === 'building') {
      const items = [['Bina ve epoksi zemin', 'Tamamlandı', true], ['Trafo ve enerji hattı', 'Tamamlandı', true], ['Basınçlı hava hattı', 'Devam ediyor', false], ['10 t gezer vinç montajı', 'Devam ediyor', false], ['Operatör alımı ve eğitim', 'Planlandı', false]];
      return `<h3>Kurulum durumu</h3><ul class="feed">${items.map(i => `<li><time>${i[2] ? '✓' : '·'}</time><span><b>${i[0]}</b><br><span class="muted">${i[1]}</span></span></li>`).join('')}</ul>`;
    }
    const ev = SF.factoryEvents(f.id, Date.now(), 7);
    const txt = e => {
      const who = `<span class="${e.m.mine ? 'ev-mine' : ''}">${e.m.slot}</span>`;
      if (e.type === 'start') return `${who} <b>${esc(e.j.part)}</b> işine başladı (${e.j.qty} adet)`;
      if (e.type === 'end') return `${who} <b>${esc(e.j.part)}</b> işini bitirdi, ${e.j.qty} parça teslim`;
      if (e.type === 'maint') return `${who} ${esc(e.j.title)} başladı`;
      return `${who} bakım tamamlandı`;
    };
    return `<h3>Canlı akış</h3>${ev.length ? `<ul class="feed">${ev.map(e => `<li><time>${fTime.format(e.t)}</time><span>${txt(e)}</span></li>`).join('')}</ul>` : '<p class="muted">Son 14 saatte olay yok.</p>'}`;
  }

  function viewFactories() {
    const f = SF.factory(state.factory);
    const ms = SF.machinesIn(f.id);
    const all = SF.MACHINES.filter(m => !m.proc);
    const runningNow = all.filter(m => SF.statusAt(m, Date.now()) === 'running').length;
    const totalEmpty = SF.FACTORIES.reduce((a, fx) => a + SF.SLOTS.length - SF.machinesIn(fx.id).length, 0);
    const mineHere = ms.filter(m => m.mine).length;
    const byAx = [3, 4, 5].map(a => ({ a, n: ms.filter(m => m.axes === a).length })).filter(x => x.n);
    const shift = SF.shiftAt(Date.now());
    let banner = '';
    if (f.status === 'active' && ms.length >= 10) {
      banner = `<div class="banner">${ICON.info}<span>Bu tesisteki 10 slotun tamamı dolu. Boş slotlar için Bursa veya İzmir tesisine bakın.</span><button class="btn btn-sm" data-action="factory" data-id="brs">Bursa'yı aç</button></div>`;
    } else if (f.status === 'building') {
      banner = `<div class="banner">${ICON.info}<span>Tesis ${fFull.format(f.openAt)} tarihinde üretime başlıyor. Şimdi verilen siparişler tedarik süresi dolunca bu slotlara kurulur.</span></div>`;
    } else {
      banner = `<div class="banner">${ICON.info}<span>Bu tesiste <b>${10 - ms.length} boş slot</b> var. Kesikli çizgili bir slota tıklayıp 3, 4 veya 5 eksen CNC alabilirsiniz.</span></div>`;
    }
    return `
      <section class="page-head">
        <div>
          <p class="eyebrow"><span class="dot"></span>Tesis ağı · canlı</p>
          <h1>Fabrikalar</h1>
          <p class="lede">Her tesiste 10 CNC slotu var. Dolu bir slota tıklayınca makinenin iş takvimi açılır. Boş bir slota tıklayınca kendi CNC'nizi satın alabilirsiniz.</p>
        </div>
        <div class="head-stats">
          <div class="hstat"><span>Toplam slot</span><b>30</b></div>
          <div class="hstat"><span>Çalışan makine</span><b>${all.length}</b></div>
          <div class="hstat"><span>Şu an kesimde</span><b>${runningNow}</b></div>
          <div class="hstat"><span>Satın alınabilir</span><b>${totalEmpty}</b></div>
        </div>
      </section>
      <div class="factory-switch" role="group" aria-label="Tesis seçimi">${SF.FACTORIES.map(factoryCard).join('')}</div>
      <section class="factory-main">
        <div class="card floor-card">
          <div class="floor-head">
            <div><h2>${esc(f.name)}</h2><p>${esc(f.city)} · ${esc(f.lead)}</p></div>
            <label class="switch" for="mine-only"><input type="checkbox" id="mine-only" ${state.mineOnly ? 'checked' : ''}><span>Sadece benim makinelerim</span></label>
          </div>
          <div class="floor-stats" id="floor-stats">${floorStatsHTML(f)}</div>
          ${banner}
          <div class="floor" id="floor">${floorHTML(f)}</div>
          <div class="floor-legend">
            ${['running', 'setup', 'idle', 'maint', 'proc'].map(s => `<span>${statusPill(s)}</span>`).join('')}
            <span><span class="chip chip-mine">Sizin</span> makineniz</span>
          </div>
        </div>
        <aside class="factory-side">
          <div class="card side-card">
            <h3>Tesis bilgileri</h3>
            <dl class="dl">
              <dt>Konum</dt><dd>${esc(f.city)}</dd>
              <dt>Kapalı alan</dt><dd>${nf0.format(f.area)} m²</dd>
              <dt>Çalışma düzeni</dt><dd>7/24 · 3 vardiya</dd>
              ${f.status === 'active' ? `<dt>Aktif vardiya</dt><dd>${shift.label} · ${shift.range}</dd>
              <dt>Vardiyadaki operatör</dt><dd>${f.operatorsPerShift} kişi</dd>
              <dt>Üretimde</dt><dd>${f.since}'ten beri</dd>` : `<dt>Açılış</dt><dd>${fDayY.format(f.openAt)}</dd>`}
              <dt>Enerji kapasitesi</dt><dd>${nf0.format(f.powerKva)} kVA</dd>
              <dt>Sizin makineleriniz</dt><dd>${mineHere}</dd>
            </dl>
            ${byAx.length ? `<div style="display:grid;gap:6px">
              <span class="muted" style="font-size:12.5px">Makine dağılımı</span>
              <div class="mixbar">${byAx.map(x => `<span style="width:${x.n * 10}%;background:${x.a === 5 ? 'var(--ink)' : x.a === 4 ? 'var(--ink-2)' : 'var(--line-strong)'}"></span>`).join('')}<span style="flex:1;background:transparent;box-shadow:inset 0 0 0 1px var(--line-strong)"></span></div>
              <span style="font-size:13px">${byAx.map(x => `${x.n} × ${x.a} eksen`).join(' · ')}${ms.length < 10 ? ` · ${10 - ms.length} boş` : ''}</span>
            </div>` : ''}
          </div>
          <div class="card side-card" id="feed">${feedHTML(f)}</div>
        </aside>
      </section>`;
  }

  function refreshFloor() {
    if (state.view !== 'fabrikalar') return;
    const f = SF.factory(state.factory);
    const fl = $('#floor'); if (fl) fl.innerHTML = floorHTML(f);
    const fs = $('#floor-stats'); if (fs) fs.innerHTML = floorStatsHTML(f);
    const fd = $('#feed'); if (fd) fd.innerHTML = feedHTML(f);
  }

  /* =========================================================
     MAKİNE ÇEKMECESİ
     ========================================================= */
  function openMachine(id, tab) {
    const m = SF.machine(id);
    if (!m) return;
    state.drawer = { id, tab: tab || (m.proc ? 'tedarik' : 'takvim'), week: 0, sel: null, opener: document.activeElement };
    $('#drawer').hidden = false; $('#drawer-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    renderDrawer();
    const c = $('#drawer .drawer-close'); if (c) c.focus();
  }
  function closeDrawer() {
    if (liveCtl) { liveCtl.destroy(); liveCtl = null; }
    const opener = state.drawer && state.drawer.opener;
    state.drawer = null;
    $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true; $('#drawer').innerHTML = '';
    document.body.style.overflow = '';
    Charts.Tip.hide();
    if (opener && document.body.contains(opener)) opener.focus();
  }

  function renderDrawer() {
    if (liveCtl) { liveCtl.destroy(); liveCtl = null; }
    const d = state.drawer; if (!d) return;
    const m = SF.machine(d.id); const f = SF.factory(m.factory);
    const now = Date.now();
    const st = SF.statusAt(m, now);
    const tabs = m.proc
      ? [['tedarik', 'Tedarik süreci'], ['ozet', 'Makine bilgisi']]
      : [['takvim', 'Takvim'], ['canli', 'Canlı izle'], ['ozet', 'Özet ve gelir']];
    $('#drawer').innerHTML = `
      <div class="drawer-head">
        <div class="drawer-title">
          ${machineArt(m.axes, st, 'slot-art')}
          <div>
            <h2 id="drawer-title">${m.id} ${axisBadge(m.axes)} ${m.mine ? '<span class="chip chip-mine">Sizin</span>' : ''}</h2>
            <p>${m.model} · ${esc(m.type.family)} · ${esc(f.name)}, slot ${m.slot}</p>
            <div class="drawer-meta">${statusPill(st)}<span class="chip">${usd2(m.type.rate)}/dk</span>${m.mine ? '' : `<span class="chip chip-outline">Sahibi: yatırımcı ${esc(m.owner)}</span>`}</div>
          </div>
          <button class="icon-btn drawer-close" data-action="close-drawer" aria-label="Kapat">${ICON.close}</button>
        </div>
        <div class="tabs" role="tablist">${tabs.map(t => `<button class="tab" role="tab" data-action="drawer-tab" data-tab="${t[0]}" aria-selected="${d.tab === t[0]}">${t[0] === 'canli' ? '<i class="rec-dot"></i>' : ''}${t[1]}</button>`).join('')}</div>
      </div>
      <div class="drawer-body" id="drawer-body"></div>`;
    renderDrawerBody();
  }

  function renderDrawerBody() {
    if (liveCtl) { liveCtl.destroy(); liveCtl = null; }
    const d = state.drawer; const m = SF.machine(d.id);
    const body = $('#drawer-body');
    if (d.tab === 'takvim') body.innerHTML = calendarHTML(m, d);
    else if (d.tab === 'canli') {
      if (!m.mine) {
        body.innerHTML = `<div class="lock">${ICON.lock}<b>Canlı izleme yalnızca makine sahibine açık</b><span class="muted">Bu makine yatırımcı ${esc(m.owner)} hesabına ait. Kendi makinelerinizi Makinelerim sayfasından canlı izleyebilirsiniz.</span><button class="btn btn-sm" data-action="view" data-view="makinelerim">Makinelerime git</button></div>`;
      } else {
        body.innerHTML = '<div id="live-root"></div><p class="note">' + ICON.info + '<span>Görüntü bir simülasyondur. Parça sayısı ve çevrim süresi makinenin gerçek iş takviminden hesaplanır, takım yolu temsilidir.</span></p>';
        liveCtl = Live.mount($('#live-root'), m);
      }
    } else if (d.tab === 'tedarik') body.innerHTML = procHTML(m);
    else body.innerHTML = summaryHTML(m);
  }

  /* ---- takvim ---- */
  function calendarHTML(m, d) {
    const now = Date.now();
    const ws = SF.addDays(SF.startOfWeek(now), d.week * 7), we = SF.addDays(ws, 7);
    const days = Array.from({ length: 7 }, (_, i) => SF.addDays(ws, i));
    const jobs = m.jobs.filter(j => j.end > ws && j.start < we);
    const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];
    const rows = days.map(ds => {
      const de = SF.addDays(ds, 1);
      const isToday = now >= ds && now < de;
      const blocks = jobs.filter(j => j.end > ds && j.start < de).map(j => {
        const a = Math.max(j.start, ds), b = Math.min(j.end, de);
        const left = (a - ds) / (de - ds) * 100, width = (b - a) / (de - ds) * 100;
        const cls = j.kind === 'maint' ? 'maint' : j.source;
        const label = j.kind === 'maint' ? j.title : j.part;
        const past = j.end < now ? ' is-past' : '';
        const sel = d.sel === j.id ? ' is-sel' : '';
        const tip = j.kind === 'maint' ? `${j.title} · ${fTime.format(j.start)}–${fTime.format(j.end)}` : `${j.part} · ${j.qty} adet · ${whenShort(j.start)} → ${whenShort(j.end)}`;
        return `<button class="cal-block ${cls}${past}${sel}" style="left:${left}%;width:${width}%" data-action="sel-job" data-job="${j.id}" title="${esc(tip)}" aria-label="${esc(tip)}">${width > 9 ? `<span>${esc(label)}</span>` : ''}</button>`;
      }).join('');
      const nowLine = isToday ? `<div class="cal-now" style="left:${(now - ds) / DAY * 100}%"></div>` : '';
      return `<div class="cal-day${isToday ? ' is-today' : ''}"><b>${cap(fWd.format(ds))}</b><small>${fDay.format(ds)}</small></div><div class="cal-track">${blocks}${nowLine}</div>`;
    }).join('');
    // hafta özeti
    let busy = 0, maint = 0, planned = 0, nets = 0, ownMin = 0;
    jobs.forEach(j => {
      const mins = (Math.min(j.end, we) - Math.max(j.start, ws)) / MIN;
      if (j.kind === 'maint') { maint += mins; return; }
      busy += mins; if (j.source === 'own') ownMin += mins;
      planned += j.start >= ws ? j.qty : 0;
      nets += mins * (m.type.rate - m.type.opRate - m.type.rate * SF.FEES[j.source]);
    });
    const util = busy / (7 * 1440);
    const range = `${fDay.format(ws)} – ${fDayY.format(we - 1)}`;
    const wk = d.week === 0 ? 'Bu hafta' : d.week === -1 ? 'Geçen hafta' : d.week === 1 ? 'Gelecek hafta' : (d.week > 0 ? `${d.week} hafta sonra` : `${-d.week} hafta önce`);
    const list = jobs.slice().sort((a, b) => a.start - b.start);
    const selJob = d.sel ? m.jobs.find(j => j.id === d.sel) : null;
    return `
      <div class="cal-toolbar">
        <div><div class="muted" style="font-size:12.5px">${wk}</div><div class="range">${range}</div></div>
        <div class="cal-nav">
          <button class="btn btn-sm" data-action="cal-week" data-delta="-1" aria-label="Önceki hafta">${ICON.left}</button>
          <button class="btn btn-sm" data-action="cal-week" data-delta="0">Bugün</button>
          <button class="btn btn-sm" data-action="cal-week" data-delta="1" aria-label="Sonraki hafta">${ICON.right}</button>
        </div>
      </div>
      <div class="week-stats">
        <div class="mini"><span>Haftalık doluluk</span><b>${pct(util)}</b></div>
        <div class="mini"><span>İş sayısı</span><b>${list.filter(j => j.kind === 'job').length}</b></div>
        <div class="mini"><span>Kendi iş payı</span><b>${pct(busy ? ownMin / busy : 0)}</b></div>
        <div class="mini"><span>${m.mine ? 'Tahmini net' : 'Bakım süresi'}</span><b>${m.mine ? usd(nets) : dur(maint)}</b></div>
      </div>
      <div class="cal-legend"><span><i class="key key-own"></i>Kendi işi</span><span><i class="key key-platform"></i>Platform işi</span><span><i class="key key-maint"></i>Bakım</span><span><i class="key" style="background:var(--ink);width:2px;height:12px;border-radius:0"></i>Şu an</span></div>
      <div class="cal-scroll"><div class="cal">
        <div class="cal-corner"></div>
        <div class="cal-hours">${hours.map(h => `<span style="left:${h / 24 * 100}%">${String(h).padStart(2, '0')}:00</span>`).join('')}</div>
        ${rows}
      </div></div>
      ${selJob ? jobDetailHTML(m, selJob) : ''}
      <div class="section-title"><h3>Haftanın işleri</h3><p>${m.mine ? 'Bloğa veya satıra tıklayarak ayrıntıyı açın.' : 'Müşteri ve gelir bilgileri makine sahibine özeldir.'}</p></div>
      <div class="joblist" role="list">
        <div class="jrow head"><span></span><span>İş</span><span>Zaman</span><span class="r">Adet</span><span class="r">${m.mine ? 'Net' : 'Süre'}</span></div>
        ${list.length ? list.map(j => jobRow(m, j, d.sel === j.id)).join('') : '<div class="jrow"><span></span><span class="muted">Bu hafta planlı iş yok.</span></div>'}
      </div>`;
  }
  function jobNet(m, j) { return j.durMin * (m.type.rate - m.type.opRate - m.type.rate * SF.FEES[j.source]); }
  function jobRow(m, j, sel) {
    const now = Date.now();
    if (j.kind === 'maint') {
      return `<button class="jrow${sel ? ' is-sel' : ''}" data-action="sel-job" data-job="${j.id}" role="listitem"><span class="bar maint"></span>
        <span><b>${esc(j.title)}</b><small>Planlı bakım</small></span><span><small>${whenShort(j.start)} → ${fTime.format(j.end)}</small></span><span class="r">—</span><span class="r"><small>${dur(j.durMin)}</small></span></button>`;
    }
    const done = SF.partsDone(j, now);
    const state = j.end < now ? 'Tamamlandı' : j.start > now ? 'Planlandı' : 'Sürüyor';
    return `<button class="jrow${sel ? ' is-sel' : ''}" data-action="sel-job" data-job="${j.id}" role="listitem"><span class="bar ${j.source}"></span>
      <span><b>${esc(j.part)}</b><small>${m.mine ? esc(j.customer) : 'Gizli müşteri'} · ${SF.SOURCE_LABEL[j.source]} · ${state}</small></span>
      <span><small>${whenShort(j.start)} → ${whenShort(j.end)}</small></span>
      <span class="r num">${done}/${j.qty}</span>
      <span class="r num">${m.mine ? usd(jobNet(m, j)) : dur(j.durMin)}</span></button>`;
  }
  function jobDetailHTML(m, j) {
    const now = Date.now();
    if (j.kind === 'maint') {
      return `<div class="job-detail"><div class="job-detail-head"><div><span class="muted" style="font-size:12.5px">Planlı bakım</span><h3>${esc(j.title)}</h3></div><button class="btn btn-sm btn-ghost" data-action="sel-job" data-job="">Kapat</button></div>
        <div class="kv"><div><span>Başlangıç</span><b>${whenShort(j.start)}</b></div><div><span>Bitiş</span><b>${whenShort(j.end)}</b></div><div><span>Süre</span><b>${dur(j.durMin)}</b></div><div><span>Ücret</span><b>İşletme ücretine dahil</b></div></div></div>`;
    }
    const T = m.type;
    const done = SF.partsDone(j, now);
    const g = j.durMin * T.rate, op = j.durMin * T.opRate, fee = g * SF.FEES[j.source], net = g - op - fee;
    const money = m.mine ? `
      <div class="split">${splitBar(op, fee, net)}
        <div class="split-legend"><span><i class="key key-cost"></i>İşletme <b>${usd(op)}</b></span><span><i class="key key-fee"></i>Platform payı %${SF.FEES[j.source] * 100} <b>${usd(fee)}</b></span><span><i class="key key-net"></i>Size kalan <b>${usd(net)}</b></span></div>
      </div>` : `<p class="note">${ICON.lock}<span>Bu makine başka bir yatırımcıya ait. Müşteri ve gelir bilgileri gizlidir.</span></p>`;
    return `<div class="job-detail">
      <div class="job-detail-head"><div><span class="muted mono" style="font-size:12px">${esc(j.order)}</span><h3>${esc(j.part)}</h3></div>
        <div style="display:flex;gap:8px;align-items:center">${srcTag(j.source)}<button class="btn btn-sm btn-ghost" data-action="sel-job" data-job="">Kapat</button></div></div>
      <div class="kv">
        <div><span>Müşteri</span><b>${m.mine ? esc(j.customer) : 'Gizli'}</b></div>
        <div><span>Malzeme</span><b>${esc(j.mat)}</b></div>
        <div><span>Adet</span><b>${done} / ${j.qty}</b></div>
        <div><span>Çevrim süresi</span><b>${j.cycle} dk/parça</b></div>
        <div><span>Ayar süresi</span><b>${j.setup} dk</b></div>
        <div><span>Toplam süre</span><b>${dur(j.durMin)}</b></div>
        <div><span>Başlangıç</span><b>${whenShort(j.start)}</b></div>
        <div><span>Bitiş</span><b>${whenShort(j.end)}</b></div>
        ${m.mine ? `<div><span>Brüt (${usd2(T.rate)}/dk)</span><b>${usd(g)}</b></div>` : ''}
      </div>
      ${money}
    </div>`;
  }

  /* ---- tedarik ---- */
  function timelineHTML(steps, curIdx, now) {
    return `<ol class="timeline">${steps.map((s, i) => {
      const cls = s.key === 'live' ? (i <= curIdx && now >= s.start ? 'is-final' : '') : (i < curIdx ? 'is-done' : i === curIdx ? 'is-cur' : '');
      const when = s.days ? `<b>${s.days} gün</b>${fDay.format(s.start)} – ${fDay.format(s.end)}` : `<b>Hedef</b>${fDayY.format(s.start)}`;
      return `<li class="${cls}"><span class="tdot">${i < curIdx ? '✓' : i + 1}</span><div class="tbody"><b>${s.label}</b><small>${s.desc}</small></div><div class="twhen">${when}</div></li>`;
    }).join('')}</ol>`;
  }
  function procHTML(m) {
    const now = Date.now();
    const p = SF.procInfo(m, now);
    return `
      <div class="week-stats">
        <div class="mini"><span>Sipariş tarihi</span><b>${fDay.format(m.orderDate)}</b></div>
        <div class="mini"><span>Aktif adım</span><b>${p.idx + 1} / ${p.steps.length}</b></div>
        <div class="mini"><span>Genel ilerleme</span><b>${pct(p.overall)}</b></div>
        <div class="mini"><span>Üretime hazır</span><b>${fDay.format(p.readyAt)}</b></div>
      </div>
      <div class="progress is-proc"><span style="width:${(p.overall * 100).toFixed(1)}%"></span></div>
      <p class="note">${ICON.info}<span>${esc(p.cur.label)} adımı %${nf0.format(p.stepProg * 100)} tamamlandı. Makinenin üretime başlamasına ${p.daysLeft} gün kaldı.</span></p>
      ${timelineHTML(p.steps, p.idx, now)}`;
  }

  /* ---- özet ---- */
  function summaryHTML(m) {
    const now = Date.now();
    const T = m.type; const f = SF.factory(m.factory);
    const specs = `<dl class="dl">${T.specs.map(s => `<dt>${s[0]}</dt><dd>${s[1]}</dd>`).join('')}
      <dt>Tesis / slot</dt><dd>${esc(f.short)} · ${m.slot}</dd>
      <dt>${m.proc ? 'Sipariş' : 'Devreye alma'}</dt><dd>${fDayY.format(m.proc ? m.orderDate : m.commission)}</dd>
      <dt>Sahibi</dt><dd>${m.mine ? 'Siz' : 'Yatırımcı ' + esc(m.owner)}</dd></dl>`;
    const costs = `<ul class="costlist">${SF.COST_KEYS.map(k => `<li><span>${SF.COST_LABELS[k]}</span><b>${usd2(T.cost[k])}</b><small>${SF.COST_HINTS[k]}</small></li>`).join('')}
      <li class="total"><span>İşletme ücreti toplamı</span><b>${usd2(T.opRate)}/dk</b></li></ul>`;
    const pmOwn = SF.perMinute(m.axes, 'own'), pmPl = SF.perMinute(m.axes, 'platform');
    const perMin = `<div class="compare-min">
      ${[['own', pmOwn], ['platform', pmPl]].map(([k, p]) => `<div class="row"><div class="row-head">${srcTag(k)}<span>Size kalan <b>${usd2(p.net)}/dk</b></span></div>${splitBar(p.op, p.fee, p.net)}</div>`).join('')}
      <div class="split-legend"><span><i class="key key-cost"></i>İşletme</span><span><i class="key key-fee"></i>Platform payı</span><span><i class="key key-net"></i>Size kalan</span></div></div>`;
    if (m.proc) {
      return `<div class="two-col"><div class="panel"><h3>Makine</h3>${specs}</div>
        <div class="panel"><h3>Dakika ücreti ${usd2(T.rate)} nasıl paylaşılır?</h3>${perMin}<h3 style="margin-top:6px">İşletme ücreti kalemleri (dakika başı)</h3>${costs}</div></div>`;
    }
    const d0 = SF.startOfDay(now);
    const td = SF.windowStats(m, d0, now);
    const ms = SF.windowStats(m, Math.max(SF.startOfMonth(now), m.commission), now);
    const cum = SF.windowStats(m, m.commission, now);
    const today = m.mine ? `<dl class="dl">
        <dt>Çalışma süresi</dt><dd>${dur(td.minutes)}</dd><dt>Üretilen parça</dt><dd>${num(td.parts)}</dd>
        <dt>Brüt gelir</dt><dd>${usd2(td.gross)}</dd><dt>İşletme ücreti</dt><dd>−${usd2(td.op)}</dd>
        <dt>Platform payı</dt><dd>−${usd2(td.fee)}</dd><dt><b style="color:var(--ink)">Net kazanç</b></dt><dd>${usd2(td.net)}</dd></dl>`
      : `<dl class="dl"><dt>Çalışma süresi</dt><dd>${dur(td.minutes)}</dd><dt>Üretilen parça</dt><dd>${num(td.parts)}</dd><dt>Bugünkü doluluk</dt><dd>${pct(td.util)}</dd></dl>`;
    const month = m.mine ? `<dl class="dl"><dt>Doluluk</dt><dd>${pct(ms.util)}</dd><dt>Üretilen parça</dt><dd>${num(ms.parts)}</dd><dt>Brüt gelir</dt><dd>${usd(ms.gross)}</dd><dt>Net kâr</dt><dd>${usd(ms.net)}</dd>
        <dt>Yatırım</dt><dd>${usd(m.invest)}</dd><dt>Geri dönen (toplam)</dt><dd>${usd(cum.net)} · ${pct(cum.net / m.invest)}</dd></dl>
        <div class="pay-bar" aria-hidden="true"><span style="width:${Math.min(100, cum.net / m.invest * 100)}%"></span></div>`
      : `<dl class="dl"><dt>Bu ay doluluk</dt><dd>${pct(ms.util)}</dd><dt>Üretilen parça</dt><dd>${num(ms.parts)}</dd></dl>`;
    return `<div class="two-col">
        <div class="panel"><h3>Bugün</h3>${today}</div>
        <div class="panel"><h3>${cap(fMonth.format(now))}</h3>${month}</div>
        <div class="panel"><h3>Dakika ücreti ${usd2(T.rate)} nasıl paylaşılır?</h3>${perMin}</div>
        <div class="panel"><h3>İşletme ücreti kalemleri (dakika başı)</h3>${costs}</div>
        <div class="panel" style="grid-column:1/-1"><h3>Teknik özellikler</h3>${specs}</div>
      </div>`;
  }

  /* =========================================================
     SATIN ALMA SİHİRBAZI
     ========================================================= */
  const JOB_MODELS = [
    { key: 'own', share: 1, label: 'Kendi işlerimi bağlayacağım', desc: 'Müşteriyi siz getirirsiniz. Platform işletme ücreti ve %5 hizmet bedeli alır.' },
    { key: 'mix', share: 0.5, label: 'Karma', desc: 'Kendi işleriniz önceliklidir, boş kalan saatleri platform doldurur.' },
    { key: 'platform', share: 0, label: 'Platform iş bulsun', desc: 'Tüm işleri platform bulur ve yönetir. Komisyon %20, size kalan marj daha düşük.' }
  ];
  function openWizard(fid, slot) {
    state.wiz = { factory: fid, slot, step: 1, axes: 4, ownShare: 0.5, util: 0.7, agree: false, done: null, opener: document.activeElement };
    $('#modal-root').hidden = false;
    document.body.style.overflow = 'hidden';
    renderWizard();
  }
  function closeWizard() {
    const opener = state.wiz && state.wiz.opener;
    state.wiz = null;
    $('#modal-root').hidden = true; $('#modal-root').innerHTML = '';
    if (!state.drawer) document.body.style.overflow = '';
    if (opener && document.body.contains(opener)) opener.focus();
  }
  function renderWizard() {
    const w = state.wiz; if (!w) return;
    const f = SF.factory(w.factory);
    const steps = ['Makine seç', 'İş modeli', 'Onay ve teslim planı'];
    const head = `<div class="modal-head">
        <div class="modal-head-top"><div><p class="eyebrow">${esc(f.name)} · slot ${w.slot}</p><h2 id="wiz-title">${w.done ? 'Siparişiniz alındı' : 'Bu slota CNC al'}</h2></div>
          <button class="icon-btn" data-action="wiz-close" aria-label="Kapat">${ICON.close}</button></div>
        ${w.done ? '' : `<ol class="stepper">${steps.map((s, i) => `<li class="${i + 1 === w.step ? 'is-cur' : i + 1 < w.step ? 'is-done' : ''}"><i>${i + 1 < w.step ? '✓' : i + 1}</i>${s}</li>`).join('')}</ol>`}
      </div>`;
    let body = '', foot = '';
    if (w.done) {
      const m = SF.machine(w.done);
      const p = SF.procInfo(m, Date.now());
      body = `<div class="success"><span class="success-badge">${ICON.check}</span>
          <div style="display:grid;gap:4px"><h3>${m.id} · ${m.model} sizin adınıza rezerve edildi</h3><p class="ink2">Makine tahminen <b>${fFull.format(p.readyAt)}</b> tarihinde üretime hazır olacak. Adımları Makinelerim sayfasından takip edebilirsiniz.</p></div></div>
        ${timelineHTML(p.steps, p.idx, Date.now())}`;
      foot = `<p class="note">${ICON.info}<span>${SF.mode === 'live' ? 'Sipariş veritabanına kaydedildi. Ödeme entegrasyonu henüz bağlı değil, tahsilat yapılmaz.' : 'Bu bir demo arayüzdür. Gerçek ödeme alınmaz, sipariş yalnızca bu oturumda görünür.'}</span></p>
        <div class="modal-foot-btns"><button class="btn" data-action="wiz-close">Fabrikaya dön</button><button class="btn btn-primary" data-action="wiz-goto-mine">Makinelerime git</button></div>`;
    } else if (w.step === 1) {
      body = `<div class="section-title"><h3>Hangi makineyi kuralım?</h3><p>Tahmini net, %70 doluluk ve karma iş modeline göredir.</p></div>
        <div class="type-grid" role="radiogroup" aria-label="Makine tipi">${[3, 4, 5].map(ax => {
          const T = SF.TYPES[ax]; const pr = SF.projectMonthly(ax, 0.7, 0.5);
          return `<button class="type-card" role="radio" aria-checked="${w.axes === ax}" data-action="wiz-axes" data-axes="${ax}">
            <div class="type-card-top"><span style="display:flex;gap:8px;align-items:center">${axisBadge(ax)}<span class="mono muted" style="font-size:12px">${T.code}</span></span><span class="radio-dot"></span></div>
            <div><h3>${ax} eksen CNC</h3><p class="muted" style="font-size:13px">${esc(T.family)}</p></div>
            <div class="art">${machineArt(ax, 'idle')}</div>
            <div class="price">${usd(T.price)} <small>+ ${usd(T.installFee)} nakliye ve kurulum</small></div>
            <div class="rate-row">
              <div><span>Dakika ücreti</span><b>${usd2(T.rate)}</b></div>
              <div><span>İşletme</span><b>${usd2(T.opRate)}</b></div>
              <div><span>Tahmini net/ay</span><b>${usdC(pr.net)}</b></div>
            </div>
            <p style="font-size:13px" class="ink2">${esc(T.blurb)}</p>
            <ul>${T.uses.map(u => `<li>${esc(u)}</li>`).join('')}</ul>
            <span class="muted" style="font-size:12.5px">Geri dönüş ≈ ${nf1.format(pr.paybackMonths)} ay</span>
          </button>`;
        }).join('')}</div>`;
      foot = `<p class="note">${ICON.info}<span>Tedarik yaklaşık 3 ay, kurulum 5 gün sürer. Son adımda tarihli planı görürsünüz.</span></p>
        <div class="modal-foot-btns"><button class="btn" data-action="wiz-close">Vazgeç</button><button class="btn btn-primary" data-action="wiz-next">Devam</button></div>`;
    } else if (w.step === 2) {
      body = `<div class="plan-grid">
          <div style="display:grid;gap:16px">
            <div class="section-title"><h3>İşler nereden gelecek?</h3></div>
            <div class="model-opts" role="radiogroup" aria-label="İş modeli">${JOB_MODELS.map(o => `
              <button class="model-opt" role="radio" aria-checked="${Math.abs(w.ownShare - o.share) < 0.001}" data-action="wiz-model" data-share="${o.share}">
                <span class="radio-dot"></span><b>${o.label}</b><span class="fee">${o.key === 'own' ? '%5' : o.key === 'platform' ? '%20' : '%5 / %20'}</span><small>${o.desc}</small></button>`).join('')}
            </div>
            <div class="range"><label for="wiz-own">Kendi iş payı <b id="wiz-own-v">${pct(w.ownShare)}</b></label>
              <input type="range" id="wiz-own" min="0" max="100" step="5" value="${Math.round(w.ownShare * 100)}"><small>Çalışma süresinin ne kadarını kendi müşterilerinizle dolduracağınız.</small></div>
            <div class="range"><label for="wiz-util">Beklenen doluluk <b id="wiz-util-v">${pct(w.util)}</b></label>
              <input type="range" id="wiz-util" min="30" max="95" step="5" value="${Math.round(w.util * 100)}"><small>Tesis ortalaması son 30 günde %72.</small></div>
          </div>
          <div id="wiz-proj">${projectionHTML(w)}</div>
        </div>`;
      foot = `<p class="note">${ICON.info}<span>Hesaplar tahminidir. Gerçek kazanç doluluk ve iş karışımına göre değişir.</span></p>
        <div class="modal-foot-btns"><button class="btn" data-action="wiz-back">Geri</button><button class="btn btn-primary" data-action="wiz-next">Devam</button></div>`;
    } else {
      const T = SF.TYPES[w.axes];
      const plan = SF.procPlan(Date.now());
      const total = T.price + T.installFee;
      const pr = SF.projectMonthly(w.axes, w.util, w.ownShare);
      body = `<div class="sum-grid">
          <div style="display:grid;gap:16px">
            <div class="panel">
              <h3>Sipariş özeti</h3>
              <div style="display:flex;gap:12px;align-items:center">${machineArt(w.axes, 'idle', 'slot-art" style="width:110px')}<div><b>${T.code} · ${w.axes} eksen</b><br><span class="muted" style="font-size:13px">${esc(f.short)} · slot ${w.slot}</span></div></div>
              <div class="receipt">
                <div><span>Makine bedeli</span><b>${usd(T.price)}</b></div>
                <div><span>Nakliye, kurulum ve kalibrasyon</span><b>${usd(T.installFee)}</b></div>
                <div class="total"><span>Toplam yatırım</span><b>${usd(total)}</b></div>
                <div><span>Bugün ödenecek ön ödeme (%30)</span><b>${usd(total * 0.3)}</b></div>
                <div><span>Teslimatta kalan (%70)</span><b>${usd(total * 0.7)}</b></div>
              </div>
            </div>
            <div class="panel">
              <h3>Seçtiğiniz iş modeli</h3>
              <dl class="dl"><dt>Kendi iş payı</dt><dd>${pct(w.ownShare)}</dd><dt>Beklenen doluluk</dt><dd>${pct(w.util)}</dd><dt>Tahmini aylık net</dt><dd>${usd(pr.net)}</dd><dt>Tahmini geri dönüş</dt><dd>${nf1.format(pr.paybackMonths)} ay</dd></dl>
            </div>
            <label class="check" for="wiz-agree"><input type="checkbox" id="wiz-agree" ${w.agree ? 'checked' : ''}><span>Slot kiralama ve işletme sözleşmesini okudum. İşletme ücretinin yalnızca çalışılan dakika için kesileceğini anladım.</span></label>
          </div>
          <div class="panel">
            <h3>Teslim planı</h3>
            <p class="muted" style="font-size:13px">Siparişi bugün onaylarsanız makine ${fFull.format(plan[plan.length - 1].start)} tarihinde iş almaya başlar.</p>
            ${timelineHTML(plan, 0, Date.now())}
          </div>
        </div>`;
      foot = `${w.error ? `<p class="form-error" role="alert">${esc(w.error)}</p>` : `<p class="note">${ICON.info}<span>${SF.mode === 'live' ? 'Sipariş veritabanına kaydedilir. Ödeme adımı henüz bağlı değil.' : 'Demo: gerçek ödeme alınmaz.'}</span></p>`}
        <div class="modal-foot-btns"><button class="btn" data-action="wiz-back" ${w.busy ? 'disabled' : ''}>Geri</button><button class="btn btn-primary" data-action="wiz-confirm" ${w.agree && !w.busy ? '' : 'disabled'}>${w.busy ? 'Kaydediliyor…' : 'Siparişi onayla'}</button></div>`;
    }
    $('#modal-root').innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="wiz-title">${head}<div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></div>`;
  }
  function projectionHTML(w) {
    const T = SF.TYPES[w.axes];
    const pr = SF.projectMonthly(w.axes, w.util, w.ownShare);
    const own = SF.perMinute(w.axes, 'own'), pl = SF.perMinute(w.axes, 'platform');
    return `<div class="proj">
      <div class="proj-hero"><div><span>Tahmini aylık net kâr</span><b>${usd(pr.net)}</b></div><div style="text-align:right"><span>Geri dönüş süresi</span><b class="pb">${nf1.format(pr.paybackMonths)} ay</b></div></div>
      <div class="split">${splitBar(pr.op, pr.fee, pr.net)}
        <div class="split-legend"><span><i class="key key-cost"></i>İşletme <b>${usd(pr.op)}</b></span><span><i class="key key-fee"></i>Platform payı <b>${usd(pr.fee)}</b></span><span><i class="key key-net"></i>Size kalan <b>${usd(pr.net)}</b></span></div></div>
      <dl class="dl">
        <dt>Çalışma süresi (30 gün)</dt><dd>${nf0.format(pr.minutes / 60)} saat</dd>
        <dt>Brüt gelir (${usd2(T.rate)}/dk)</dt><dd>${usd(pr.gross)}</dd>
        ${SF.COST_KEYS.map(k => `<dt>− ${SF.COST_LABELS[k]}</dt><dd>${usd(pr.cost[k])}</dd>`).join('')}
        <dt>− Platform payı</dt><dd>${usd(pr.fee)}</dd>
      </dl>
      <div class="compare-min">
        <div class="row"><div class="row-head">${srcTag('own')}<span>Dakikada size kalan <b>${usd2(own.net)}</b></span></div>${splitBar(own.op, own.fee, own.net)}</div>
        <div class="row"><div class="row-head">${srcTag('platform')}<span>Dakikada size kalan <b>${usd2(pl.net)}</b></span></div>${splitBar(pl.op, pl.fee, pl.net)}</div>
      </div>
    </div>`;
  }

  /* =========================================================
     MAKİNELERİM
     ========================================================= */
  const PERIODS = [['today', 'Bugün'], ['yesterday', 'Dün'], ['7d', 'Son 7 gün'], ['month', 'Bu ay']];
  function periodWindow(p, now) {
    const d0 = SF.startOfDay(now);
    if (p === 'yesterday') return [SF.addDays(d0, -1), d0];
    if (p === '7d') return [now - 7 * DAY, now];
    if (p === 'month') return [SF.startOfMonth(now), now];
    return [d0, now];
  }
  function prevWindow(p, now) {
    const [a, b] = periodWindow(p, now);
    if (p === 'month') { const pa = SF.addMonths(a, -1); return [pa, pa + (b - a)]; }
    if (p === 'today') { const pa = SF.addDays(a, -1); return [pa, pa + (b - a)]; }
    return [a - (b - a), a];
  }
  const periodName = p => ({ today: 'bugün', yesterday: 'dün', '7d': 'son 7 günde', month: 'bu ay' }[p]);
  const prevName = p => ({ today: 'dünün aynı saatine', yesterday: 'önceki güne', '7d': 'önceki 7 güne', month: 'geçen ayın aynı dönemine' }[p]);
  function deltaTxt(cur, prev, label) {
    if (!prev) return '';
    const d = (cur - prev) / prev;
    const sign = d >= 0 ? '+' : '−';
    return `<span class="${d >= 0 ? 'delta-up' : ''}">${sign}%${nf0.format(Math.abs(d) * 100)}</span> ${label}`;
  }

  function myKpisHTML() {
    const now = Date.now();
    const mine = SF.myMachines();
    const [a, b] = periodWindow(state.period, now);
    const [pa, pb] = prevWindow(state.period, now);
    const s = SF.sumStats(mine, a, b), ps = SF.sumStats(mine, pa, pb);
    const active = mine.filter(m => !m.proc);
    const invest = active.reduce((x, m) => x + m.invest, 0);
    const back = active.reduce((x, m) => x + SF.windowStats(m, m.commission, now).net, 0);
    const pl = prevName(state.period);
    return `
      <div class="card kpi is-hero"><span>Net kazanç · ${periodName(state.period)}</span><b data-live="net">${usd2(s.net)}</b><small>${deltaTxt(s.net, ps.net, pl)}</small></div>
      <div class="card kpi"><span>Brüt gelir</span><b>${usd(s.gross)}</b><small>${deltaTxt(s.gross, ps.gross, pl)}</small></div>
      <div class="card kpi"><span>Üretilen parça</span><b>${num(s.parts)}</b><small>${num(s.own.parts)} kendi işi · ${num(s.platform.parts)} platform</small></div>
      <div class="card kpi"><span>Doluluk</span><b>${pct(s.util)}</b><small>${hrs(s.minutes)} kesim ve ayar</small></div>
      <div class="card kpi"><span>İşletme ve platform payı</span><b>${usd(s.op + s.fee)}</b><small>${usd(s.op)} işletme · ${usd(s.fee)} platform</small></div>
      <div class="card kpi"><span>Yatırım geri dönüşü</span><b>${pct(invest ? back / invest : 0)}</b><small>${usdC(back)} / ${usdC(invest)} toplam</small></div>`;
  }

  function machineCardHTML(m) {
    const now = Date.now();
    const f = SF.factory(m.factory);
    if (m.proc) {
      const p = SF.procInfo(m, now);
      return `<article class="card mcard" data-mid="${m.id}">
        <div class="mcard-head">${machineArt(m.axes, 'proc')}<div><h3>${m.id} ${axisBadge(m.axes)}${m.isNew ? '<span class="chip chip-mine">Yeni sipariş</span>' : ''}</h3><p>${m.model} · ${esc(f.name)}, slot ${m.slot}</p>${statusPill('proc')}</div></div>
        <div class="mcard-job">
          <div class="mcard-job-top"><div><b>Adım ${p.idx + 1}/${p.steps.length}: ${p.cur.label}</b><small>${p.cur.desc}</small></div></div>
          <div class="proc-steps">${p.steps.map((s, i) => `<div class="${i < p.idx ? 'is-done' : i === p.idx ? 'is-cur' : ''}"><i><span style="width:${i < p.idx ? 100 : i === p.idx ? p.stepProg * 100 : 0}%"></span></i><em>${s.label}</em></div>`).join('')}</div>
          <div class="mcard-job-foot"><span>Sipariş ${fDay.format(m.orderDate)}</span><span>Üretime hazır <b>${fDayY.format(p.readyAt)}</b> · ${p.daysLeft} gün</span></div>
        </div>
        <div class="mstats">
          <div><span>Yatırım</span><b>${usdC(m.invest)}</b></div>
          <div><span>Ödenen</span><b>${usdC(m.invest * 0.3)}</b></div>
          <div><span>Dakika ücreti</span><b>${usd2(m.type.rate)}</b></div>
          <div><span>İlerleme</span><b>${pct(p.overall)}</b></div>
        </div>
        <div class="mcard-foot"><button class="btn btn-sm" data-action="open-machine" data-id="${m.id}" data-tab="tedarik">${ICON.cal}Tedarik adımları</button></div>
      </article>`;
    }
    const [a, b] = periodWindow(state.period, now);
    const s = SF.windowStats(m, Math.max(a, m.commission), b);
    const st = SF.statusAt(m, now);
    const j = SF.jobAt(m, now);
    let job;
    if (j && j.kind === 'job') {
      const done = SF.partsDone(j, now);
      const todayDone = done - SF.partsDone(j, Math.max(j.start, SF.startOfDay(now)));
      job = `<div class="mcard-job">
        <div class="mcard-job-top"><div><b>${esc(j.part)}</b><small>${esc(j.customer)} · ${esc(j.order)} · ${esc(j.mat)}</small></div>${srcTag(j.source)}</div>
        <div class="progress ${st === 'setup' ? 'is-setup' : 'is-run'}"><span style="width:${(st === 'setup' ? (now - j.start) / (j.setup * MIN) : done / j.qty) * 100}%"></span></div>
        <div class="mcard-job-foot"><span><b data-live="jobdone">${done}</b>/${j.qty} parça · bugün <b>${todayDone}</b> çıktı</span><span>${st === 'setup' ? 'Kesime ' + fTime.format(j.start + j.setup * MIN) : 'Bitiş ' + whenShort(j.end)}</span></div>
      </div>`;
    } else if (j && j.kind === 'maint') {
      job = `<div class="mcard-job"><div class="mcard-job-top"><div><b>${esc(j.title)}</b><small>Planlı bakım · bitiş ${fTime.format(j.end)}</small></div></div></div>`;
    } else {
      const nx = SF.nextJob(m, now);
      job = `<div class="mcard-job"><div class="mcard-job-top"><div><b>Şu an boşta</b><small>${nx ? `Sonraki iş ${esc(nx.part)} · ${whenShort(nx.start)}` : 'Takvimde iş yok'}</small></div></div></div>`;
    }
    return `<article class="card mcard" data-mid="${m.id}">
      <div class="mcard-head">${machineArt(m.axes, st)}<div><h3>${m.id} ${axisBadge(m.axes)}</h3><p>${m.model} · ${esc(f.name)}, slot ${m.slot} · ${usd2(m.type.rate)}/dk</p>${statusPill(st)}</div></div>
      ${job}
      <div class="mstats">
        <div><span>Çalışma</span><b>${dur(s.minutes)}</b></div>
        <div><span>Parça</span><b>${num(s.parts)}</b></div>
        <div><span>Brüt</span><b>${usd(s.gross)}</b></div>
        <div><span>Net</span><b data-live="mnet" data-mid="${m.id}">${usd(s.net)}</b></div>
      </div>
      <div class="split">${splitBar(s.op, s.fee, s.net)}
        <div class="split-legend"><span><i class="key key-cost"></i>İşletme <b>${usd(s.op)}</b></span><span><i class="key key-fee"></i>Platform <b>${usd(s.fee)}</b></span><span><i class="key key-net"></i>Size kalan <b>${usd(s.net)}</b></span></div></div>
      <details data-det="${m.id}" ${openDetails.has(m.id) ? 'open' : ''}>
        <summary>İşletme ücreti dökümü · ${periodName(state.period)}</summary>
        <ul class="costlist">${SF.COST_KEYS.map(k => `<li><span>${SF.COST_LABELS[k]} <span class="muted">(${usd2(m.type.cost[k])}/dk)</span></span><b>${usd2(s.cost[k])}</b></li>`).join('')}
          <li class="total"><span>İşletme ücreti</span><b>${usd2(s.op)}</b></li>
          <li><span>Platform payı · kendi işi %5</span><b>${usd2(s.own.fee)}</b></li>
          <li><span>Platform payı · platform işi %20</span><b>${usd2(s.platform.fee)}</b></li></ul>
      </details>
      <div class="mcard-foot">
        <button class="btn btn-sm" data-action="open-machine" data-id="${m.id}" data-tab="takvim">${ICON.cal}Takvim</button>
        <button class="btn btn-sm" data-action="open-machine" data-id="${m.id}" data-tab="canli">${ICON.eye}Canlı izle</button>
        <button class="btn btn-sm btn-ghost" data-action="open-machine" data-id="${m.id}" data-tab="ozet">Gelir detayı</button>
      </div>
    </article>`;
  }
  const openDetails = new Set();

  function revenueModelHTML() {
    const ax = state.splitAxes; const T = SF.TYPES[ax];
    const own = SF.perMinute(ax, 'own'), pl = SF.perMinute(ax, 'platform');
    const col = (k, p, title, text) => `<div class="model-col">
        <div class="model-col-head"><span style="display:grid;gap:2px">${srcTag(k)}<b>${title}</b></span><span class="big">${usd2(p.net)}<span class="muted" style="font-size:13px;font-weight:500">/dk size</span></span></div>
        ${splitBar(p.op, p.fee, p.net)}
        <div class="split-legend"><span><i class="key key-cost"></i>İşletme <b>${usd2(p.op)}</b></span><span><i class="key key-fee"></i>Platform %${SF.FEES[k] * 100} <b>${usd2(p.fee)}</b></span><span><i class="key key-net"></i>Size <b>${usd2(p.net)}</b></span></div>
        <p>${text}</p>
      </div>`;
    return `<section class="card model-card">
      <div class="section-title"><div style="display:grid;gap:2px"><h2>Gelir modeli: ${usd2(T.rate)}'lık bir dakika nasıl paylaşılır?</h2><p>İşletme ücreti operatör, elektrik, bakım, takım, tesis ve sigortayı kapsar. Sadece makinenin çalıştığı dakika için kesilir.</p></div>
        <div class="seg" role="group" aria-label="Makine tipi">${[3, 4, 5].map(a => `<button data-action="split-axes" data-axes="${a}" aria-pressed="${a === ax}">${a} eksen</button>`).join('')}</div></div>
      <div class="model-cols">
        ${col('own', own, 'İşi siz bağladığınızda', `Platform yalnızca işletme ücretini ve %5 hizmet bedelini alır. Dakika başına <b>${usd2(own.net - pl.net)}</b> daha fazla kazanırsınız.`)}
        ${col('platform', pl, 'İşi platform bulduğunda', 'Satış, teklif ve müşteri yönetimini platform yapar. Komisyon %20 olduğu için size kalan marj düşer.')}
      </div>
    </section>`;
  }

  function periodJobsHTML() {
    const now = Date.now();
    const [a, b] = periodWindow(state.period, now);
    const rows = [];
    SF.myMachines().filter(m => !m.proc).forEach(m => {
      m.jobs.forEach(j => {
        if (j.kind !== 'job' || j.end <= a || j.start >= b) return;
        const mins = (Math.min(j.end, b) - Math.max(j.start, a)) / MIN;
        const parts = SF.partsDone(j, Math.min(b, j.end)) - SF.partsDone(j, Math.max(a, j.start));
        const g = mins * m.type.rate, net = g - mins * m.type.opRate - g * SF.FEES[j.source];
        rows.push({ m, j, mins, parts, g, net });
      });
    });
    rows.sort((x, y) => y.j.start - x.j.start);
    const tot = rows.reduce((t, r) => ({ mins: t.mins + r.mins, parts: t.parts + r.parts, g: t.g + r.g, net: t.net + r.net }), { mins: 0, parts: 0, g: 0, net: 0 });
    return `<section style="display:grid;gap:12px">
      <div class="section-title"><h2>İşler · ${periodName(state.period)}</h2><p>${rows.length} iş · parça sayısı yalnızca bu dönemde çıkanları gösterir</p></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Makine</th><th>Parça</th><th>Müşteri</th><th>Kaynak</th><th class="r">Bu dönem çıkan</th><th class="r">Süre</th><th class="r">Brüt</th><th class="r">Net</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><span class="cell-m">${axisBadge(r.m.axes)}<b>${r.m.id}</b></span></td>
          <td>${esc(r.j.part)}<br><span class="muted" style="font-size:12px">${esc(r.j.mat)} · ${r.j.cycle} dk/parça</span></td>
          <td>${esc(r.j.customer)}</td><td>${srcTag(r.j.source)}</td>
          <td class="r">${num(r.parts)} <span class="muted">/ ${r.j.qty}</span></td><td class="r">${dur(r.mins)}</td><td class="r">${usd(r.g)}</td><td class="r"><b>${usd(r.net)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Toplam</td><td class="r">${num(tot.parts)}</td><td class="r">${dur(tot.mins)}</td><td class="r">${usd(tot.g)}</td><td class="r">${usd(tot.net)}</td></tr></tfoot>
      </table></div></section>`;
  }

  function viewMine() {
    const mine = SF.myMachines();
    if (!mine.length) return emptyStateHTML('Makinelerim', 'Henüz makineniz yok', 'Fabrikalar sayfasında kesikli çizgili boş bir slot seçerek ilk CNC makinenizi alabilirsiniz. Sipariş verdiğiniz makine burada tedarik adımlarıyla birlikte görünür.', 'Boş slotları gör', 'fabrikalar');
    const active = mine.filter(m => !m.proc).length, proc = mine.length - active;
    const order = mine.slice().sort((x, y) => (x.proc - y.proc) || (y.isNew - x.isNew));
    return `
      <section class="page-head">
        <div><p class="eyebrow"><span class="dot"></span>Yatırımcı paneli · ${SF.ME.name}</p><h1>Makinelerim</h1>
          <p class="lede">${active} makineniz üretimde, ${proc} makineniz tedarik aşamasında. Kazanç her saniye makinelerin çalışma dakikasına göre güncellenir.</p></div>
        <div class="seg" role="group" aria-label="Dönem">${PERIODS.map(p => `<button data-action="period" data-period="${p[0]}" aria-pressed="${state.period === p[0]}">${p[1]}</button>`).join('')}</div>
      </section>
      <div class="kpis" id="my-kpis">${myKpisHTML()}</div>
      <section class="mgrid" id="my-cards">${order.map(machineCardHTML).join('')}</section>
      ${revenueModelHTML()}
      ${periodJobsHTML()}`;
  }

  function tickMine() {
    if (state.view !== 'makinelerim' || state.period === 'yesterday') return;
    const now = Date.now();
    const [a, b] = periodWindow(state.period, now);
    const s = SF.sumStats(SF.myMachines(), a, b);
    const el = $('[data-live="net"]'); if (el) el.textContent = usd2(s.net);
    $$('[data-live="mnet"]').forEach(e => { const m = SF.machine(e.dataset.mid); e.textContent = usd(SF.windowStats(m, Math.max(a, m.commission), b).net); });
  }

  /* =========================================================
     ANALİZ
     ========================================================= */
  const anActive = () => SF.myMachines().filter(m => !m.proc);
  const anMachines = () => state.an.machine === 'all' ? anActive() : anActive().filter(m => m.id === state.an.machine);
  function monthOptions() {
    const now = Date.now();
    const first = Math.min(...anActive().map(m => m.commission));
    const out = []; let t = SF.startOfMonth(now);
    while (t >= SF.startOfMonth(first) && out.length < 12) { out.push(t); t = SF.addMonths(t, -1); }
    return out;
  }
  function analyticsData() {
    const now = Date.now();
    const ms = anMachines();
    const a = state.an.month, b = SF.addMonths(a, 1);
    const isCur = now >= a && now < b;
    const end = isCur ? now : b;
    const s = SF.sumStats(ms, a, end);
    const pa = SF.addMonths(a, -1);
    const ps = SF.sumStats(ms, pa, Math.min(a, pa + (end - a)));
    const planned = isCur ? SF.sumStats(ms, now, b) : null;
    const days = [];
    for (let d = a; d < b; d = SF.addDays(d, 1)) {
      const de = SF.addDays(d, 1);
      const future = d >= now;
      const st = SF.sumStats(ms, d, future ? de : Math.min(de, now));
      days.push({ d, de, st, future, partial: now >= d && now < de });
    }
    const months = [];
    const first = SF.startOfMonth(Math.min(...ms.map(m => m.commission)));
    let t = SF.addMonths(SF.startOfMonth(now), -11);
    if (t < first) t = first;
    for (; t <= SF.startOfMonth(now); t = SF.addMonths(t, 1)) {
      const te = SF.addMonths(t, 1);
      const cur = now >= t && now < te;
      const act = SF.sumStats(ms, t, cur ? now : te).net;
      const pl = cur ? SF.sumStats(ms, now, te).net : 0;
      months.push({ t, actual: act, planned: pl, cur });
    }
    const perMachine = ms.map(m => ({ m, s: SF.sumStats([m], a, end) }));
    return { now, ms, a, b, isCur, end, s, ps, planned, days, months, perMachine };
  }

  function heatClass(u) {
    if (u < 0.02) return 'var(--heat-0)';
    if (u < 0.2) return 'var(--heat-1)';
    if (u < 0.4) return 'var(--heat-2)';
    if (u < 0.6) return 'var(--heat-3)';
    if (u < 0.8) return 'var(--heat-4)';
    if (u < 0.9) return 'var(--heat-5)';
    return 'var(--heat-6)';
  }
  const ttRows = rows => rows.map(r => r.join('|')).join(';;');

  function viewAnalytics() {
    if (!anActive().length) return emptyStateHTML('Analiz', 'Analiz için üretimde bir makineniz olmalı', 'Makineniz tedarik ve kurulum aşamasını tamamlayıp iş almaya başladığında gelir, gider ve kârlılık grafikleri burada oluşur.', 'Makinelerime git', 'makinelerim');
    if (state.an.machine !== 'all' && !anActive().some(m => m.id === state.an.machine)) state.an.machine = 'all';
    if (!monthOptions().includes(state.an.month)) state.an.month = SF.startOfMonth(Date.now());
    const D = analyticsData();
    const { s, ps, planned, isCur } = D;
    const mopts = monthOptions();
    const monthName = cap(fMonth.format(D.a));
    const cmp = isCur ? 'geçen ayın aynı dönemine' : 'önceki aya';
    const margin = s.gross ? s.net / s.gross : 0;
    const forecast = planned ? s.net + planned.net : null;
    const kpis = `
      <div class="card kpi is-hero"><span>Net kâr · ${monthName}${isCur ? ' (bugüne kadar)' : ''}</span><b>${usd(s.net)}</b>
        <small>${deltaTxt(s.net, ps.net, cmp)}${forecast ? `<br>Ay sonu tahmini ${usd(forecast)}` : ''}</small></div>
      <div class="card kpi"><span>Brüt gelir</span><b>${usd(s.gross)}</b><small>${deltaTxt(s.gross, ps.gross, cmp)}</small></div>
      <div class="card kpi"><span>İşletme gideri</span><b>${usd(s.op)}</b><small>Brütün ${pct(s.gross ? s.op / s.gross : 0)} kadarı</small></div>
      <div class="card kpi"><span>Platform payı</span><b>${usd(s.fee)}</b><small>${usd(s.own.fee)} kendi · ${usd(s.platform.fee)} platform işi</small></div>
      <div class="card kpi"><span>Kâr marjı</span><b>${pct(margin)}</b><small>Net kâr / brüt gelir</small></div>
      <div class="card kpi"><span>Doluluk</span><b>${pct(s.util)}</b><small>${hrs(s.minutes)} çalışma · ${num(s.parts)} parça</small></div>`;

    // gelir şelalesi
    const steps = [{ label: 'Brüt gelir', v: s.gross, total: true, color: 'var(--c-gross)' }]
      .concat(SF.COST_KEYS.map(k => ({ label: SF.COST_LABELS[k], v: -s.cost[k], color: 'var(--c-cost)' })))
      .concat([{ label: 'Platform payı', v: -s.fee, color: 'var(--c-fee)' }, { label: 'Net kâr', v: s.net, total: true, color: 'var(--c-net)' }]);
    let run = s.gross;
    const wf = steps.map(st => {
      let from, to;
      if (st.total) { from = 0; to = st.v; } else { to = run; from = run + st.v; run = from; }
      const L = s.gross ? from / s.gross * 100 : 0, Wd = s.gross ? (to - from) / s.gross * 100 : 0;
      const share = s.gross ? Math.abs(st.v) / s.gross : 0;
      return `<div class="wf-row${st.total ? ' is-total' : ''}" tabindex="0" data-tt-title="${esc(st.label)}" data-tt="${esc(ttRows([[st.total ? 'Tutar' : 'Gider', usd(Math.abs(st.v)), st.color], ['Brüt içindeki payı', pct(share), '']]))}">
        <span>${esc(st.label)}</span><div class="wf-track"><span class="wf-bar" style="left:${L}%;width:${Math.max(0.3, Wd)}%;background:${st.color}"></span></div>
        <span class="wf-val${st.total ? '' : ' neg'}">${st.total ? '' : '−'}${usdC(Math.abs(st.v))}</span></div>`;
    }).join('');

    // kaynak karşılaştırması
    const o = s.own, p = s.platform;
    const tm = o.minutes + p.minutes || 1, tn = o.net + p.net || 1;
    const npm = x => x.minutes ? x.net / x.minutes : 0;
    const srcCmp = `
      <div class="src-compare">
        <div class="src-row"><div class="src-row-head"><span>Çalışma süresi payı</span><span><b>${pct(o.minutes / tm)}</b> kendi · <b>${pct(p.minutes / tm)}</b> platform</span></div>
          <div class="stack100"><span class="own" style="width:${o.minutes / tm * 100}%"></span><span class="platform" style="width:${p.minutes / tm * 100}%"></span></div></div>
        <div class="src-row"><div class="src-row-head"><span>Net kâr payı</span><span><b>${pct(o.net / tn)}</b> kendi · <b>${pct(p.net / tn)}</b> platform</span></div>
          <div class="stack100"><span class="own" style="width:${o.net / tn * 100}%"></span><span class="platform" style="width:${p.net / tn * 100}%"></span></div></div>
      </div>
      <div class="table-wrap"><table class="data" style="min-width:0">
        <thead><tr><th></th><th class="r">Saat</th><th class="r">Brüt</th><th class="r">Platform payı</th><th class="r">Net</th><th class="r">Net/dk</th></tr></thead>
        <tbody>
          <tr><td>${srcTag('own')}</td><td class="r">${nf0.format(o.minutes / 60)}</td><td class="r">${usdC(o.gross)}</td><td class="r">${usdC(o.fee)}</td><td class="r"><b>${usdC(o.net)}</b></td><td class="r">${usd2(npm(o))}</td></tr>
          <tr><td>${srcTag('platform')}</td><td class="r">${nf0.format(p.minutes / 60)}</td><td class="r">${usdC(p.gross)}</td><td class="r">${usdC(p.fee)}</td><td class="r"><b>${usdC(p.net)}</b></td><td class="r">${usd2(npm(p))}</td></tr>
        </tbody></table></div>
      <p class="note">${ICON.info}<span>Kendi bulduğunuz işlerde dakika başına ortalama <b>${usd2(npm(o) - npm(p))}</b> daha fazla kazanıyorsunuz.</span></p>`;

    // ısı haritası
    const nd = D.days.length;
    const heatHead = `<div class="heat-row" style="--days:${nd}"><span></span>${D.days.map((x, i) => `<span class="heat-head">${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</span>`).join('')}</div>`;
    const heatRows = D.ms.map(m => `<div class="heat-row" style="--days:${nd}"><span>${m.id}</span>${D.days.map(x => {
      if (x.de <= m.commission) return `<span class="heat-cell na" title="${fDay.format(x.d)}: devreye alınmadı"></span>`;
      if (x.future) return `<span class="heat-cell f" title="${fDay.format(x.d)}: gelecek gün"></span>`;
      const st = SF.windowStats(m, Math.max(x.d, m.commission), Math.min(x.de, D.now));
      return `<span class="heat-cell" tabindex="0" style="background:${heatClass(st.util)}" data-tt-title="${m.id} · ${dayLabel(x.d)}" data-tt="${esc(ttRows([['Doluluk', pct(st.util), ''], ['Parça', num(st.parts), ''], ['Net', usd(st.net), '']]))}"></span>`;
    }).join('')}</div>`).join('');
    const heatLegend = `<div class="heat-legend"><span>Düşük</span>${[0, 1, 2, 3, 4, 5, 6].map(i => `<i style="background:var(--heat-${i})"></i>`).join('')}<span>Yüksek doluluk</span><span style="margin-left:12px">0 · 20 · 40 · 60 · 80 · 90+ %</span></div>`;

    // makine tablosu
    const tot = SF.emptyStats(); D.perMachine.forEach(r => SF.addStats(tot, r.s));
    const table = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Makine</th><th>Tesis</th><th class="r">Çalışma</th><th>Doluluk</th><th class="r">Parça</th><th class="r">Brüt</th><th class="r">İşletme</th><th class="r">Platform</th><th class="r">Net kâr</th><th class="r">Marj</th><th class="r">Net/dk</th></tr></thead>
      <tbody>${D.perMachine.map(({ m, s: x }) => `<tr>
        <td><span class="cell-m">${axisBadge(m.axes)}<b>${m.id}</b> <span class="muted">${m.model}</span></span></td>
        <td>${esc(SF.factory(m.factory).short)} · ${m.slot}</td>
        <td class="r">${hrs(x.minutes)}</td>
        <td><span class="meter"><i><span style="width:${x.util * 100}%"></span></i>${pct(x.util)}</span></td>
        <td class="r">${num(x.parts)}</td><td class="r">${usd(x.gross)}</td><td class="r">${usd(x.op)}</td><td class="r">${usd(x.fee)}</td>
        <td class="r"><b>${usd(x.net)}</b></td><td class="r">${pct(x.gross ? x.net / x.gross : 0)}</td><td class="r">${usd2(x.minutes ? x.net / x.minutes : 0)}</td></tr>`).join('')}</tbody>
      ${D.perMachine.length > 1 ? `<tfoot><tr><td colspan="2">Toplam</td><td class="r">${hrs(tot.minutes)}</td><td>${pct(tot.util)}</td><td class="r">${num(tot.parts)}</td><td class="r">${usd(tot.gross)}</td><td class="r">${usd(tot.op)}</td><td class="r">${usd(tot.fee)}</td><td class="r">${usd(tot.net)}</td><td class="r">${pct(tot.gross ? tot.net / tot.gross : 0)}</td><td class="r">${usd2(tot.minutes ? tot.net / tot.minutes : 0)}</td></tr></tfoot>` : ''}
    </table></div>`;

    // geri dönüş
    const pay = SF.myMachines().map(m => {
      if (m.proc) {
        const pi = SF.procInfo(m, D.now);
        return `<div class="pay-row"><div class="who"><b>${m.id} · ${m.model}</b><small>Tedarikte · yatırım ${usd(m.invest)}</small></div><div class="pay-bar"><span style="width:0"></span></div><div class="when">Üretime başlama <b>${fDay.format(pi.readyAt)}</b></div></div>`;
      }
      const cum = SF.windowStats(m, m.commission, D.now).net;
      const last90 = SF.windowStats(m, Math.max(m.commission, D.now - 90 * DAY), D.now);
      const perDay = last90.net / Math.max(1, (D.now - Math.max(m.commission, D.now - 90 * DAY)) / DAY);
      const left = Math.max(0, m.invest - cum);
      const eta = left > 0 ? D.now + left / perDay * DAY : null;
      return `<div class="pay-row"><div class="who"><b>${m.id} · ${m.model}</b><small>Devreye alma ${fDayY.format(m.commission)} · yatırım ${usd(m.invest)}</small></div>
        <div class="pay-bar" role="img" aria-label="Geri dönen ${pct(cum / m.invest)}"><span style="width:${Math.min(100, cum / m.invest * 100)}%"></span></div>
        <div class="when"><b>${usd(cum)}</b> geri döndü · ${pct(cum / m.invest)}<br>${eta ? `Tamamlanma ≈ ${cap(fMonth.format(eta))}` : 'Yatırım geri döndü'}</div></div>`;
    }).join('');

    const dailyTable = state.an.table ? `<div class="table-wrap"><table class="data" style="min-width:420px"><thead><tr><th>Gün</th><th class="r">Kendi işi net</th><th class="r">Platform işi net</th><th class="r">Toplam net</th><th class="r">Parça</th></tr></thead>
      <tbody>${D.days.map(x => `<tr><td>${dayLabel(x.d)}${x.future ? ' <span class="muted">· planlı</span>' : x.partial ? ' <span class="muted">· sürüyor</span>' : ''}</td><td class="r">${usd(x.st.own.net)}</td><td class="r">${usd(x.st.platform.net)}</td><td class="r"><b>${usd(x.st.net)}</b></td><td class="r">${num(x.st.parts)}</td></tr>`).join('')}</tbody></table></div>` : '';

    return `
      <section class="page-head">
        <div><p class="eyebrow">Analiz · ${SF.ME.name}</p><h1>${monthName} analizi</h1>
          <p class="lede">Makinelerinizin gelir, gider ve kârlılığı. Planlanan değerler takvimdeki onaylı iş rezervasyonlarından hesaplanır.</p></div>
      </section>
      <div class="filters" role="group" aria-label="Filtreler">
        <label class="select" for="an-month">Ay <select id="an-month">${mopts.map(t => `<option value="${t}" ${t === state.an.month ? 'selected' : ''}>${cap(fMonth.format(t))}</option>`).join('')}</select></label>
        <label class="select" for="an-machine">Makine <select id="an-machine"><option value="all">Tüm makinelerim (${anActive().length})</option>${anActive().map(m => `<option value="${m.id}" ${state.an.machine === m.id ? 'selected' : ''}>${m.id} · ${m.model}</option>`).join('')}</select></label>
      </div>
      <div class="kpis">${kpis}</div>
      <div class="an-grid">
        <section class="card chart-card span-8">
          <div class="chart-head"><div><h3>Günlük net kâr</h3><p>${isCur ? 'Açık renkli sütunlar takvimde planlanmış günlerdir.' : 'Gün bazında kendi işi ve platform işi kırılımı.'}</p></div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div class="legend"><span><i class="key key-own"></i>Kendi işi</span><span><i class="key key-platform"></i>Platform işi</span></div>
            <button class="btn btn-sm btn-ghost tbl-toggle" data-action="an-table">${state.an.table ? 'Grafiği göster' : 'Tablo olarak göster'}</button></div></div>
          ${state.an.table ? dailyTable : '<div class="chart" id="ch-daily"></div>'}
        </section>
        <section class="card chart-card span-4">
          <div class="chart-head"><div><h3>Gelir nereye gidiyor?</h3><p>Brüt gelirden net kâra ${monthName.split(' ')[0]} dökümü</p></div></div>
          <div class="wf">${wf}</div>
          <div class="legend"><span><i class="key key-gross"></i>Brüt</span><span><i class="key key-cost"></i>İşletme kalemleri</span><span><i class="key key-fee"></i>Platform payı</span><span><i class="key key-net"></i>Net</span></div>
        </section>
        <section class="card chart-card span-7">
          <div class="chart-head"><div><h3>Aylık net kâr</h3><p>Son ${D.months.length} ay · bu ayın açık kısmı takvimdeki planlı işler</p></div></div>
          <div class="chart" id="ch-trend"></div>
        </section>
        <section class="card chart-card span-5">
          <div class="chart-head"><div><h3>Kendi işim mi, platform işi mi?</h3><p>${monthName} çalışma süresi ve kârın kaynağa göre dağılımı</p></div>
            <div class="legend"><span><i class="key key-own"></i>Kendi işi</span><span><i class="key key-platform"></i>Platform işi</span></div></div>
          ${srcCmp}
        </section>
        <section class="card chart-card">
          <div class="chart-head"><div><h3>Doluluk ısı haritası</h3><p>Her hücre bir makinenin bir günündeki çalışma oranı</p></div>${heatLegend}</div>
          <div class="heat">${heatHead}${heatRows}</div>
        </section>
        <section class="chart-card card">
          <div class="chart-head"><div><h3>Makine bazında kârlılık</h3><p>${monthName}${isCur ? ', bugüne kadar' : ''}</p></div></div>
          ${table}
        </section>
        <section class="chart-card card">
          <div class="chart-head"><div><h3>Yatırım geri dönüşü</h3><p>Devreye almadan bugüne kadar elde edilen net kârın yatırıma oranı. Tahmin son 90 günün ortalamasına göredir.</p></div></div>
          <div class="pay-list">${pay}</div>
        </section>
      </div>`;
  }

  function drawAnalyticsCharts() {
    if (state.view !== 'analiz' || (!$('#ch-daily') && !$('#ch-trend'))) return;
    const D = analyticsData();
    const daily = $('#ch-daily');
    if (daily) {
      Charts.stackedColumns(daily, {
        height: 250,
        cats: D.days.map((x, i) => ({ label: String(i + 1), title: dayLabel(x.d) + (x.partial ? ' · sürüyor' : ''), planned: x.future, strong: x.partial })),
        series: [{ key: 'own', label: 'Kendi işi', color: 'var(--c-own)' }, { key: 'platform', label: 'Platform işi', color: 'var(--c-platform)' }],
        values: D.days.map(x => [x.st.own.net, x.st.platform.net]),
        fmtAxis: v => usdC(v), fmtVal: v => usd(v), totalLabel: 'Toplam net',
        ariaLabel: 'Günlük net kâr, kendi işi ve platform işi'
      });
    }
    const trend = $('#ch-trend');
    if (trend) {
      Charts.trendColumns(trend, {
        height: 230, color: 'var(--c-net)',
        items: D.months.map(x => ({ label: cap(fMonS.format(x.t)), title: cap(fMonth.format(x.t)), actual: x.actual, planned: x.planned })),
        fmtAxis: v => usdC(v), fmtVal: v => usd(v), ariaLabel: 'Aylık net kâr'
      });
    }
  }

  /* =========================================================
     HESAP VE GİRİŞ
     ========================================================= */
  function loadingHTML() {
    return `<section class="empty"><div class="spinner" aria-hidden="true"></div><h2>Veritabanına bağlanılıyor</h2><p class="muted">Tesisler, makineler ve iş takvimleri yükleniyor.</p></section>`;
  }
  function emptyStateHTML(title, head, text, cta, view) {
    return `<section class="page-head"><div><h1>${esc(title)}</h1></div></section>
      <section class="empty card"><h2>${esc(head)}</h2><p class="ink2">${esc(text)}</p>
        <button class="btn btn-primary" data-action="view" data-view="${view}">${esc(cta)}</button></section>`;
  }
  function signInPromptHTML(view) {
    const what = view === 'analiz' ? 'kârlılık analizinizi' : 'makinelerinizi ve kazancınızı';
    return `<section class="page-head"><div><h1>${view === 'analiz' ? 'Analiz' : 'Makinelerim'}</h1></div></section>
      <section class="empty card">${ICON.lock}<h2>Giriş yapın</h2>
        <p class="ink2">${what.charAt(0).toLocaleUpperCase('tr-TR') + what.slice(1)} görmek için hesabınıza giriş yapın. Fabrikaları ve makine takvimlerini giriş yapmadan da gezebilirsiniz.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary" data-action="auth-open" data-mode="signin">Giriş yap</button>
          <button class="btn" data-action="auth-open" data-mode="signup">Hesap oluştur</button></div></section>`;
  }

  function syncAccount() {
    const btn = $('#account-btn'), chip = $('#mode-chip');
    const live = SF.mode === 'live';
    chip.textContent = live ? 'Canlı veri' : (window.Backend && Backend.enabled && state.bootError ? 'Bağlantı yok · demo' : 'Demo verisi');
    chip.dataset.mode = live ? 'live' : 'demo';
    if (live && !SF.ME.signedIn) {
      btn.className = 'btn btn-sm btn-primary'; btn.textContent = 'Giriş yap'; btn.title = 'Giriş yap veya hesap oluştur';
    } else {
      btn.className = 'avatar'; btn.textContent = SF.ME.initials || '?'; btn.title = SF.ME.name ? `${SF.ME.name} · ${SF.ME.code}` : 'Hesap';
    }
  }
  function hideAccountMenu() { const m = $('#account-menu'); m.hidden = true; $('#account-btn').setAttribute('aria-expanded', 'false'); }
  function toggleAccountMenu() {
    if (SF.mode === 'live' && !SF.ME.signedIn) { openAuth('signin'); return; }
    const m = $('#account-menu');
    if (!m.hidden) { hideAccountMenu(); return; }
    const live = SF.mode === 'live';
    const email = live && Backend.user ? Backend.user.email : '';
    m.innerHTML = `<div class="am-head"><b>${esc(SF.ME.name || 'Yatırımcı')}</b><span class="mono">${esc(SF.ME.code || '')}</span>${email ? `<small>${esc(email)}</small>` : ''}</div>
      ${live ? '<button class="am-item" role="menuitem" data-action="sign-out">Çıkış yap</button>'
             : '<p class="am-note">Demo modundasınız. Veriler tarayıcıda üretilir. Gerçek hesaplar için assets/config.js dosyasına Supabase bilgilerini girin.</p>'}`;
    m.hidden = false;
    $('#account-btn').setAttribute('aria-expanded', 'true');
  }

  function openAuth(mode, note) {
    if (!window.Backend || !Backend.client) { toast('Giriş için veritabanı bağlantısı gerekli.'); return; }
    if (state.wiz) closeWizard();
    state.auth = { mode: mode || 'signin', note: note || '', error: '', info: '', busy: false, email: '', name: '', opener: document.activeElement };
    $('#modal-root').hidden = false;
    document.body.style.overflow = 'hidden';
    renderAuth(); focusAuth();
  }
  function focusAuth() { setTimeout(() => { const f = $('#auth-name') || $('#auth-email'); if (f) f.focus(); }, 30); }
  function closeAuth() {
    const opener = state.auth && state.auth.opener;
    state.auth = null;
    $('#modal-root').hidden = true; $('#modal-root').innerHTML = '';
    if (!state.drawer) document.body.style.overflow = '';
    if (opener && document.body.contains(opener)) opener.focus();
  }
  function renderAuth() {
    const a = state.auth; if (!a) return;
    const up = a.mode === 'signup';
    $('#modal-root').innerHTML = `<div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div class="modal-head"><div class="modal-head-top"><div><p class="eyebrow">SanalFabrika hesabı</p><h2 id="auth-title">${up ? 'Hesap oluştur' : 'Giriş yap'}</h2></div>
        <button class="icon-btn" data-action="auth-close" aria-label="Kapat">${ICON.close}</button></div>
        ${a.note ? `<p>${esc(a.note)}</p>` : ''}</div>
      <form class="modal-body auth-form" id="auth-form" novalidate>
        ${up ? `<label class="field" for="auth-name"><span>Ad soyad</span><input id="auth-name" autocomplete="name" value="${esc(a.name)}" required></label>` : ''}
        <label class="field" for="auth-email"><span>E-posta</span><input id="auth-email" type="email" autocomplete="email" value="${esc(a.email)}" required></label>
        <label class="field" for="auth-pass"><span>Şifre</span><input id="auth-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required>
          ${up ? '<small class="muted">En az 6 karakter.</small>' : ''}</label>
        ${a.error ? `<p class="form-error" role="alert">${esc(a.error)}</p>` : ''}
        ${a.info ? `<p class="form-info" role="status">${esc(a.info)}</p>` : ''}
        <button class="btn btn-primary" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Bekleyin…' : (up ? 'Hesap oluştur' : 'Giriş yap')}</button>
        <p class="muted auth-switch">${up ? 'Zaten hesabınız var mı?' : 'Hesabınız yok mu?'}
          <button type="button" class="link-btn" data-action="auth-mode" data-mode="${up ? 'signin' : 'signup'}">${up ? 'Giriş yapın' : 'Ücretsiz hesap oluşturun'}</button></p>
      </form></div>`;
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'auth-form') return;
    e.preventDefault();
    const a = state.auth; if (!a || a.busy) return;
    a.email = $('#auth-email').value.trim();
    a.name = $('#auth-name') ? $('#auth-name').value.trim() : '';
    const pw = $('#auth-pass').value;
    a.info = '';
    if (!/^\S+@\S+\.\S+$/.test(a.email)) { a.error = 'Geçerli bir e-posta adresi girin.'; renderAuth(); focusAuth(); return; }
    if (pw.length < 6) { a.error = 'Şifre en az 6 karakter olmalı.'; renderAuth(); focusAuth(); return; }
    if (a.mode === 'signup' && !a.name) { a.error = 'Adınızı girin.'; renderAuth(); focusAuth(); return; }
    a.busy = true; a.error = ''; renderAuth();
    const job = a.mode === 'signup' ? Backend.signUp(a.email, pw, a.name) : Backend.signIn(a.email, pw).then(() => ({}));
    job.then(res => {
      if (state.auth !== a) return;
      if (res && res.needsConfirm) {
        a.busy = false; a.mode = 'signin';
        a.info = 'Hesabınız oluşturuldu. E-postanıza gelen onay bağlantısına tıkladıktan sonra giriş yapın.';
        renderAuth(); return;
      }
      closeAuth();
      toast('Giriş yapıldı. Verileriniz yükleniyor.');
    }).catch(err => {
      if (state.auth !== a) return;
      a.busy = false; a.error = err.message; renderAuth(); focusAuth();
    });
  });

  /* =========================================================
     OLAYLAR
     ========================================================= */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  document.addEventListener('click', e => {
    const menu = $('#account-menu');
    if (menu && !menu.hidden && !e.target.closest('#account-menu') && !e.target.closest('#account-btn')) hideAccountMenu();
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (el.tagName === 'A') e.preventDefault();
    switch (a) {
      case 'view': if (state.drawer) closeDrawer(); setView(el.dataset.view); break;
      case 'factory': state.factory = el.dataset.id; render(); break;
      case 'open-machine': openMachine(el.dataset.id, el.dataset.tab); break;
      case 'close-drawer': closeDrawer(); break;
      case 'drawer-tab': state.drawer.tab = el.dataset.tab; $$('#drawer .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === el.dataset.tab)); renderDrawerBody(); break;
      case 'cal-week': {
        const dl = +el.dataset.delta; state.drawer.week = dl === 0 ? 0 : state.drawer.week + dl; state.drawer.sel = null; renderDrawerBody();
        if (SF.mode === 'live') {
          const id = state.drawer.id, ws = SF.addDays(SF.startOfWeek(Date.now()), state.drawer.week * 7);
          Backend.ensureRange(id, ws - DAY, SF.addDays(ws, 8))
            .then(changed => { if (changed && state.drawer && state.drawer.id === id && state.drawer.tab === 'takvim') renderDrawerBody(); })
            .catch(err => toast(err.message));
        }
        break;
      }
      case 'sel-job': state.drawer.sel = el.dataset.job && state.drawer.sel !== el.dataset.job ? el.dataset.job : null; { const sc = $('#drawer-body').scrollTop; renderDrawerBody(); $('#drawer-body').scrollTop = sc; } break;
      case 'buy':
        if (SF.mode === 'live' && !SF.ME.signedIn) openAuth('signin', 'Makine satın almak için giriş yapın veya ücretsiz hesap oluşturun.');
        else openWizard(el.dataset.factory, el.dataset.slot);
        break;
      case 'wiz-close': { const wasDone = state.wiz && state.wiz.done; closeWizard(); if (wasDone) render(); break; }
      case 'wiz-axes': state.wiz.axes = +el.dataset.axes; renderWizard(); break;
      case 'wiz-model': state.wiz.ownShare = +el.dataset.share; renderWizard(); break;
      case 'wiz-next': state.wiz.step = Math.min(3, state.wiz.step + 1); renderWizard(); $('#modal-root .modal-body').scrollTop = 0; break;
      case 'wiz-back': state.wiz.step = Math.max(1, state.wiz.step - 1); renderWizard(); break;
      case 'wiz-confirm': {
        const w = state.wiz; if (!w.agree || w.busy) break;
        const req = { factory: w.factory, slot: w.slot, axes: w.axes, ownShare: w.ownShare, util: w.util };
        if (SF.mode === 'live') {
          w.busy = true; w.error = ''; renderWizard();
          Backend.purchase(req).then(id => {
            if (state.wiz !== w) return;
            w.busy = false; w.done = id; renderWizard(); render();
            toast(`${id} siparişi kaydedildi. Tedarik süreci başladı.`);
          }).catch(err => {
            if (state.wiz !== w) return;
            w.busy = false; w.error = err.message; renderWizard();
          });
        } else {
          const m = SF.purchase(req);
          w.done = m.id; renderWizard(); render();
          toast(`${m.id} siparişi oluşturuldu. Tedarik süreci başladı.`);
        }
        break;
      }
      case 'wiz-goto-mine': closeWizard(); state.period = 'today'; setView('makinelerim'); break;
      case 'period': state.period = el.dataset.period; render(); break;
      case 'split-axes': state.splitAxes = +el.dataset.axes; render(); break;
      case 'an-table': state.an.table = !state.an.table; render(); break;
      case 'theme': toggleTheme(); break;
      case 'account': toggleAccountMenu(); break;
      case 'auth-open': openAuth(el.dataset.mode || 'signin'); break;
      case 'auth-close': closeAuth(); break;
      case 'auth-mode': state.auth.mode = el.dataset.mode; state.auth.error = ''; state.auth.info = ''; renderAuth(); focusAuth(); break;
      case 'sign-out':
        hideAccountMenu();
        Backend.signOut().then(() => toast('Çıkış yapıldı.')).catch(err => toast(err.message));
        break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'mine-only') { state.mineOnly = t.checked; refreshFloor(); }
    else if (t.id === 'an-month') { state.an.month = +t.value; render(); }
    else if (t.id === 'an-machine') { state.an.machine = t.value; render(); }
    else if (t.id === 'wiz-agree') { state.wiz.agree = t.checked; const b = $('[data-action="wiz-confirm"]'); if (b) b.disabled = !t.checked || !!state.wiz.busy; }
  });
  document.addEventListener('input', e => {
    const t = e.target; const w = state.wiz; if (!w) return;
    if (t.id === 'wiz-own') { w.ownShare = +t.value / 100; $('#wiz-own-v').textContent = pct(w.ownShare); }
    else if (t.id === 'wiz-util') { w.util = +t.value / 100; $('#wiz-util-v').textContent = pct(w.util); }
    else return;
    $('#wiz-proj').innerHTML = projectionHTML(w);
    $$('.model-opt').forEach(b => b.setAttribute('aria-checked', Math.abs(+b.dataset.share - w.ownShare) < 0.001));
  });
  document.addEventListener('toggle', e => {
    const d = e.target; if (!d.dataset || !d.dataset.det) return;
    if (d.open) openDetails.add(d.dataset.det); else openDetails.delete(d.dataset.det);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#account-menu').hidden) hideAccountMenu();
      else if (state.auth) closeAuth();
      else if (state.wiz) closeWizard();
      else if (state.drawer) closeDrawer();
    }
  });
  $('#modal-root').addEventListener('click', e => {
    if (e.target.id !== 'modal-root') return;
    if (state.auth) { closeAuth(); return; }
    const wasDone = state.wiz && state.wiz.done; closeWizard(); if (wasDone) render();
  });

  // veri ipucu (şelale, ısı haritası)
  function showTT(t, x, y) {
    const rows = (t.dataset.tt || '').split(';;').filter(Boolean).map(r => { const [label, value, color] = r.split('|'); return { label, value, color }; });
    Charts.Tip.show(x, y, t.dataset.ttTitle, rows);
  }
  document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-tt-title]'); if (t) showTT(t, e.clientX, e.clientY); });
  document.addEventListener('pointermove', e => { const t = e.target.closest && e.target.closest('[data-tt-title]'); if (t) Charts.Tip.pos(e.clientX, e.clientY); });
  document.addEventListener('pointerout', e => { const t = e.target.closest && e.target.closest('[data-tt-title]'); if (t && !t.contains(e.relatedTarget)) Charts.Tip.hide(); });
  document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tt-title]'); if (t) { const r = t.getBoundingClientRect(); showTT(t, r.left + r.width / 2, r.bottom); } });
  document.addEventListener('focusout', e => { const t = e.target.closest && e.target.closest('[data-tt-title]'); if (t) Charts.Tip.hide(); });

  /* ---------- tema ---------- */
  function currentDark() {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncThemeIcon() { $('#theme-btn').innerHTML = currentDark() ? ICON.sun : ICON.moon; }
  function toggleTheme() {
    const next = currentDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sf-theme', next); } catch (e) { /* depolama yok */ }
    syncThemeIcon();
    if (state.view === 'analiz') drawAnalyticsCharts();
  }
  try { const t = localStorage.getItem('sf-theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* depolama yok */ }
  syncThemeIcon();

  /* ---------- canlı saat ve sayaçlar ---------- */
  function tickTop() {
    const now = Date.now();
    $('#clock').textContent = fClock.format(now);
    const box = $('.top-net');
    box.hidden = SF.mode === 'live' && !SF.ME.signedIn;
    if (box.hidden) return;
    const s = SF.sumStats(SF.myMachines(), SF.startOfMonth(now), now);
    $('#top-net').textContent = usd(s.net);
  }
  setInterval(() => { tickTop(); tickMine(); }, 1000);
  setInterval(() => {
    if (state.wiz || state.auth || state.booting) return;
    if (state.view === 'fabrikalar') refreshFloor();
    if (state.view === 'makinelerim') {
      const k = $('#my-kpis'); if (k) k.innerHTML = myKpisHTML();
      const c = $('#my-cards'); if (c) c.innerHTML = SF.myMachines().slice().sort((x, y) => (x.proc - y.proc) || (y.isNew - x.isNew)).map(machineCardHTML).join('');
    }
  }, 20000);
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawAnalyticsCharts, 150); });

  /* ---------- açılış ---------- */
  function fromHash() {
    const h = (location.hash || '').replace('#', '');
    return VIEWS.includes(h) ? h : 'fabrikalar';
  }
  window.addEventListener('hashchange', () => { const v = fromHash(); if (v !== state.view) setView(v, false); });
  state.view = fromHash();
  if (window.Backend && Backend.enabled) {
    state.booting = true;
    render();
    Backend.onChange = () => {
      Backend.load().then(() => {
        render(); tickTop();
        if (state.drawer) { if (SF.machine(state.drawer.id)) renderDrawer(); else closeDrawer(); }
      }).catch(err => toast(err.message));
    };
    Backend.init().then(() => {
      state.booting = false; render(); tickTop();
    }).catch(err => {
      state.booting = false; state.bootError = err.message; render(); tickTop();
      toast('Veritabanına bağlanılamadı. Demo verisi gösteriliyor.');
      console.error('SanalFabrika:', err);
    });
    // Diğer yatırımcıların siparişleri ve yeni işler için düzenli yenileme
    setInterval(() => {
      if (SF.mode !== 'live' || state.wiz || state.auth || document.hidden) return;
      Backend.load().then(() => {
        if (state.view === 'fabrikalar') refreshFloor();
        else if (state.view === 'makinelerim') render();
      }).catch(() => { /* bir sonraki denemede tekrar */ });
    }, 180000);
  } else {
    render();
  }
  tickTop();
})();
