/* Emek Sermaye · yatırımcı platformu
   Görünümler: Tesisler (harita + slotlar), Makinelerim, makine ayrıntısı, Analiz.
   Veri Firestore'dan gelir (assets/firebase.js); burada veri üretilmez. */
(function () {
  'use strict';
  const SF = window.SF, Charts = window.Charts;
  const { MIN, DAY } = SF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- biçimlendirme ---------- */
  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nfC = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const _u0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const _u2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = v => _u0.format(v || 0);
  const usd2 = v => _u2.format(v || 0);
  const usdC = v => {
    const a = Math.abs(v || 0);
    if (a >= 1e6) return '$' + nfC.format(a / 1e6) + ' Mn';
    if (a >= 1e5) return '$' + nf0.format(a / 1e3) + ' bin';
    if (a >= 1e3) return '$' + nfC.format(a / 1e3) + ' bin';
    return _u0.format(a);
  };
  const pct = v => '%' + nf0.format((v || 0) * 100);
  const num = v => nf0.format(v || 0);
  const F = o => new Intl.DateTimeFormat('tr-TR', o);
  const fTime = F({ hour: '2-digit', minute: '2-digit' });
  const fDay = F({ day: 'numeric', month: 'short' });
  const fDayY = F({ day: 'numeric', month: 'short', year: 'numeric' });
  const fFull = F({ day: 'numeric', month: 'long', year: 'numeric' });
  const fWd = F({ weekday: 'short' });
  const fMonth = F({ month: 'long', year: 'numeric' });
  const cap = s => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
  const dayLabel = t => `${cap(fWd.format(t))} ${fDay.format(t)}`;
  function whenShort(t) {
    const diff = Math.round((SF.startOfDay(t) - SF.startOfDay(Date.now())) / DAY);
    const tm = fTime.format(t);
    if (diff === 0) return 'Bugün ' + tm;
    if (diff === 1) return 'Yarın ' + tm;
    if (diff === -1) return 'Dün ' + tm;
    return fDay.format(t) + ' ' + tm;
  }
  function dur(min) {
    min = Math.max(0, Math.round(min));
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d) return `${d} g ${h} sa`;
    if (h) return `${h} sa ${m} dk`;
    return `${m} dk`;
  }

  /* ---------- durum ---------- */
  const VIEWS = ['tesisler', 'makinelerim', 'analiz', 'yonetim'];
  const state = {
    view: 'tesisler', facility: null, machineId: null, week: 0, selJob: null,
    month: SF.startOfMonth(Date.now()), anMachine: 'all',
    booting: true, error: '', modal: null, after: null
  };
  const navView = () => (state.view === 'makine' ? 'makinelerim' : state.view);
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

  const statusTag = st => `<span class="st st-${st}">${SF.STATUS_LABEL[st] || ''}</span>`;
  const typeName = m => `${m.axes} eksen${m.model ? ' · ' + esc(m.model) : ''}`;

  /* ---------- üst menü ---------- */
  function syncHeader() {
    $$('.main-nav a').forEach(a => a.setAttribute('aria-current', a.dataset.view === navView() ? 'page' : 'false'));
    const adminLink = $('#nav-admin');
    if (adminLink) adminLink.hidden = state.booting || !SF.ME.staff;
    const box = $('#account');
    if (state.booting || state.error) { box.innerHTML = ''; return; }
    if (!SF.ME.signedIn) {
      box.innerHTML = `<button class="text-link as-btn" data-action="auth" data-mode="signin">Giriş yap</button>
        <button class="btn btn-primary" data-action="auth" data-mode="signup">Yatırımcı ol</button>`;
      return;
    }
    box.innerHTML = `<div class="account">
      <button class="avatar" id="account-btn" data-action="account" aria-haspopup="menu" aria-expanded="false" title="${esc(SF.ME.name)}">${esc(SF.ME.initials)}</button>
      <div class="account-menu" id="account-menu" role="menu" hidden>
        <div class="am-head"><b>${esc(SF.ME.name || 'Yatırımcı')}</b><span>${esc(SF.ME.code)}</span><small>${esc(SF.ME.email)}</small></div>
        <button class="am-item" role="menuitem" data-action="sign-out">Çıkış yap</button>
      </div></div>`;
  }
  function hideAccountMenu() {
    const m = $('#account-menu'); if (!m) return;
    m.hidden = true; $('#account-btn').setAttribute('aria-expanded', 'false');
  }

  /* ---------- yönlendirme ---------- */
  function setView(v) {
    if (!VIEWS.includes(v) && v !== 'makine') v = 'tesisler';
    state.view = v;
    if (v !== 'makine') { state.machineId = null; try { history.replaceState(null, '', '#' + v); } catch (e) { /* önizleme */ } }
    render();
    window.scrollTo({ top: 0 });
  }
  function render() {
    syncHeader();
    Charts.Tip.hide();
    const main = $('#view');
    if (state.view !== 'tesisler') destroyMap();
    if (state.booting) { main.innerHTML = '<p class="state-msg" role="status">Yükleniyor…</p>'; return; }
    if (state.error) {
      main.innerHTML = `<section class="empty"><h1>Verilere ulaşılamadı</h1><p>${esc(state.error)}</p>
        <button class="btn btn-primary" data-action="retry">Yeniden dene</button></section>`;
      return;
    }
    if (state.view === 'yonetim' && !(SF.ME.staff && window.EmekAdmin)) state.view = 'tesisler';
    const v = state.view;
    if (v === 'tesisler') { main.innerHTML = viewFacilities(); mountMap(); }
    else if (!SF.ME.signedIn) main.innerHTML = signInPrompt(v);
    else if (v === 'yonetim') main.innerHTML = window.EmekAdmin.view();
    else if (v === 'makinelerim') main.innerHTML = viewMine();
    else if (v === 'makine') main.innerHTML = viewMachine();
    else { main.innerHTML = viewAnalytics(); drawCharts(); }
  }
  function emptyState(title, head, text, cta, view) {
    return `<section class="page-head"><h1>${esc(title)}</h1></section>
      <section class="empty"><h2>${esc(head)}</h2><p>${esc(text)}</p>
        <button class="btn btn-primary" data-action="view" data-view="${view}">${esc(cta)}</button></section>`;
  }
  function signInPrompt(view) {
    const title = view === 'analiz' ? 'Analiz' : 'Makinelerim';
    return `<section class="page-head"><h1>${title}</h1></section>
      <section class="empty"><h2>Giriş yapın</h2>
        <p>${view === 'analiz' ? 'Kârlılık analizinizi' : 'Tezgâhlarınızı ve kazancınızı'} görmek için hesabınıza giriş yapın. Tesisleri giriş yapmadan da inceleyebilirsiniz.</p>
        <div class="row-actions"><button class="btn btn-primary" data-action="auth" data-mode="signin">Giriş yap</button>
          <button class="btn btn-plain" data-action="auth" data-mode="signup">Hesap oluştur</button></div></section>`;
  }

  /* =========================================================
     TESİSLER
     ========================================================= */
  function viewFacilities() {
    if (!SF.FACILITIES.length) {
      return `<section class="page-head"><h1>Tesisler</h1><p class="lead">Henüz yayınlanmış bir tesis yok.</p></section>`;
    }
    if (!state.facility || !SF.facility(state.facility)) state.facility = SF.FACILITIES[0].id;
    return `<section class="page-head"><h1>Tesisler</h1>
        <p class="lead">Tezgâhların çalıştığı tesisler ve yatırıma açık slotlar.</p></section>
      <div class="map" id="map" role="region" aria-label="Tesislerin haritası"></div>
      <div id="facility-body">${facilityBody()}</div>`;
  }

  function facilityBody() {
    const fs = SF.FACILITIES;
    const f = SF.facility(state.facility);
    const ms = SF.machinesIn(f.id);
    const running = ms.filter(m => !m.proc && m.liveStatus === 'running').length;
    const empty = f.slots.filter(s => !SF.machineAt(f.id, s));
    const photo = f.photos[0];
    const tabs = fs.length > 1
      ? `<div class="tabs" role="tablist" aria-label="Tesis seçimi">${fs.map(x => `<button role="tab" aria-selected="${x.id === f.id}" data-action="facility" data-id="${esc(x.id)}">${esc(x.short)}</button>`).join('')}</div>`
      : '';
    const since = f.status === 'building' ? 'Kurulum aşamasında' : (f.openedAt ? `${fFull.format(f.openedAt)} tarihinden beri üretimde` : 'Üretimde');
    const credit = photo && photo.credit
      ? ` · Fotoğraf: ${photo.sourceUrl ? `<a href="${esc(photo.sourceUrl)}" target="_blank" rel="noopener">${esc(photo.credit)}</a>` : esc(photo.credit)}${photo.license ? ', ' + esc(photo.license) : ''}`
      : '';
    const figure = photo ? `<figure class="photo">
        <img src="${esc(photo.src)}" alt="${esc(photo.alt || f.name)}" loading="lazy" width="1280" height="852">
        ${photo.representative || credit ? `<figcaption>${photo.representative ? 'Temsili görsel' : esc(f.name)}${credit}</figcaption>` : ''}
      </figure>` : '';
    const rows = ms.map(m => {
      const st = SF.statusOf(m);
      const owner = m.mine ? '<span class="mine">Sizin</span>' : esc(m.ownerLabel || 'Yatırımcıya ait');
      const inner = `<span class="slot-code">${esc(m.slot)}</span>
        <span class="mname"><b>${m.axes} eksen</b>${m.model ? `<span>${esc(m.model)}</span>` : ''}</span>
        ${statusTag(st)}<span class="owner">${owner}</span>`;
      return m.mine
        ? `<li><button class="mrow is-link" data-action="machine" data-id="${esc(m.id)}" aria-label="${esc(m.id)} ayrıntısını aç">${inner}</button></li>`
        : `<li><div class="mrow">${inner}</div></li>`;
    }).join('');
    const open = empty.length ? `
        <h3>Yatırıma açık slotlar <span class="count">${empty.length}</span></h3>
        <div class="open-slots">
          <div class="slot-chips" role="group" aria-label="Boş slotlar">
            ${empty.map(s => `<button class="slot-chip" data-action="request" data-facility="${esc(f.id)}" data-slot="${esc(s)}" aria-label="${esc(s)} slotu için yatırım talebi oluştur">${esc(s)}</button>`).join('')}
          </div>
          <p class="fine">Bir slot seçerek yatırım talebi oluşturabilirsiniz. Talep bir ön başvurudur, ödeme alınmaz.</p>
          <button class="btn btn-primary" data-action="request" data-facility="${esc(f.id)}" data-slot="">Yatırım talebi oluştur</button>
        </div>` : `<h3>Yatırıma açık slotlar</h3><p class="fine">Bu tesisteki slotların tamamı dolu.</p>`;
    return `${tabs}
      <section class="facility">
        <div class="facility-top">
          <div class="facility-info">
            <h2>${esc(f.name)}</h2>
            <p class="meta">${esc(f.city)} · ${since}</p>
            ${f.description ? `<p>${esc(f.description)}</p>` : ''}
            ${f.address ? `<p class="meta">${esc(f.address)}</p>` : ''}
            <dl class="facts">
              <div><dt>Slot</dt><dd>${f.slots.length}</dd></div>
              <div><dt>Çalışan tezgâh</dt><dd>${running}</dd></div>
              <div><dt>Boş slot</dt><dd>${empty.length}</dd></div>
            </dl>
          </div>
          ${figure}
        </div>
        <h3>Tezgâhlar <span class="count">${ms.length}</span></h3>
        ${rows ? `<ul class="mlist">${rows}</ul>` : '<p class="fine">Bu tesiste henüz tezgâh yok.</p>'}
        ${open}
      </section>`;
  }
  function renderFacilityBody() {
    const el = $('#facility-body');
    if (el && state.view === 'tesisler') { el.innerHTML = facilityBody(); syncPins(); }
  }

  /* ---------- harita ---------- */
  let map = null, pins = {};
  function loadLeaflet() {
    return new Promise((resolve, reject) => {
      if (window.L) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = () => resolve(); s.onerror = () => reject(new Error('harita yüklenemedi'));
      document.head.appendChild(s);
    });
  }
  function destroyMap() { if (map) { map.remove(); map = null; pins = {}; } }
  function syncPins() {
    Object.keys(pins).forEach(id => { const el = pins[id].getElement(); if (el) el.classList.toggle('is-on', id === state.facility); });
  }
  function mountMap() {
    const el = $('#map'); if (!el) return;
    const fs = SF.FACILITIES.filter(f => isFinite(f.lat) && isFinite(f.lng));
    if (!fs.length) { el.hidden = true; return; }
    loadLeaflet().then(() => {
      if (!document.body.contains(el) || state.view !== 'tesisler') return;
      destroyMap();
      const L = window.L;
      map = L.map(el, { scrollWheelZoom: false });
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıda bulunanlar'
      }).addTo(map);
      fs.forEach(f => {
        const pin = L.marker([f.lat, f.lng], {
          icon: L.divIcon({ className: 'pin', iconSize: [22, 22], iconAnchor: [11, 11] }), title: f.name, alt: f.name
        }).addTo(map);
        pin.bindTooltip(f.name, { permanent: true, direction: 'right', offset: [14, 0], className: 'pin-label' });
        pin.on('click', () => { state.facility = f.id; renderFacilityBody(); });
        pins[f.id] = pin;
      });
      if (fs.length === 1) map.setView([fs[0].lat, fs[0].lng], 9);
      else map.fitBounds(L.latLngBounds(fs.map(f => [f.lat, f.lng])).pad(0.35));
      syncPins();
    }).catch(() => { el.hidden = true; });
  }

  /* =========================================================
     MAKİNELERİM
     ========================================================= */
  function kpi(label, value, sub) {
    return `<div class="kpi"><dt>${label}</dt><dd>${value}</dd>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }
  function viewMine() {
    const now = Date.now();
    const mine = SF.myMachines();
    const active = mine.filter(m => !m.proc && m.commission);
    const reqs = SF.REQUESTS.filter(r => r.uid === SF.ME.uid);
    if (!mine.length && !reqs.length) {
      return emptyState('Makinelerim', 'Henüz tezgâhınız yok',
        'Tesisler sayfasında yatırıma açık bir slot seçip yatırım talebi oluşturabilirsiniz. Talebiniz ve tezgâhınız burada görünür.',
        'Tesisleri incele', 'tesisler');
    }
    let kpis = '';
    if (active.length) {
      const month = SF.sumStats(active, SF.startOfMonth(now), now), today = SF.sumStats(active, SF.startOfDay(now), now);
      kpis = `<dl class="kpis">
        ${kpi('Bu ay net kazanç', usd(month.net), `${usd(month.gross)} brüt gelir`)}
        ${kpi('Bugün net kazanç', usd2(today.net), `${num(today.parts)} parça üretildi`)}
        ${kpi('Bu ay üretilen parça', num(month.parts))}
        ${kpi('Bu ay doluluk', pct(month.util), dur(month.minutes) + ' çalışma')}
      </dl>`;
    }
    const reqHTML = reqs.length ? `<section class="block"><h2>Talepleriniz</h2><ul class="rlist">${reqs.map(r => {
      const f = SF.facility(r.facilityId);
      return `<li><span class="rmain"><b>${r.axes} eksen tezgâh</b><span>${esc(f ? f.name : r.facilityId)}${r.slot ? ', slot ' + esc(r.slot) : ''} · ${r.createdAt ? fDayY.format(r.createdAt) : ''}</span></span>
        <span class="rstatus rs-${esc(r.status)}">${esc(SF.REQUEST_STATUS[r.status] || r.status)}</span>
        ${r.status === 'new' ? `<button class="text-link as-btn" data-action="cancel-request" data-id="${esc(r.id)}">Geri çek</button>` : '<span></span>'}</li>`;
    }).join('')}</ul></section>` : '';
    const machHTML = mine.length ? `<section class="block"><h2>Tezgâhlarınız</h2><ul class="mlist">${mine.map(m => {
      const f = SF.facility(m.facility);
      const st = SF.statusOf(m);
      let nums;
      if (m.proc || !m.commission) {
        const p = SF.procInfo(m, now);
        nums = `<span class="mnum"><small>Adım ${p.idx + 1}/${p.steps.length}</small><b>${esc(p.cur.label)}</b></span>
          <span class="mnum"><small>Üretime hazır</small><b>${fDay.format(p.readyAt)}</b></span>`;
      } else {
        const s = SF.windowStats(m, Math.max(SF.startOfMonth(now), m.commission), now);
        const back = SF.windowStats(m, m.commission, now).net;
        nums = `<span class="mnum"><small>Bu ay net</small><b>${usd(s.net)}</b></span>
          <span class="mnum"><small>Geri dönen yatırım</small><b>${pct(m.invest ? back / m.invest : 0)}</b></span>`;
      }
      return `<li><button class="mrow is-link is-wide" data-action="machine" data-id="${esc(m.id)}">
        <span class="mname"><b>${esc(m.id)}</b><span>${typeName(m)} · ${esc(f ? f.name : '')}, slot ${esc(m.slot)}</span></span>
        ${statusTag(st)}${nums}<span class="chev" aria-hidden="true">›</span></button></li>`;
    }).join('')}</ul></section>` : '';
    return `<section class="page-head"><h1>Makinelerim</h1></section>${kpis}${machHTML}${reqHTML}`;
  }

  /* ---------- makine ayrıntısı ---------- */
  function viewMachine() {
    const m = SF.machine(state.machineId);
    if (!m || !m.mine) { state.view = 'makinelerim'; return viewMine(); }
    const now = Date.now();
    const f = SF.facility(m.facility);
    const st = SF.statusOf(m);
    const head = `<p class="back"><button class="text-link as-btn" data-action="view" data-view="makinelerim">‹ Makinelerim</button></p>
      <section class="page-head"><h1>${esc(m.id)}</h1>
        <p class="lead">${typeName(m)} · ${esc(f ? f.name : '')}, slot ${esc(m.slot)}${m.type ? ` · ${usd2(m.type.rate)}/dk` : ''}</p>
        <p>${statusTag(st)}</p></section>`;
    if (m.proc || !m.commission) {
      const p = SF.procInfo(m, now);
      return `${head}
        <dl class="kpis">
          ${kpi('Sipariş tarihi', fDayY.format(m.orderDate))}
          ${kpi('Aktif adım', `${p.idx + 1} / ${p.steps.length}`, esc(p.cur.label))}
          ${kpi('Genel ilerleme', pct(p.overall))}
          ${kpi('Üretime hazır', fDay.format(p.readyAt), p.daysLeft + ' gün kaldı')}
        </dl>
        <section class="block"><h2>Tedarik ve kurulum adımları</h2>${timelineHTML(p.steps, p.idx)}</section>`;
    }
    const ms = Math.max(SF.startOfMonth(now), m.commission);
    const month = SF.windowStats(m, ms, now), today = SF.windowStats(m, Math.max(SF.startOfDay(now), m.commission), now);
    const back = SF.windowStats(m, m.commission, now).net;
    const j = SF.jobAt(m, now);
    let current = '';
    if (j && j.kind === 'job') {
      const done = SF.partsDone(j, now);
      current = `<section class="block"><h2>Şu anki iş</h2>
        <div class="current"><div><b>${esc(j.part)}</b><span>${esc([j.customer, j.mat].filter(Boolean).join(' · '))}</span></div>
          <div class="progress"><span style="width:${(j.qty ? done / j.qty * 100 : 0).toFixed(1)}%"></span></div>
          <p class="fine">${done} / ${j.qty} parça · ${SF.SOURCE_LABEL[j.source]} · bitiş ${whenShort(j.end)}</p></div></section>`;
    }
    return `${head}
      <dl class="kpis">
        ${kpi('Bugün net kazanç', usd2(today.net), `${num(today.parts)} parça`)}
        ${kpi('Bu ay net kazanç', usd(month.net), `${usd(month.gross)} brüt`)}
        ${kpi('Bu ay doluluk', pct(month.util), dur(month.minutes) + ' çalışma')}
        ${kpi('Geri dönen yatırım', pct(m.invest ? back / m.invest : 0), `${usd(back)} / ${usd(m.invest)}`)}
      </dl>
      ${current}
      <section class="block" id="calendar">${calendarHTML(m)}</section>
      <section class="block"><h2>${cap(fMonth.format(now))} gelir dökümü</h2>${breakdownTable(month)}</section>`;
  }

  function breakdownTable(s) {
    const rows = [['Brüt gelir', usd(s.gross), 'strong']]
      .concat(SF.COST_KEYS.map(k => [SF.COST_LABELS[k], '−' + usd(s.cost[k]), '']))
      .concat([[`Platform payı`, '−' + usd(s.fee), ''], ['Net kazanç', usd(s.net), 'total']]);
    return `<table class="tbl tbl-sm"><tbody>${rows.map(r => `<tr class="${r[2]}"><th scope="row">${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
  }

  function timelineHTML(steps, curIdx) {
    return `<ol class="timeline">${steps.map((s, i) => {
      const cls = i < curIdx ? 'is-done' : i === curIdx ? 'is-cur' : '';
      const when = s.days ? `${s.days} gün · ${fDay.format(s.start)} – ${fDay.format(s.end)}` : fDayY.format(s.start);
      return `<li class="${cls}"><div><b>${esc(s.label)}</b><p>${esc(s.desc)}</p></div><span>${when}</span></li>`;
    }).join('')}</ol>`;
  }

  /* ---------- takvim ---------- */
  function calendarHTML(m) {
    const now = Date.now();
    const ws = SF.addDays(SF.startOfWeek(now), state.week * 7), we = SF.addDays(ws, 7);
    const days = Array.from({ length: 7 }, (_, i) => SF.addDays(ws, i));
    const jobs = m.jobs.filter(j => j.end > ws && j.start < we);
    const hours = [0, 6, 12, 18, 24];
    const rows = days.map(ds => {
      const de = SF.addDays(ds, 1);
      const isToday = now >= ds && now < de;
      const blocks = jobs.filter(j => j.end > ds && j.start < de).map(j => {
        const a = Math.max(j.start, ds), b = Math.min(j.end, de);
        const left = (a - ds) / (de - ds) * 100, width = (b - a) / (de - ds) * 100;
        const cls = j.kind === 'maint' ? 'maint' : j.source;
        const label = j.kind === 'maint' ? j.title : j.part;
        const tip = `${label} · ${whenShort(j.start)} – ${whenShort(j.end)}`;
        return `<button class="cal-block ${cls}${j.end < now ? ' is-past' : ''}${state.selJob === j.id ? ' is-sel' : ''}" style="left:${left}%;width:${width}%" data-action="job" data-job="${esc(j.id)}" title="${esc(tip)}" aria-label="${esc(tip)}">${width > 12 ? `<span>${esc(label)}</span>` : ''}</button>`;
      }).join('');
      const nowLine = isToday ? `<i class="cal-now" style="left:${(now - ds) / DAY * 100}%"></i>` : '';
      return `<div class="cal-day${isToday ? ' is-today' : ''}"><b>${cap(fWd.format(ds))}</b><small>${fDay.format(ds)}</small></div><div class="cal-track">${blocks}${nowLine}</div>`;
    }).join('');
    const list = jobs.slice().sort((a, b) => a.start - b.start);
    const sel = state.selJob ? m.jobs.find(j => j.id === state.selJob) : null;
    const wk = state.week === 0 ? 'Bu hafta' : state.week === -1 ? 'Geçen hafta' : state.week === 1 ? 'Gelecek hafta' : '';
    return `<div class="cal-head">
        <h2>İş takvimi</h2>
        <div class="cal-nav">
          <span class="range">${wk ? wk + ' · ' : ''}${fDay.format(ws)} – ${fDayY.format(we - 1)}</span>
          <button class="btn btn-plain btn-sm" data-action="week" data-delta="-1" aria-label="Önceki hafta">‹</button>
          <button class="btn btn-plain btn-sm" data-action="week" data-delta="0">Bugün</button>
          <button class="btn btn-plain btn-sm" data-action="week" data-delta="1" aria-label="Sonraki hafta">›</button>
        </div>
      </div>
      <div class="cal-scroll"><div class="cal">
        <div class="cal-corner"></div>
        <div class="cal-hours">${hours.map(h => `<span style="left:${h / 24 * 100}%">${String(h).padStart(2, '0')}:00</span>`).join('')}</div>
        ${rows}
      </div></div>
      <p class="cal-legend"><span><i class="key own"></i>Kendi işim</span><span><i class="key platform"></i>Platform işi</span><span><i class="key maint"></i>Bakım</span></p>
      ${sel ? jobDetail(m, sel) : ''}
      ${list.length ? `<table class="tbl tbl-sm jobs"><thead><tr><th scope="col">İş</th><th scope="col" class="opt">Zaman</th><th scope="col">Adet</th><th scope="col">Net</th></tr></thead>
        <tbody>${list.map(j => jobRow(m, j)).join('')}</tbody></table>` : '<p class="fine">Bu hafta planlı iş yok.</p>'}`;
  }
  const jobNet = (m, j) => j.durMin * (m.type.rate - m.type.opRate - m.type.rate * SF.FEES[j.source]);
  function jobRow(m, j) {
    const now = Date.now();
    if (j.kind === 'maint') {
      return `<tr><th scope="row"><button class="text-link as-btn" data-action="job" data-job="${esc(j.id)}">${esc(j.title)}</button><small>Planlı bakım</small></th>
        <td class="opt">${whenShort(j.start)} – ${fTime.format(j.end)}</td><td>—</td><td>—</td></tr>`;
    }
    const stt = j.end < now ? 'Tamamlandı' : j.start > now ? 'Planlandı' : 'Sürüyor';
    return `<tr><th scope="row"><button class="text-link as-btn" data-action="job" data-job="${esc(j.id)}">${esc(j.part)}</button>
        <small>${esc([j.customer, SF.SOURCE_LABEL[j.source], stt].filter(Boolean).join(' · '))}</small></th>
      <td class="opt">${whenShort(j.start)} – ${whenShort(j.end)}</td>
      <td>${SF.partsDone(j, now)}/${j.qty}</td><td class="strong">${usd(jobNet(m, j))}</td></tr>`;
  }
  function jobDetail(m, j) {
    const close = `<button class="icon-btn" data-action="job" data-job="" aria-label="Kapat">${ICON_CLOSE}</button>`;
    if (j.kind === 'maint') {
      return `<div class="job-detail"><div class="jd-head"><h3>${esc(j.title)}</h3>${close}</div>
        <dl class="kv"><div><dt>Başlangıç</dt><dd>${whenShort(j.start)}</dd></div><div><dt>Bitiş</dt><dd>${whenShort(j.end)}</dd></div>
          <div><dt>Süre</dt><dd>${dur(j.durMin)}</dd></div><div><dt>Ücret</dt><dd>İşletme ücretine dahil</dd></div></dl></div>`;
    }
    const T = m.type;
    const g = j.durMin * T.rate, op = j.durMin * T.opRate, fee = g * SF.FEES[j.source];
    return `<div class="job-detail"><div class="jd-head"><h3>${esc(j.part)}</h3>${close}</div>
      <dl class="kv">
        ${j.customer ? `<div><dt>Müşteri</dt><dd>${esc(j.customer)}</dd></div>` : ''}
        ${j.order ? `<div><dt>Sipariş no</dt><dd>${esc(j.order)}</dd></div>` : ''}
        ${j.mat ? `<div><dt>Malzeme</dt><dd>${esc(j.mat)}</dd></div>` : ''}
        <div><dt>Kaynak</dt><dd>${SF.SOURCE_LABEL[j.source]}</dd></div>
        <div><dt>Adet</dt><dd>${SF.partsDone(j, Date.now())} / ${j.qty}</dd></div>
        <div><dt>Çevrim süresi</dt><dd>${nfC.format(j.cycle)} dk/parça</dd></div>
        <div><dt>Başlangıç</dt><dd>${whenShort(j.start)}</dd></div>
        <div><dt>Bitiş</dt><dd>${whenShort(j.end)}</dd></div>
        <div><dt>Brüt gelir</dt><dd>${usd(g)}</dd></div>
        <div><dt>İşletme ücreti</dt><dd>−${usd(op)}</dd></div>
        <div><dt>Platform payı ${pct(SF.FEES[j.source])}</dt><dd>−${usd(fee)}</dd></div>
        <div><dt>Size kalan</dt><dd class="strong">${usd(g - op - fee)}</dd></div>
      </dl></div>`;
  }

  /* =========================================================
     ANALİZ
     ========================================================= */
  const anActive = () => SF.myMachines().filter(m => !m.proc && m.commission);
  const anMachines = () => (state.anMachine === 'all' ? anActive() : anActive().filter(m => m.id === state.anMachine));
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
    const a = state.month, b = SF.addMonths(a, 1);
    const isCur = now >= a && now < b;
    const end = isCur ? now : b;
    const days = [];
    for (let d = a; d < b; d = SF.addDays(d, 1)) {
      const de = SF.addDays(d, 1);
      const future = d >= now;
      days.push({ d, future, partial: now >= d && now < de, st: SF.sumStats(ms, d, future ? de : Math.min(de, now)) });
    }
    return { now, ms, a, isCur, s: SF.sumStats(ms, a, end), days, per: ms.map(m => ({ m, s: SF.sumStats([m], a, end) })) };
  }
  function viewAnalytics() {
    if (!anActive().length) {
      return emptyState('Analiz', 'Analiz için üretimde bir tezgâhınız olmalı',
        'Tezgâhınız kurulup iş almaya başladığında gelir, gider ve kârlılık burada görünür.', 'Makinelerime git', 'makinelerim');
    }
    if (state.anMachine !== 'all' && !anActive().some(m => m.id === state.anMachine)) state.anMachine = 'all';
    const opts = monthOptions();
    if (!opts.includes(state.month)) state.month = opts[0];
    const D = analyticsData();
    const s = D.s;
    const monthName = cap(fMonth.format(D.a));
    return `<section class="page-head"><h1>Analiz</h1>
        <div class="filters">
          <label class="field-inline" for="an-month">Ay <select id="an-month">${opts.map(t => `<option value="${t}" ${t === state.month ? 'selected' : ''}>${cap(fMonth.format(t))}</option>`).join('')}</select></label>
          <label class="field-inline" for="an-machine">Tezgâh <select id="an-machine"><option value="all">Tümü</option>${anActive().map(m => `<option value="${esc(m.id)}" ${state.anMachine === m.id ? 'selected' : ''}>${esc(m.id)}</option>`).join('')}</select></label>
        </div></section>
      <dl class="kpis">
        ${kpi('Net kazanç', usd(s.net), D.isCur ? 'bugüne kadar' : '')}
        ${kpi('Brüt gelir', usd(s.gross))}
        ${kpi('Giderler', usd(s.op + s.fee), `${usd(s.op)} işletme · ${usd(s.fee)} platform payı`)}
        ${kpi('Doluluk', pct(s.util), `${num(s.parts)} parça · ${dur(s.minutes)}`)}
      </dl>
      <section class="block">
        <div class="block-head"><h2>Günlük net kazanç</h2>
          <p class="cal-legend"><span><i class="key own"></i>Kendi işim</span><span><i class="key platform"></i>Platform işi</span></p></div>
        <div class="chart" id="ch-daily"></div>
        ${D.isCur ? '<p class="fine chart-note">Açık renkli sütunlar takvimde planlanmış günlerdir.</p>' : ''}
      </section>
      <div class="two">
        <section class="block"><h2>${monthName} gelir dökümü</h2>${breakdownTable(s)}</section>
        <section class="block"><h2>Tezgâh bazında</h2>
          <div class="tbl-wrap"><table class="tbl tbl-sm">
            <thead><tr><th scope="col">Tezgâh</th><th scope="col">Doluluk</th><th scope="col" class="opt">Parça</th><th scope="col">Net</th></tr></thead>
            <tbody>${D.per.map(({ m, s: x }) => `<tr><th scope="row">${esc(m.id)}<small>${m.axes} eksen</small></th><td>${pct(x.util)}</td><td class="opt">${num(x.parts)}</td><td class="strong">${usd(x.net)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
      </div>`;
  }
  function drawCharts() {
    const el = $('#ch-daily');
    if (!el || state.view !== 'analiz') return;
    const D = analyticsData();
    Charts.stackedColumns(el, {
      height: 240,
      cats: D.days.map((x, i) => ({ label: String(i + 1), title: dayLabel(x.d) + (x.partial ? ' · sürüyor' : ''), planned: x.future, strong: x.partial })),
      series: [{ key: 'own', label: 'Kendi işim', color: 'var(--c-own)' }, { key: 'platform', label: 'Platform işi', color: 'var(--c-platform)' }],
      values: D.days.map(x => [x.st.own.net, x.st.platform.net]),
      fmtAxis: v => usdC(v), fmtVal: v => usd(v), totalLabel: 'Toplam net', ariaLabel: 'Günlük net kazanç'
    });
  }

  /* =========================================================
     PENCERELER: giriş ve yatırım talebi
     ========================================================= */
  function showModal(html) {
    const root = $('#modal-root');
    root.innerHTML = html; root.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    const opener = state.modal && state.modal.opener;
    state.modal = null;
    const root = $('#modal-root'); root.hidden = true; root.innerHTML = '';
    document.body.style.overflow = '';
    if (opener && document.body.contains(opener)) opener.focus();
  }
  function focusFirst() { setTimeout(() => { const f = $('#modal-root input, #modal-root select, #modal-root textarea'); if (f) f.focus(); }, 30); }

  function openAuth(mode, note) {
    state.modal = { type: 'auth', mode: mode || 'signin', note: note || '', busy: false, error: '', info: '', email: '', name: '', opener: document.activeElement };
    renderAuth(); focusFirst();
  }
  function renderAuth() {
    const a = state.modal; if (!a || a.type !== 'auth') return;
    const title = { signin: 'Giriş yap', signup: 'Hesap oluştur', reset: 'Şifremi unuttum' }[a.mode];
    const submit = { signin: 'Giriş yap', signup: 'Hesap oluştur', reset: 'Sıfırlama bağlantısı gönder' }[a.mode];
    showModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="modal-close" aria-label="Kapat">${ICON_CLOSE}</button></div>
      <form class="modal-body" id="auth-form" novalidate>
        ${a.note ? `<p class="fine">${esc(a.note)}</p>` : ''}
        ${a.mode === 'signup' ? `<label class="field" for="auth-name"><span>Ad soyad</span><input id="auth-name" autocomplete="name" value="${esc(a.name)}" required></label>` : ''}
        <label class="field" for="auth-email"><span>E-posta</span><input id="auth-email" type="email" autocomplete="email" value="${esc(a.email)}" required></label>
        ${a.mode !== 'reset' ? `<label class="field" for="auth-pass"><span>Şifre</span><input id="auth-pass" type="password" autocomplete="${a.mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required>${a.mode === 'signup' ? '<small>En az 6 karakter.</small>' : ''}</label>` : ''}
        ${a.error ? `<p class="form-error" role="alert">${esc(a.error)}</p>` : ''}
        ${a.info ? `<p class="form-info" role="status">${esc(a.info)}</p>` : ''}
        <button class="btn btn-primary btn-block" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Bekleyin…' : submit}</button>
        <p class="auth-switch">${a.mode === 'signin'
          ? `<button type="button" class="text-link as-btn" data-action="auth-mode" data-mode="reset">Şifremi unuttum</button><span>Hesabınız yok mu? <button type="button" class="text-link as-btn" data-action="auth-mode" data-mode="signup">Hesap oluşturun</button></span>`
          : `<span>${a.mode === 'signup' ? 'Zaten hesabınız var mı?' : 'Şifrenizi hatırladınız mı?'} <button type="button" class="text-link as-btn" data-action="auth-mode" data-mode="signin">Giriş yapın</button></span>`}</p>
      </form></div>`);
  }
  function submitAuth() {
    const a = state.modal; if (!a || a.busy) return;
    a.email = $('#auth-email').value.trim();
    a.name = $('#auth-name') ? $('#auth-name').value.trim() : '';
    const pw = $('#auth-pass') ? $('#auth-pass').value : '';
    a.info = ''; a.error = '';
    if (!/^\S+@\S+\.\S+$/.test(a.email)) a.error = 'Geçerli bir e-posta adresi girin.';
    else if (a.mode !== 'reset' && pw.length < 6) a.error = 'Şifre en az 6 karakter olmalı.';
    else if (a.mode === 'signup' && !a.name) a.error = 'Adınızı ve soyadınızı girin.';
    if (a.error) { renderAuth(); focusFirst(); return; }
    a.busy = true; renderAuth();
    const B = window.Backend;
    const job = a.mode === 'signup' ? B.signUp(a.email, pw, a.name) : a.mode === 'signin' ? B.signIn(a.email, pw) : B.resetPassword(a.email);
    job.then(() => {
      if (state.modal !== a) return;
      if (a.mode === 'reset') {
        a.busy = false; a.mode = 'signin';
        a.info = 'Bu adresle kayıtlı bir hesap varsa şifre sıfırlama bağlantısı e-postanıza gönderildi.';
        renderAuth(); return;
      }
      closeModal();
      toast(a.mode === 'signup' ? 'Hesabınız oluşturuldu.' : 'Giriş yapıldı.');
    }).catch(err => {
      if (state.modal !== a) return;
      a.busy = false; a.error = err.message; renderAuth(); focusFirst();
    });
  }

  const OWN_OPTIONS = [[1, 'Kendi işlerim'], [0.5, 'Kendi işlerim ve platform'], [0, 'Platform bulsun']];
  function openRequest(fid, slot) {
    if (!SF.ME.signedIn) {
      state.after = { fid, slot };
      openAuth('signup', 'Yatırım talebi oluşturmak için hesap açın veya giriş yapın.');
      return;
    }
    const axes = SF.TYPES[4] ? 4 : +Object.keys(SF.TYPES)[0];
    state.modal = { type: 'request', fid, slot: slot || '', axes, ownShare: 0.5, phone: '', note: '', busy: false, error: '', done: false, opener: document.activeElement };
    renderRequest(); focusFirst();
  }
  function renderRequest() {
    const r = state.modal; if (!r || r.type !== 'request') return;
    const f = SF.facility(r.fid);
    const empty = f.slots.filter(s => !SF.machineAt(f.id, s));
    if (r.done) {
      showModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head"><h2 id="modal-title">Talebiniz alındı</h2><button class="icon-btn" data-action="modal-close" aria-label="Kapat">${ICON_CLOSE}</button></div>
        <div class="modal-body">
          <p>Ekibimiz sözleşme ve ön ödeme adımları için ${esc(SF.ME.email)} adresinden sizinle iletişime geçecek. Talebinizin durumunu Makinelerim sayfasından izleyebilirsiniz.</p>
          <div class="row-actions"><button class="btn btn-primary" data-action="goto-mine">Makinelerime git</button><button class="btn btn-plain" data-action="modal-close">Kapat</button></div>
        </div></div>`);
      return;
    }
    const types = [3, 4, 5].filter(a => SF.TYPES[a]).map(a => {
      const T = SF.TYPES[a];
      return `<label class="type-row"><input type="radio" name="axes" value="${a}" ${r.axes === a ? 'checked' : ''}>
        <span class="tr-main"><b>${a} eksen</b><span>${esc(T.family)}</span></span>
        <span class="tr-price"><b>${usd(T.price + T.installFee)}</b><span>${usd2(T.rate)}/dk</span></span></label>`;
    }).join('');
    showModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><h2 id="modal-title">Yatırım talebi</h2><p class="fine">${esc(f.name)}</p></div><button class="icon-btn" data-action="modal-close" aria-label="Kapat">${ICON_CLOSE}</button></div>
      <form class="modal-body" id="req-form" novalidate>
        <fieldset class="types"><legend>Makine tipi</legend>${types}
          <p class="fine">Tutarlar nakliye ve kurulum dahil toplam yatırımdır.</p></fieldset>
        <div class="two-fields">
          <label class="field" for="req-slot"><span>Slot</span><select id="req-slot"><option value="">Fark etmez</option>${empty.map(s => `<option value="${esc(s)}" ${r.slot === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label class="field" for="req-own"><span>İşleri kim getirecek?</span><select id="req-own">${OWN_OPTIONS.map(o => `<option value="${o[0]}" ${r.ownShare === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
        </div>
        <label class="field" for="req-phone"><span>Telefon <em>isteğe bağlı</em></span><input id="req-phone" type="tel" autocomplete="tel" maxlength="30" value="${esc(r.phone)}"></label>
        <label class="field" for="req-note"><span>Notunuz <em>isteğe bağlı</em></span><textarea id="req-note" rows="3" maxlength="1000">${esc(r.note)}</textarea></label>
        <p class="fine">Talep bir ön başvurudur ve ödeme alınmaz. Onaydan sonra sözleşme imzalanır ve ${pct(SF.DEPOSIT_RATE)} ön ödeme yapılır. Tezgâh yaklaşık ${SF.PROC_TOTAL_DAYS} günde üretime başlar.</p>
        ${r.error ? `<p class="form-error" role="alert">${esc(r.error)}</p>` : ''}
        <div class="row-actions end"><button type="button" class="btn btn-plain" data-action="modal-close">Vazgeç</button>
          <button class="btn btn-primary" type="submit" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Gönderiliyor…' : 'Talebi gönder'}</button></div>
      </form></div>`);
  }
  function readRequestForm(r) {
    const ax = $('#req-form input[name="axes"]:checked');
    if (ax) r.axes = +ax.value;
    r.slot = $('#req-slot').value; r.ownShare = +$('#req-own').value;
    r.phone = $('#req-phone').value.trim(); r.note = $('#req-note').value.trim();
  }
  function submitRequest() {
    const r = state.modal; if (!r || r.busy) return;
    readRequestForm(r);
    r.busy = true; r.error = ''; renderRequest();
    window.Backend.createRequest({ facilityId: r.fid, slot: r.slot, axes: r.axes, ownShare: r.ownShare, phone: r.phone, note: r.note }).then(() => {
      if (state.modal !== r) return;
      r.busy = false; r.done = true; renderRequest(); render();
    }).catch(err => {
      if (state.modal !== r) return;
      r.busy = false; r.error = err.message; renderRequest();
    });
  }

  /* =========================================================
     OLAYLAR
     ========================================================= */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  document.addEventListener('click', e => {
    const menu = $('#account-menu');
    if (menu && !menu.hidden && !e.target.closest('.account')) hideAccountMenu();
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (el.tagName === 'A') e.preventDefault();
    switch (a) {
      case 'view': setView(el.dataset.view); break;
      case 'retry': if (window.Backend) boot(); else location.reload(); break;
      case 'facility': state.facility = el.dataset.id; renderFacilityBody(); break;
      case 'machine': state.machineId = el.dataset.id; state.week = 0; state.selJob = null; setView('makine'); break;
      case 'week': { const d = +el.dataset.delta; state.week = d === 0 ? 0 : state.week + d; state.selJob = null; rerenderCalendar(); break; }
      case 'job': state.selJob = el.dataset.job && state.selJob !== el.dataset.job ? el.dataset.job : null; rerenderCalendar(); break;
      case 'request': openRequest(el.dataset.facility, el.dataset.slot); break;
      case 'cancel-request':
        el.disabled = true;
        window.Backend.cancelRequest(el.dataset.id).then(() => { render(); toast('Talebiniz geri çekildi.'); }).catch(err => { el.disabled = false; toast(err.message); });
        break;
      case 'auth': openAuth(el.dataset.mode); break;
      case 'auth-mode': state.modal.mode = el.dataset.mode; state.modal.error = ''; state.modal.info = ''; renderAuth(); focusFirst(); break;
      case 'modal-close': state.after = null; closeModal(); break;
      case 'goto-mine': closeModal(); setView('makinelerim'); break;
      case 'account': { const m = $('#account-menu'); m.hidden = !m.hidden; el.setAttribute('aria-expanded', String(!m.hidden)); break; }
      case 'sign-out':
        hideAccountMenu();
        window.Backend.signOut().then(() => toast('Çıkış yapıldı.')).catch(err => toast(err.message));
        break;
    }
  });
  function rerenderCalendar() {
    const el = $('#calendar'); const m = SF.machine(state.machineId);
    if (el && m) el.innerHTML = calendarHTML(m);
  }
  document.addEventListener('submit', e => {
    if (e.target.id === 'auth-form') { e.preventDefault(); submitAuth(); }
    else if (e.target.id === 'req-form') { e.preventDefault(); submitRequest(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'an-month') { state.month = +t.value; render(); }
    else if (t.id === 'an-machine') { state.anMachine = t.value; render(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const menu = $('#account-menu');
    if (menu && !menu.hidden) hideAccountMenu();
    else if (state.modal) { state.after = null; closeModal(); }
  });
  $('#modal-root').addEventListener('mousedown', e => { if (e.target.id === 'modal-root') { state.after = null; closeModal(); } });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawCharts, 150); });

  /* ---------- açılış ---------- */
  const hashNow = () => (location.hash || '').slice(1);
  const intent = { kayit: 'signup', giris: 'signin' }[hashNow()] || null;
  if (VIEWS.includes(hashNow())) state.view = hashNow();
  window.addEventListener('hashchange', () => { const h = hashNow(); if (VIEWS.includes(h) && h !== navView()) setView(h); });

  function afterAuthChange() {
    if (state.modal && state.modal.type === 'auth' && SF.ME.signedIn) closeModal();
    render();
    if (SF.ME.signedIn && state.after) { const x = state.after; state.after = null; openRequest(x.fid, x.slot); }
  }
  let started = false;
  function boot() {
    const B = window.Backend;
    state.booting = true; state.error = ''; render();
    B.onChange = afterAuthChange;
    (started ? B.load() : B.init()).then(() => {
      started = true; state.booting = false; render();
      if (intent && !boot.intentDone) {
        boot.intentDone = true;
        try { history.replaceState(null, '', '#tesisler'); } catch (e) { /* önizleme */ }
        if (!SF.ME.signedIn) openAuth(intent);
      }
    }).catch(err => { state.booting = false; state.error = err.message; render(); });
  }
  // Veriyi düzenli yenile: tezgâh durumları ve yeni işler
  setInterval(() => {
    if (!started || state.modal || state.error || document.hidden) return;
    window.Backend.load().then(() => {
      if (state.view === 'tesisler') renderFacilityBody();
      else if (state.view !== 'analiz' && state.view !== 'yonetim') render();
    }).catch(() => { /* bir sonraki denemede */ });
  }, 5 * 60 * 1000);

  // Yönetim ekranı (assets/admin.js) bu yardımcıları kullanır
  window.EmekPlatform = { state, render, toast, showModal, closeModal, esc, usd, pct, num, fDay, fDayY, fTime, whenShort, dur, statusTag, ICON_CLOSE };

  render();
  if (window.Backend) boot(); else window.addEventListener('backend-ready', boot, { once: true });
  // Bağlantı modülü hiç yüklenemezse (ör. çevrimdışı) kullanıcıyı bekletme
  setTimeout(() => {
    if (!window.Backend && state.booting) { state.booting = false; state.error = 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.'; render(); }
  }, 12000);
})();
