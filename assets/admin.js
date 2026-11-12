/* Emek Sermaye · yönetim ekranı (yalnızca personel)
   Talepler, tezgâh durumları, işler ve haberler buradan yönetilir.
   Yetkiyi bu dosya değil Firestore kuralları verir: staff/{uid} belgesi olmayan bir kullanıcı
   bu ekranı görse bile hiçbir yazma işlemi veritabanından geçmez. */
(function () {
  'use strict';
  const SF = window.SF, P = window.EmekPlatform;
  if (!SF || !P) return;
  const { esc, usd, fDayY, fTime, whenShort, dur, statusTag } = P;
  const $ = (s, r = document) => r.querySelector(s);
  const { MIN, HOUR, DAY } = SF;
  const B = () => window.Backend;

  const LIVE = [['running', 'Çalışıyor'], ['setup', 'Ayar yapılıyor'], ['idle', 'Boşta'], ['maintenance', 'Bakımda']];
  const OWN = [[1, 'Kendi işleri'], [0.5, 'Kendi işleri ve platform'], [0, 'Platform bulsun']];
  const ui = { jobError: '', newsError: '', modal: null };

  const investorName = uid => { const i = B().investors[uid]; return i ? i.displayName : ''; };
  const ownerOf = m => (m.ownerUid ? (investorName(m.ownerUid) || 'Yatırımcı') : (m.ownerLabel || 'Emek Sermaye'));
  const emptySlots = f => f.slots.filter(s => !SF.machineAt(f.id, s));
  const localInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * MIN); return d.toISOString().slice(0, 16); };

  /* ---------- talepler ---------- */
  function requestsHTML() {
    const rs = SF.REQUESTS;
    const rows = rs.map(r => {
      const f = SF.facility(r.facilityId);
      const own = OWN.find(o => o[0] === r.ownShare);
      let actions = '';
      if (r.status === 'new' || r.status === 'contacted') {
        actions = `${r.status === 'new' ? `<button class="btn btn-plain btn-sm" data-adm="req-status" data-id="${esc(r.id)}" data-status="contacted">Görüşülüyor</button>` : ''}
          <button class="btn btn-primary btn-sm" data-adm="req-machine" data-id="${esc(r.id)}">Tezgâhı tanımla</button>
          <button class="btn btn-plain btn-sm" data-adm="req-status" data-id="${esc(r.id)}" data-status="rejected">Kapat</button>`;
      } else if (r.status === 'rejected') {
        actions = `<button class="btn btn-plain btn-sm" data-adm="req-status" data-id="${esc(r.id)}" data-status="new">Yeniden aç</button>`;
      } else if (r.machineId) {
        actions = `<span>${esc(r.machineId)}</span>`;
      }
      return `<tr>
        <th scope="row">${esc(r.displayName || 'Yatırımcı')}<small>${esc(r.email || '')}${r.phone ? ' · ' + esc(r.phone) : ''}</small></th>
        <td>${r.axes} eksen<small>${esc(f ? f.name : r.facilityId)}${r.slot ? ', slot ' + esc(r.slot) : ''}${own ? ' · ' + own[1] : ''}</small></td>
        <td>${r.createdAt ? fDayY.format(r.createdAt) : ''}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td>
        <td>${esc(SF.REQUEST_STATUS[r.status] || r.status)}</td>
        <td class="act"><span class="adm-actions">${actions}</span></td></tr>`;
    }).join('');
    return `<section class="block"><h2>Yatırım talepleri <span class="count">${rs.length}</span></h2>
      ${rs.length ? `<div class="tbl-wrap"><table class="tbl tbl-sm tbl-text">
        <thead><tr><th scope="col">Yatırımcı</th><th scope="col">Talep</th><th scope="col">Tarih ve not</th><th scope="col">Durum</th><th scope="col"></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="fine">Henüz talep yok.</p>'}</section>`;
  }

  /* ---------- tezgâhlar ---------- */
  function machinesHTML() {
    const now = Date.now();
    const rows = SF.MACHINES.map(m => {
      const f = SF.facility(m.facility);
      let status, action = '';
      if (m.proc) {
        const p = SF.procInfo(m, now);
        status = `${statusTag('proc')}<small>${esc(p.cur.label)} · hazır ${fDayY.format(p.readyAt)}</small>`;
        action = `<button class="btn btn-primary btn-sm" data-adm="commission" data-id="${esc(m.id)}">Üretime al</button>`;
      } else {
        status = `<label class="sr-only" for="live-${esc(m.id)}">${esc(m.id)} durumu</label>
          <span class="field-inline"><select id="live-${esc(m.id)}" data-adm-change="live" data-id="${esc(m.id)}">
            ${LIVE.map(o => `<option value="${o[0]}" ${m.liveStatus === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></span>`;
      }
      return `<tr><th scope="row">${esc(m.id)}<small>${m.axes} eksen${m.model ? ' · ' + esc(m.model) : ''}</small></th>
        <td>${esc(f ? f.name : m.facility)}<small>slot ${esc(m.slot)}</small></td>
        <td>${esc(ownerOf(m))}</td><td>${status}</td><td class="act">${action}</td></tr>`;
    }).join('');
    return `<section class="block"><h2>Tezgâhlar <span class="count">${SF.MACHINES.length}</span></h2>
      <div class="tbl-wrap"><table class="tbl tbl-sm tbl-text">
        <thead><tr><th scope="col">Tezgâh</th><th scope="col">Tesis</th><th scope="col">Sahibi</th><th scope="col">Durum</th><th scope="col"></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="fine" style="margin-top:12px">Durum, Tesisler sayfasında herkese görünür. Tezgâh durduğunda ya da bakıma girdiğinde buradan güncelleyin.</p></section>`;
  }

  /* ---------- işler ---------- */
  function jobsHTML() {
    const now = Date.now();
    const active = SF.MACHINES.filter(m => !m.proc);
    const list = [];
    active.forEach(m => m.jobs.forEach(j => { if (j.end > now - 12 * HOUR) list.push({ m, j }); }));
    list.sort((a, b) => a.j.start - b.j.start);
    const rows = list.slice(0, 40).map(({ m, j }) => `<tr>
      <th scope="row">${esc(j.kind === 'maint' ? j.title : j.part)}<small>${j.kind === 'maint' ? 'Planlı bakım' : esc([j.customer, j.mat].filter(Boolean).join(' · '))}</small></th>
      <td>${esc(m.id)}</td>
      <td>${whenShort(j.start)} – ${whenShort(j.end)}<small>${dur(j.durMin)}${j.kind === 'job' ? ` · ${j.qty} adet` : ''}</small></td>
      <td>${j.kind === 'job' ? SF.SOURCE_LABEL[j.source] : '—'}</td>
      <td class="act"><button class="btn btn-plain btn-sm" data-adm="job-delete" data-id="${esc(j.id)}">Sil</button></td></tr>`).join('');
    const start = localInput(Math.ceil((now + 10 * MIN) / (30 * MIN)) * 30 * MIN);
    return `<section class="block"><h2>İşler</h2>
      ${active.length ? `<form class="adm-form" id="adm-job-form" novalidate>
        <label class="field" for="job-machine"><span>Tezgâh</span><select id="job-machine">${active.map(m => `<option value="${esc(m.id)}">${esc(m.id)} · ${m.axes} eksen</option>`).join('')}</select></label>
        <label class="field" for="job-kind"><span>Tür</span><select id="job-kind"><option value="job">Üretim işi</option><option value="maint">Planlı bakım</option></select></label>
        <label class="field" for="job-title"><span>Parça ya da bakım adı</span><input id="job-title" maxlength="80" required></label>
        <label class="field" for="job-start"><span>Başlangıç</span><input id="job-start" type="datetime-local" value="${start}" required></label>
        <label class="field only-job" for="job-qty"><span>Adet</span><input id="job-qty" type="number" min="1" step="1" inputmode="numeric"></label>
        <label class="field only-job" for="job-cycle"><span>Çevrim süresi (dk/parça)</span><input id="job-cycle" type="number" min="0.1" step="0.1" inputmode="decimal"></label>
        <label class="field only-job" for="job-setup"><span>Ayar süresi (dk)</span><input id="job-setup" type="number" min="0" step="5" value="30" inputmode="numeric"></label>
        <label class="field only-job" for="job-source"><span>İşi kim buldu?</span><select id="job-source"><option value="platform">Platform</option><option value="own">Tezgâh sahibi</option></select></label>
        <label class="field only-job" for="job-customer"><span>Müşteri</span><input id="job-customer" maxlength="80"></label>
        <label class="field only-job" for="job-material"><span>Malzeme</span><input id="job-material" maxlength="60"></label>
        <label class="field only-job" for="job-order"><span>Sipariş no</span><input id="job-order" maxlength="40"></label>
        <label class="field only-maint" for="job-hours" hidden><span>Süre (saat)</span><input id="job-hours" type="number" min="0.5" step="0.5" value="4" inputmode="decimal"></label>
        <div class="row-actions"><button class="btn btn-primary" type="submit">İşi ekle</button>
          ${ui.jobError ? `<p class="form-error" role="alert">${esc(ui.jobError)}</p>` : '<p class="fine">Bitiş saati adet, çevrim ve ayar süresinden hesaplanır.</p>'}</div>
      </form>` : '<p class="fine">Üretimde tezgâh olmadığı için iş eklenemez.</p>'}
      <h3 class="adm-sub">Süren ve planlı işler</h3>
      ${rows ? `<div class="tbl-wrap"><table class="tbl tbl-sm tbl-text">
        <thead><tr><th scope="col">İş</th><th scope="col">Tezgâh</th><th scope="col">Zaman</th><th scope="col">Kaynak</th><th scope="col"></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="fine">Planlı iş yok.</p>'}</section>`;
  }

  /* ---------- haberler ---------- */
  function newsHTML() {
    const rows = SF.NEWS.map(n => `<tr><th scope="row">${esc(n.title)}<small>${esc(n.summary || '')}</small></th>
      <td>${n.publishedAt ? fDayY.format(n.publishedAt) : ''}</td>
      <td class="act"><button class="btn btn-plain btn-sm" data-adm="news-delete" data-id="${esc(n.id)}">Sil</button></td></tr>`).join('');
    return `<section class="block"><h2>Haberler</h2>
      <form class="adm-form" id="adm-news-form" novalidate>
        <label class="field wide" for="news-title"><span>Başlık</span><input id="news-title" maxlength="120" required></label>
        <label class="field wide" for="news-body"><span>Metin</span><textarea id="news-body" rows="4" maxlength="3000" required></textarea><small>Paragrafları boş bir satırla ayırın. Haber ana sayfada yayınlanır.</small></label>
        <div class="row-actions"><button class="btn btn-primary" type="submit">Haberi yayınla</button>
          ${ui.newsError ? `<p class="form-error" role="alert">${esc(ui.newsError)}</p>` : ''}</div>
      </form>
      <h3 class="adm-sub">Yayındaki haberler</h3>
      ${rows ? `<div class="tbl-wrap"><table class="tbl tbl-sm tbl-text"><tbody>${rows}</tbody></table></div>` : '<p class="fine">Yayında haber yok.</p>'}</section>`;
  }

  function view() {
    return `<section class="page-head"><h1>Yönetim</h1>
        <p class="lead">Talepler, tezgâh durumları, işler ve haberler. Bu sayfa yalnızca personele görünür.</p></section>
      ${requestsHTML()}${machinesHTML()}${jobsHTML()}${newsHTML()}`;
  }

  /* ---------- işlemler ---------- */
  function run(promise, okMsg, el) {
    if (el) el.disabled = true;
    return promise.then(() => { P.render(); if (okMsg) P.toast(okMsg); })
      .catch(err => { if (el) el.disabled = false; P.toast(err.message); });
  }

  function openMachineModal(reqId) {
    const r = SF.REQUESTS.find(x => x.id === reqId); if (!r) return;
    const f = SF.facility(r.facilityId);
    const free = f ? emptySlots(f) : [];
    ui.modal = { reqId, error: '', busy: false };
    P.state.modal = { type: 'admin', opener: document.activeElement };
    renderMachineModal(r, f, free);
  }
  function renderMachineModal(r, f, free) {
    const m = ui.modal;
    const slot = free.includes(r.slot) ? r.slot : free[0];
    P.showModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><h2 id="modal-title">Tezgâhı tanımla</h2><p class="fine">${esc(r.displayName || r.email || '')} · ${esc(f ? f.name : '')}</p></div>
        <button class="icon-btn" data-action="modal-close" aria-label="Kapat">${P.ICON_CLOSE}</button></div>
      <form class="modal-body" id="adm-machine-form" novalidate>
        ${free.length ? `<div class="two-fields">
          <label class="field" for="mc-slot"><span>Slot</span><select id="mc-slot">${free.map(s => `<option value="${esc(s)}" ${s === slot ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label class="field" for="mc-axes"><span>Makine tipi</span><select id="mc-axes">${[3, 4, 5].filter(a => SF.TYPES[a]).map(a => `<option value="${a}" ${a === r.axes ? 'selected' : ''}>${a} eksen · ${usd(SF.TYPES[a].price + SF.TYPES[a].installFee)}</option>`).join('')}</select></label>
        </div>
        <label class="field" for="mc-own"><span>İş modeli</span><select id="mc-own">${OWN.map(o => `<option value="${o[0]}" ${o[0] === r.ownShare ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
        <p class="fine">Bu işlem slotu yatırımcıya ayırır ve tedarik sürecini bugünden başlatır. Sözleşme imzalanıp ön ödeme alındıktan sonra kullanın.</p>` : '<p>Bu tesiste boş slot kalmadı.</p>'}
        ${m.error ? `<p class="form-error" role="alert">${esc(m.error)}</p>` : ''}
        <div class="row-actions end"><button type="button" class="btn btn-plain" data-action="modal-close">Vazgeç</button>
          ${free.length ? `<button class="btn btn-primary" type="submit" ${m.busy ? 'disabled' : ''}>${m.busy ? 'Kaydediliyor…' : 'Tezgâhı tanımla'}</button>` : ''}</div>
      </form></div>`);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-adm]');
    if (!el || !SF.ME.staff) return;
    const id = el.dataset.id;
    switch (el.dataset.adm) {
      case 'req-status': run(B().admin.setRequestStatus(id, el.dataset.status), 'Talep güncellendi.', el); break;
      case 'req-machine': openMachineModal(id); break;
      case 'commission':
        if (window.confirm(`${id} üretime alınsın mı? Tezgâh bugünden itibaren iş alabilir.`)) run(B().admin.commission(id), `${id} üretime alındı.`, el);
        break;
      case 'job-delete':
        if (window.confirm('Bu iş kaydı silinsin mi?')) run(B().admin.deleteJob(id), 'İş silindi.', el);
        break;
      case 'news-delete':
        if (window.confirm('Bu haber yayından kaldırılsın mı?')) run(B().admin.deleteNews(id), 'Haber kaldırıldı.', el);
        break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.admChange === 'live') {
      run(B().admin.setLiveStatus(t.dataset.id, t.value), `${t.dataset.id} durumu güncellendi.`, t);
    } else if (t.id === 'job-kind') {
      const maint = t.value === 'maint';
      document.querySelectorAll('#adm-job-form .only-job').forEach(x => { x.hidden = maint; });
      document.querySelectorAll('#adm-job-form .only-maint').forEach(x => { x.hidden = !maint; });
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'adm-job-form') { e.preventDefault(); submitJob(e.target); }
    else if (e.target.id === 'adm-news-form') { e.preventDefault(); submitNews(e.target); }
    else if (e.target.id === 'adm-machine-form') { e.preventDefault(); submitMachine(); }
  });

  function submitJob(form) {
    const m = SF.machine($('#job-machine').value);
    const kind = $('#job-kind').value;
    const title = $('#job-title').value.trim();
    const start = new Date($('#job-start').value).getTime();
    let err = '', job;
    if (!m) err = 'Tezgâh seçin.';
    else if (!title) err = 'Parça ya da bakım adını girin.';
    else if (!isFinite(start)) err = 'Başlangıç zamanını girin.';
    else if (kind === 'maint') {
      const hours = +$('#job-hours').value;
      if (!(hours > 0)) err = 'Bakım süresini saat olarak girin.';
      else job = { machineId: m.id, ownerUid: m.ownerUid || null, kind: 'maint', title, startsAt: start, endsAt: start + hours * HOUR };
    } else {
      const qty = Math.round(+$('#job-qty').value), cycle = +$('#job-cycle').value, setup = Math.round(+$('#job-setup').value || 0);
      if (!(qty > 0)) err = 'Adedi girin.';
      else if (!(cycle > 0)) err = 'Çevrim süresini dakika olarak girin.';
      else if (setup < 0) err = 'Ayar süresi sıfırdan küçük olamaz.';
      else {
        job = {
          machineId: m.id, ownerUid: m.ownerUid || null, kind: 'job', title, cycleMin: cycle, qty, setupMin: setup,
          source: $('#job-source').value, startsAt: start, endsAt: start + (setup + qty * cycle) * MIN
        };
        const customer = $('#job-customer').value.trim(), material = $('#job-material').value.trim(), order = $('#job-order').value.trim();
        if (customer) job.customerName = customer;
        if (material) job.material = material;
        if (order) job.orderNo = order;
      }
    }
    if (!err && job.endsAt - job.startsAt > 30 * DAY) err = 'Bir iş 30 günden uzun olamaz. Adet ve çevrim süresini kontrol edin.';
    if (!err) {
      const clash = m.jobs.find(j => j.start < job.endsAt && j.end > job.startsAt);
      if (clash) err = `Bu saatlerde tezgâhta başka bir kayıt var: ${clash.kind === 'maint' ? clash.title : clash.part}, ${whenShort(clash.start)} – ${whenShort(clash.end)}.`;
    }
    if (err) { ui.jobError = err; P.toast(err); const p = form.querySelector('.row-actions p'); if (p) { p.className = 'form-error'; p.setAttribute('role', 'alert'); p.textContent = err; } return; }
    ui.jobError = '';
    const btn = form.querySelector('button[type="submit"]');
    run(B().admin.addJob(job), `İş eklendi. Bitiş ${whenShort(job.endsAt)}.`, btn);
  }

  function submitNews(form) {
    const title = $('#news-title').value.trim();
    const body = $('#news-body').value.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!title || !body.length) { P.toast('Başlık ve metin girin.'); return; }
    run(B().admin.addNews({ title, body }), 'Haber yayınlandı.', form.querySelector('button[type="submit"]'));
  }

  function submitMachine() {
    const m = ui.modal; if (!m || m.busy) return;
    const r = SF.REQUESTS.find(x => x.id === m.reqId); if (!r) return;
    const f = SF.facility(r.facilityId);
    const args = { requestId: r.id, uid: r.uid, facilityId: r.facilityId, slot: $('#mc-slot').value, axes: +$('#mc-axes').value, ownShare: +$('#mc-own').value };
    m.busy = true; m.error = '';
    renderMachineModal(r, f, emptySlots(f));
    B().admin.createMachine(args).then(id => {
      ui.modal = null; P.closeModal(); P.render(); P.toast(`${id} tanımlandı. Tedarik süreci başladı.`);
    }).catch(err => {
      m.busy = false; m.error = err.message; renderMachineModal(r, f, emptySlots(f));
    });
  }

  window.EmekAdmin = { view };
})();
