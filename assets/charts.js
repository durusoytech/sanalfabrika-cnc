/* Emek Sermaye · küçük SVG grafik kütüphanesi (yığılmış sütun, trend sütunu, ipucu) */
(function () {
  'use strict';

  /* ---------- ipucu ---------- */
  const Tip = {
    el() { return document.getElementById('tooltip'); },
    show(x, y, title, rows, total) {
      const el = this.el();
      el.textContent = '';
      if (title) {
        const t = document.createElement('div'); t.className = 'tt-title'; t.textContent = title; el.appendChild(t);
      }
      const addRow = (r, cls) => {
        const row = document.createElement('div'); row.className = 'tt-row' + (cls ? ' ' + cls : '');
        const i = document.createElement('i'); if (r.color) i.style.background = r.color;
        const s = document.createElement('span'); s.textContent = r.label;
        const b = document.createElement('b'); b.textContent = r.value;
        row.append(i, s, b); el.appendChild(row);
      };
      (rows || []).forEach(r => addRow(r));
      if (total) addRow(total, 'tt-total');
      el.hidden = false;
      this.pos(x, y);
    },
    pos(x, y) {
      const el = this.el(); const pad = 14;
      const r = el.getBoundingClientRect();
      let left = x + pad, top = y + pad;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
      el.style.left = Math.max(8, left) + 'px'; el.style.top = Math.max(8, top) + 'px';
    },
    hide() { const el = this.el(); if (el) el.hidden = true; }
  };

  /* ---------- ölçek yardımcıları ---------- */
  function niceStep(raw) {
    if (raw <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function scaleY(maxVal, count) {
    const step = niceStep((maxVal || 1) / (count || 4));
    const max = Math.max(step, Math.ceil((maxVal || 1) / step) * step);
    const ticks = []; for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
    return { max, ticks };
  }
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // üstü yuvarlatılmış çubuk yolu (taban kare)
  function barPath(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /* ---------- yığılmış sütun grafiği ----------
     opts: { cats:[{label, title, planned}], series:[{key,label,color}], values:[[..]], height, fmtAxis, fmtVal, totalLabel } */
  function stackedColumns(container, opts) {
    container.textContent = '';
    const W = Math.max(280, container.clientWidth || 600);
    const H = opts.height || 240;
    const m = { l: 60, r: 8, t: 12, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = opts.cats.length;
    const totals = opts.values.map(v => v.reduce((a, b) => a + b, 0));
    const sc = scaleY(Math.max(...totals, 1), 4);
    const y = v => m.t + ph - (v / sc.max) * ph;
    const band = pw / n;
    const bw = Math.max(3, Math.min(24, band * 0.68));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opts.ariaLabel || '' }, container);

    sc.ticks.forEach(t => {
      svgEl('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, svg);
      const tx = svgEl('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg);
      tx.textContent = opts.fmtAxis ? opts.fmtAxis(t) : t;
    });
    const every = Math.max(1, Math.ceil(26 / band));
    const hl = svgEl('rect', { class: 'hl', x: 0, y: m.t, width: band, height: ph, visibility: 'hidden' }, svg);

    opts.cats.forEach((c, i) => {
      const cx = m.l + band * i + band / 2;
      let acc = 0;
      const vals = opts.values[i];
      const lastIdx = vals.reduce((li, v, k) => (v > 0 ? k : li), -1);
      vals.forEach((v, k) => {
        if (v <= 0) return;
        const y0 = y(acc), y1 = y(acc + v);
        const gap = acc > 0 ? 2 : 0;
        const h = Math.max(0, y0 - y1 - gap);
        acc += v;
        if (h <= 0) return;
        const p = k === lastIdx ? barPath(cx - bw / 2, y1, bw, h, 4) : `M${cx - bw / 2},${y1}h${bw}v${h}h${-bw}Z`;
        svgEl('path', { d: p, style: `fill:${opts.series[k].color};opacity:${c.planned ? 0.38 : 1}` }, svg);
      });
      if (i % every === 0 || i === n - 1) {
        if (i === n - 1 && i % every !== 0 && (i % every) < every * 0.6) { /* son etiket öncekine çok yakınsa atla */ }
        else {
          const tx = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: c.strong ? 'lbl-strong' : '' }, svg);
          tx.textContent = c.label;
        }
      }
      const hit = svgEl('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ph, tabindex: 0, 'aria-label': `${c.title}: ${opts.fmtVal(totals[i])}` }, svg);
      const show = (ev) => {
        hl.setAttribute('x', m.l + band * i); hl.setAttribute('visibility', 'visible');
        const rows = opts.series.map((s, k) => ({ label: s.label, value: opts.fmtVal(vals[k]), color: s.color }));
        const r = hit.getBoundingClientRect();
        const px = ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2;
        const py = ev && ev.clientY != null ? ev.clientY : r.top + 20;
        Tip.show(px, py, c.title + (c.planned ? ' · planlanan' : ''), rows, { label: opts.totalLabel || 'Toplam', value: opts.fmtVal(totals[i]) });
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', () => show(null));
      const hide = () => { hl.setAttribute('visibility', 'hidden'); Tip.hide(); };
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
    });
    return svg;
  }

  /* ---------- tek seri sütun (gerçekleşen + planlanan) ----------
     opts: { items:[{label, title, actual, planned}], color, height, fmtAxis, fmtVal } */
  function trendColumns(container, opts) {
    container.textContent = '';
    const W = Math.max(280, container.clientWidth || 600);
    const H = opts.height || 220;
    const m = { l: 60, r: 8, t: 22, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const items = opts.items; const n = items.length;
    const totals = items.map(it => it.actual + (it.planned || 0));
    const sc = scaleY(Math.max(...totals, 1), 4);
    const y = v => m.t + ph - (v / sc.max) * ph;
    const band = pw / n;
    const bw = Math.max(6, Math.min(28, band * 0.56));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opts.ariaLabel || '' }, container);
    sc.ticks.forEach(t => {
      svgEl('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, svg);
      const tx = svgEl('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg);
      tx.textContent = opts.fmtAxis(t);
    });
    const hl = svgEl('rect', { class: 'hl', x: 0, y: m.t, width: band, height: ph, visibility: 'hidden' }, svg);
    let maxI = 0; totals.forEach((v, i) => { if (items[i].actual > items[maxI].actual) maxI = i; });
    items.forEach((it, i) => {
      const cx = m.l + band * i + band / 2;
      const hA = ph * (it.actual / sc.max);
      const hasPlan = it.planned > 0;
      if (hA > 0) {
        const p = hasPlan ? `M${cx - bw / 2},${y(it.actual)}h${bw}v${hA}h${-bw}Z` : barPath(cx - bw / 2, y(it.actual), bw, hA, 4);
        svgEl('path', { d: p, style: `fill:${opts.color}` }, svg);
      }
      if (hasPlan) {
        const top = y(it.actual + it.planned), hP = Math.max(0, y(it.actual) - top - 2);
        if (hP > 0) svgEl('path', { d: barPath(cx - bw / 2, top, bw, hP, 4), style: `fill:${opts.color};opacity:.36` }, svg);
      }
      const tx = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: i === n - 1 ? 'lbl-strong' : '' }, svg);
      tx.textContent = it.label;
      if (i === n - 1 || i === maxI) {
        const lv = svgEl('text', { x: cx, y: y(totals[i]) - 7, 'text-anchor': 'middle', class: 'lbl-strong' }, svg);
        lv.textContent = opts.fmtAxis(i === n - 1 ? totals[i] : it.actual);
      }
      const hit = svgEl('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ph, tabindex: 0, 'aria-label': `${it.title}: ${opts.fmtVal(it.actual)}` }, svg);
      const show = (ev) => {
        hl.setAttribute('x', m.l + band * i); hl.setAttribute('visibility', 'visible');
        const rows = [{ label: 'Gerçekleşen', value: opts.fmtVal(it.actual), color: opts.color }];
        if (hasPlan) rows.push({ label: 'Takvimde planlı', value: opts.fmtVal(it.planned), color: opts.color });
        const r = hit.getBoundingClientRect();
        Tip.show(ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2, ev && ev.clientY != null ? ev.clientY : r.top + 20, it.title, rows,
          hasPlan ? { label: 'Ay sonu tahmini', value: opts.fmtVal(totals[i]) } : null);
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', () => show(null));
      const hide = () => { hl.setAttribute('visibility', 'hidden'); Tip.hide(); };
      hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
    });
    return svg;
  }

  window.Charts = { Tip, stackedColumns, trendColumns, scaleY, niceStep };
})();
