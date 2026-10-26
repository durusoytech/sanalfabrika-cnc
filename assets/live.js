/* Emek Sermaye · canlı izleme (kamera görüntüsü simülasyonu + telemetri)
   Görüntü temsilidir: takım yolu her çevrimde döngüye girer, parça sayısı ve
   çevrim ilerlemesi ise makinenin gerçek iş takviminden hesaplanır. */
(function () {
  'use strict';
  const SF = window.SF;
  const MATS = [
    { re: /^Al/, rpm: 12000, feed: 3200, base: [196, 203, 209], chip: [222, 226, 232], load: 0.8 },
    { re: /Ti6Al4V/, rpm: 2800, feed: 520, base: [160, 154, 144], chip: [214, 178, 112], load: 1.1 },
    { re: /Inconel/, rpm: 1600, feed: 260, base: [140, 146, 141], chip: [222, 150, 84], load: 1.25 },
    { re: /CoCr/, rpm: 2200, feed: 380, base: [178, 183, 188], chip: [210, 196, 150], load: 1.15 },
    { re: /GGG|döküm/, rpm: 2400, feed: 700, base: [112, 116, 121], chip: [70, 72, 76], load: 0.95 },
    { re: /.*/, rpm: 3600, feed: 950, base: [152, 158, 164], chip: [205, 165, 112], load: 1.0 }
  ];
  const matOf = mat => MATS.find(x => x.re.test(mat || '')) || MATS[MATS.length - 1];
  const STOCK_MM = { w: 160, h: 110 };
  const PARK = { x: 1.14, y: -0.16 };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function roundedRect(x0, y0, x1, y1, r, seg) {
    const pts = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + (Math.PI / 2) * (i / seg); pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 1.45 }); } };
    const ry = r * 1.45;
    pts.push({ x: x0 + r, y: y0 });
    pts.push({ x: x1 - r, y: y0 }); corner(x1 - r, y0 + ry, -Math.PI / 2);
    pts.push({ x: x1, y: y1 - ry }); corner(x1 - r, y1 - ry, 0);
    pts.push({ x: x0 + r, y: y1 }); corner(x0 + r, y1 - ry, Math.PI / 2);
    pts.push({ x: x0, y: y0 + ry }); corner(x0 + r, y0 + ry, Math.PI);
    return pts;
  }

  function buildProgram(job, axes) {
    const five = axes === 5;
    const tools = {
      face: { t: 'T01', name: 'Ø50 YUZEY FREZESI', d: 0.15 },
      rough: { t: 'T05', name: 'Ø12 KARBUR PARMAK FREZE', d: 0.062 },
      fin: { t: 'T08', name: five ? 'Ø6 KURESEL UCLU FREZE' : 'Ø8 FINIS FREZESI', d: 0.04 },
      drill: { t: 'T12', name: 'Ø8.5 MATKAP', d: 0.045 }
    };
    const ops = [];
    let dir = 1;
    const face = [];
    for (let v = 0.08; v <= 0.93; v += 0.14) { face.push({ x: dir > 0 ? -0.1 : 1.1, y: v }, { x: dir > 0 ? 1.1 : -0.1, y: v }); dir *= -1; }
    ops.push({ code: 'OP10', name: 'Yüzey frezeleme', tool: tools.face, kind: 'face', z: -0.5, speed: 0.55, pts: face });
    const px0 = 0.12, px1 = 0.56, py0 = 0.2, py1 = 0.8;
    const pocket = []; dir = 1;
    for (let v = py0; v <= py1 + 1e-6; v += 0.06) { pocket.push({ x: dir > 0 ? px0 : px1, y: v }, { x: dir > 0 ? px1 : px0, y: v }); dir *= -1; }
    ops.push({ code: 'OP20', name: 'Cep boşaltma', tool: tools.rough, kind: 'pocket', z: -8, speed: 0.34, pts: pocket });
    const c1 = roundedRect(px0 - 0.03, py0 - 0.045, px1 + 0.03, py1 + 0.045, 0.045, 6);
    const c2 = roundedRect(0.025, 0.035, 0.975, 0.965, 0.04, 6);
    const contour = c1.concat([c1[0]]).concat([Object.assign({ r: true }, c2[0])]).concat(c2.slice(1)).concat([c2[0]]);
    ops.push({ code: 'OP30', name: five ? '5 eksen kontur finiş' : 'Kontur finiş', tool: tools.fin, kind: 'contour', z: -8, speed: 0.38, pts: contour });
    const holes = [[0.72, 0.24], [0.87, 0.24], [0.72, 0.5], [0.87, 0.5], [0.72, 0.76], [0.87, 0.76]];
    ops.push({ code: 'OP40', name: 'Delik delme', tool: tools.drill, kind: 'drill', z: -12, speed: 0.4, pts: holes.map(h => ({ x: h[0], y: h[1], r: true, d: true })) });

    const m = matOf(job && job.mat);
    const moves = [];
    ops.forEach((op, oi) => {
      moves.push({ oi, tc: true, x: PARK.x, y: PARK.y, rapid: true });
      op.pts.forEach((p, i) => moves.push({ oi, x: p.x, y: p.y, rapid: i === 0 || !!p.r, drill: !!p.d }));
    });
    moves.push({ oi: ops.length - 1, x: PARK.x, y: PARK.y, rapid: true, end: true });

    const mm = (x, y) => [((x - 0.5) * STOCK_MM.w).toFixed(3), ((0.5 - y) * STOCK_MM.h).toFixed(3)];
    const kindF = { face: 1.15, pocket: 1, contour: 0.75, drill: 0.22 };
    const lines = ['%', `O${2400 + (job ? job.qty : 17)} (${(job ? job.part : 'PARCA').toLocaleUpperCase('tr-TR')})`, 'G21 G17 G40 G49 G80 G90', 'G54 (IS PARCASI SIFIRI)'];
    const header = lines.length;
    moves.forEach(mv => {
      const op = ops[mv.oi];
      const [X, Y] = mm(mv.x, mv.y);
      if (mv.end) lines.push('M09 M05 G28 G91 Z0 · M30');
      else if (mv.tc) lines.push(`${op.tool.t} M06 (${op.tool.name}) S${Math.round(m.rpm * (op.kind === 'drill' ? 0.5 : 1))} M03 M08`);
      else if (mv.drill) lines.push(`G81 X${X} Y${Y} Z${op.z.toFixed(1)} R2.0 F${Math.round(m.feed * kindF.drill)}`);
      else if (mv.rapid) lines.push(`G00 X${X} Y${Y} Z5.0`);
      else lines.push(`G01 X${X} Y${Y} Z${op.z.toFixed(1)} F${Math.round(m.feed * kindF[op.kind])}`);
    });
    return { ops, moves, lines, header, mat: m, kindF };
  }

  function mount(root, machine) {
    root.innerHTML = `
      <div class="live-grid">
        <div class="cam">
          <canvas class="cam-canvas"></canvas>
          <div class="cam-hud tl"><span class="rec"><i></i>CANLI</span><span>KAM-1 · İş mili kamerası</span></div>
          <div class="cam-hud tr" data-l="ts"></div>
          <div class="cam-hud bl"><b data-l="part"></b><span data-l="op"></span></div>
          <div class="cam-hud br"><b data-l="cnt"></b><span data-l="cyc"></span></div>
          <div class="cam-toast" data-l="toast" style="opacity:0">Çevrim tamamlandı</div>
          <div class="cam-overlay" data-l="overlay" hidden><div><b data-l="ovt"></b><span data-l="ovs"></span></div></div>
        </div>
        <div class="telemetry">
          <div class="tele-card">
            <h4>Eksen konumları (mm)</h4>
            <div class="axes-read" data-l="axes"></div>
          </div>
          <div class="tele-card">
            <h4>İş mili ve kesme</h4>
            <div class="read-grid">
              <div><span>İş mili devri</span><b data-l="s">0</b></div>
              <div><span>İlerleme</span><b data-l="f">0</b></div>
              <div><span>İş mili yükü</span><b data-l="load">%0</b><div class="load-bar"><span data-l="loadbar" style="width:0%"></span></div></div>
              <div><span>Anlık güç</span><b data-l="kw">0 kW</b></div>
              <div><span>Soğutma sıvısı</span><b data-l="cool">—</b></div>
              <div><span>Aktif takım</span><b data-l="tool">—</b></div>
            </div>
            <div><span class="muted" style="font-size:11.5px">İş mili yükü · son 30 sn</span><canvas class="spark" data-l="spark"></canvas></div>
          </div>
          <div class="tele-card">
            <h4>NC programı</h4>
            <div class="gcode" data-l="gcode"></div>
          </div>
        </div>
      </div>`;
    const q = s => root.querySelector(`[data-l="${s}"]`);
    const cam = root.querySelector('.cam');
    const cv = root.querySelector('.cam-canvas');
    const ctx = cv.getContext('2d');
    const spark = q('spark'), sctx = spark.getContext('2d');
    const axisNames = machine.axes === 5 ? ['X', 'Y', 'Z', 'A', 'C'] : machine.axes === 4 ? ['X', 'Y', 'Z', 'B'] : ['X', 'Y', 'Z'];
    q('axes').innerHTML = axisNames.map(a => `<div><span>${a}</span><b data-ax="${a}">0,000</b></div>`).join('');
    const axEls = {}; axisNames.forEach(a => { axEls[a] = root.querySelector(`[data-ax="${a}"]`); });

    let W = 0, H = 0, dpr = 1, geo = null, bg = null, trail = null, tctx = null;
    let job = null, status = null, prog = null;
    const an = { k: 0, x: PARK.x, y: PARK.y, wait: 0, waitKind: null, rot: 0, t: 0, z: 150 };
    const parts = [];
    const loadHist = [];
    let curLoad = 0, raf = 0, last = performance.now(), lastDone = -1;
    const nf3 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
    const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fTs = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const fWd = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });

    function resize() {
      const r = cam.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const aspect = STOCK_MM.h / STOCK_MM.w;
      let sw = Math.min(W * 0.56, (H * 0.74) / aspect);
      const sh = sw * aspect;
      geo = { sx: (W - sw) / 2, sy: (H - sh) / 2 + H * 0.03, sw, sh };
      bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
      drawBackground(bg.getContext('2d'));
      trail = document.createElement('canvas'); trail.width = cv.width; trail.height = cv.height;
      tctx = trail.getContext('2d');
      const sr = spark.getBoundingClientRect();
      spark.width = Math.round(sr.width * dpr); spark.height = Math.round(sr.height * dpr);
    }

    function drawBackground(g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1c2328'); grd.addColorStop(1, '#0d1215');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      const { sx, sy, sw, sh } = geo;
      const cx = sx + sw / 2, cy = sy + sh / 2;
      if (machine.axes === 5) {
        const R = Math.max(sw, sh) * 0.72;
        const rg = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
        rg.addColorStop(0, '#59636a'); rg.addColorStop(1, '#2f373c');
        g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2); g.lineTo(cx + Math.cos(a) * R * 0.96, cy + Math.sin(a) * R * 0.96); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.stroke();
      } else if (machine.axes === 4) {
        g.fillStyle = '#3a444a'; g.fillRect(sx - sw * 0.28, sy - sh * 0.32, sw * 1.56, sh * 1.64);
        g.fillStyle = 'rgba(0,0,0,.5)';
        for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) { g.beginPath(); g.arc(sx - sw * 0.2 + i * sw * 0.175, sy - sh * 0.22 + j * sh * 0.24, 3, 0, Math.PI * 2); g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2; g.strokeRect(sx - sw * 0.28, sy - sh * 0.32, sw * 1.56, sh * 1.64);
      } else {
        g.fillStyle = '#394349'; g.fillRect(0, sy - sh * 0.45, W, sh * 1.9);
        for (let i = 0; i < 6; i++) { const yy = sy - sh * 0.35 + i * sh * 0.36; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, yy, W, 6); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, yy + 6, W, 1); }
      }
      // mengene çeneleri
      const jaw = (x) => {
        const jg = g.createLinearGradient(x, 0, x + sw * 0.1, 0);
        jg.addColorStop(0, '#2a3237'); jg.addColorStop(0.5, '#4b565d'); jg.addColorStop(1, '#262d31');
        g.fillStyle = jg; g.fillRect(x, sy - sh * 0.08, sw * 0.1, sh * 1.16);
      };
      jaw(sx - sw * 0.1); jaw(sx + sw);
      // ham parça
      const mt = matOf(job && job.mat).base;
      const sg = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
      sg.addColorStop(0, `rgb(${mt.map(v => Math.min(255, v + 18)).join(',')})`);
      sg.addColorStop(1, `rgb(${mt.map(v => v - 22).join(',')})`);
      g.fillStyle = sg; g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
      for (let i = -sh; i < sw; i += 5) { g.beginPath(); g.moveTo(sx + i, sy + sh); g.lineTo(sx + i + sh, sy); g.stroke(); }
      g.save(); g.globalCompositeOperation = 'destination-over'; g.restore();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    }

    function setJob(j) {
      job = j;
      prog = buildProgram(job, machine.axes);
      an.k = 0; an.x = PARK.x; an.y = PARK.y; an.wait = 0; an.waitKind = null;
      if (bg) drawBackground(bg.getContext('2d'));
      if (tctx) tctx.clearRect(0, 0, trail.width, trail.height);
      q('gcode').innerHTML = '';
    }

    const toPx = (x, y) => [geo.sx + x * geo.sw, geo.sy + y * geo.sh];

    function stamp(op, x0, y0, x1, y1) {
      tctx.save();
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tctx.beginPath(); tctx.rect(geo.sx, geo.sy, geo.sw, geo.sh); tctx.clip();
      const [ax, ay] = toPx(x0, y0), [bx, by] = toPx(x1, y1);
      const wpx = op.tool.d * geo.sw;
      tctx.lineCap = 'round'; tctx.lineJoin = 'round';
      if (op.kind === 'face') { tctx.strokeStyle = 'rgba(255,255,255,.13)'; tctx.lineWidth = wpx; }
      else if (op.kind === 'pocket') { tctx.strokeStyle = 'rgba(8,12,15,.42)'; tctx.lineWidth = wpx; }
      else { tctx.strokeStyle = 'rgba(6,9,11,.62)'; tctx.lineWidth = Math.max(2, wpx * 0.7); }
      tctx.beginPath(); tctx.moveTo(ax, ay); tctx.lineTo(bx, by); tctx.stroke();
      if (op.kind === 'contour') { tctx.strokeStyle = 'rgba(255,255,255,.22)'; tctx.lineWidth = 1; tctx.beginPath(); tctx.moveTo(ax, ay + wpx * 0.45); tctx.lineTo(bx, by + wpx * 0.45); tctx.stroke(); }
      tctx.restore();
    }
    function stampHole(op, x, y) {
      tctx.save(); tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const [px, py] = toPx(x, y); const r = op.tool.d * geo.sw / 2;
      tctx.fillStyle = 'rgba(4,6,8,.92)'; tctx.beginPath(); tctx.arc(px, py, r, 0, Math.PI * 2); tctx.fill();
      tctx.strokeStyle = 'rgba(255,255,255,.28)'; tctx.lineWidth = 1; tctx.beginPath(); tctx.arc(px, py, r + 1.5, 0, Math.PI * 2); tctx.stroke();
      tctx.restore();
    }

    function spawn(kind, px, py, n) {
      if (reduceMotion) return;
      const mt = prog.mat;
      for (let i = 0; i < n && parts.length < 240; i++) {
        if (kind === 'chip') {
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 200;
          parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.5, age: 0, s: 1 + Math.random() * 1.8, c: mt.chip, a: 0.95 });
        } else {
          const tx = px + (Math.random() - 0.5) * 8, ty = py + (Math.random() - 0.5) * 8;
          const sx = px - 70, sy = py - 80;
          const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy);
          parts.push({ x: sx, y: sy, vx: dx / L * 420, vy: dy / L * 420, life: L / 420, age: 0, s: 1.3, c: [170, 215, 235], a: 0.45 });
        }
      }
    }

    function step(dt) {
      an.t += dt;
      const ops = prog.ops;
      const mv = prog.moves[an.k];
      const op = ops[mv.oi];
      an.rot += dt * (an.waitKind === 'tc' ? 2 : 40);
      if (an.wait > 0) {
        an.wait -= dt;
        if (an.waitKind === 'drill') {
          const p = 1 - Math.max(0, an.wait) / 0.7;
          an.z = p < 0.5 ? 2 - (p / 0.5) * (2 - op.z) : op.z + ((p - 0.5) / 0.5) * (2 - op.z);
          const [px, py] = toPx(an.x, an.y);
          if (p > 0.15 && p < 0.6) spawn('chip', px, py, 2);
        }
        if (an.wait <= 0) {
          if (an.waitKind === 'end') { tctx.clearRect(0, 0, trail.width, trail.height); an.k = 0; flashToast(); }
          else an.k = (an.k + 1) % prog.moves.length;
          an.waitKind = null;
        }
        return;
      }
      const dx = (mv.x - an.x), dy = (mv.y - an.y) * (geo.sh / geo.sw);
      const dist = Math.hypot(dx, dy);
      const speed = (mv.rapid ? 1.5 : op.speed) * (reduceMotion ? 0.5 : 1);
      const stepLen = speed * dt;
      const cutting = !mv.rapid;
      const x0 = an.x, y0 = an.y;
      if (dist <= stepLen || dist === 0) { an.x = mv.x; an.y = mv.y; }
      else { const f = stepLen / dist; an.x += (mv.x - an.x) * f; an.y += (mv.y - an.y) * f; }
      an.z = mv.tc || mv.end ? 150 : cutting ? op.z : 5;
      if (cutting) {
        stamp(op, x0, y0, an.x, an.y);
        const [px, py] = toPx(an.x, an.y);
        spawn('chip', px, py, op.kind === 'face' ? 3 : 2);
        spawn('cool', px, py, 1);
      }
      if (an.x === mv.x && an.y === mv.y) {
        if (mv.tc) { an.wait = 1.1; an.waitKind = 'tc'; }
        else if (mv.end) { an.wait = 1.4; an.waitKind = 'end'; }
        else if (mv.drill) { an.wait = 0.7; an.waitKind = 'drill'; stampHole(op, mv.x, mv.y); }
        else an.k = (an.k + 1) % prog.moves.length;
      }
    }

    function flashToast() {
      const el = q('toast'); el.style.opacity = 1; setTimeout(() => { el.style.opacity = 0; }, 1400);
    }

    function render(dt) {
      if (!geo) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.drawImage(trail, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // parçacıklar
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.985;
        ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.a * (1 - p.age / p.life)})`;
        ctx.fillRect(p.x, p.y, p.s, p.s);
      }
      // takım ve iş mili
      const [tx, ty] = toPx(an.x, an.y);
      const op = prog.ops[prog.moves[an.k].oi];
      const r = Math.max(4, op.tool.d * geo.sw / 2);
      const lift = Math.min(1, Math.max(0, (an.z - 0) / 150));
      const hx = tx + 10 + lift * 6, hy = ty - 8 - lift * 10;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(tx + 12, ty + 10, r * 1.7, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      const colW = geo.sw * 0.13;
      const cg = ctx.createLinearGradient(hx - colW / 2, 0, hx + colW / 2, 0);
      cg.addColorStop(0, '#2b3338'); cg.addColorStop(0.35, '#8e9aa1'); cg.addColorStop(0.6, '#c5ced2'); cg.addColorStop(1, '#3a4348');
      ctx.fillStyle = cg; ctx.fillRect(hx - colW / 2, -10, colW, hy - r * 2.2 + 10);
      const hg = ctx.createLinearGradient(hx - colW * 0.36, 0, hx + colW * 0.36, 0);
      hg.addColorStop(0, '#3a4348'); hg.addColorStop(0.5, '#b6c0c5'); hg.addColorStop(1, '#3a4348');
      ctx.fillStyle = hg; ctx.beginPath();
      ctx.moveTo(hx - colW * 0.36, hy - r * 2.2); ctx.lineTo(hx + colW * 0.36, hy - r * 2.2); ctx.lineTo(hx + r * 0.9, hy); ctx.lineTo(hx - r * 0.9, hy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6f7a80'; ctx.lineWidth = r * 1.1; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#c9d1d5'; ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(30,36,40,.85)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) { const a = an.rot + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r); ctx.stroke(); }
      // vinyet
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.025)';
      for (let yy = 0; yy < H; yy += 3) ctx.fillRect(0, yy, W, 1);
    }

    function frame(t) {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (prog && geo) {
        if (status === 'running') step(dt);
        else an.rot += dt * (status === 'setup' ? 3 : 0);
        render(dt);
      }
      raf = requestAnimationFrame(frame);
    }

    function updateTele() {
      if (!prog) return;
      const mv = prog.moves[an.k]; const op = prog.ops[mv.oi]; const mt = prog.mat;
      const running = status === 'running';
      const X = (an.x - 0.5) * STOCK_MM.w, Y = (0.5 - an.y) * STOCK_MM.h;
      const vals = { X, Y, Z: running ? an.z : 150 };
      if (machine.axes === 4) vals.B = running ? mv.oi * 90 : 0;
      if (machine.axes === 5) {
        const five = running && op.kind === 'contour';
        vals.A = five ? -18 + 9 * Math.sin(an.t * 0.9) : running ? -12 : 0;
        vals.C = five ? ((an.t * 24) % 360) : running ? mv.oi * 45 : 0;
      }
      Object.keys(axEls).forEach(a => { axEls[a].textContent = (vals[a] >= 0 ? '+' : '') + nf3.format(vals[a] || 0) + (a === 'A' || a === 'B' || a === 'C' ? '°' : ''); });
      const tc = an.waitKind === 'tc';
      const cutting = running && !tc && (!mv.rapid || an.waitKind === 'drill');
      const rpm = !running || tc ? 0 : Math.round(mt.rpm * (op.kind === 'drill' ? 0.5 : op.kind === 'face' ? 0.7 : 1) * (1 + (Math.random() - 0.5) * 0.004));
      const baseLoad = { face: 0.5, pocket: 0.68, contour: 0.38, drill: 0.55 }[op.kind] * mt.load;
      const target = cutting ? Math.min(0.97, baseLoad + (Math.random() - 0.5) * 0.08) : running && !tc ? 0.05 : 0;
      curLoad += (target - curLoad) * 0.35;
      q('s').textContent = nf0.format(rpm) + ' dev/dk';
      q('f').textContent = !running ? '0 mm/dk' : tc ? 'M06' : mv.rapid && an.waitKind !== 'drill' ? 'G00 · 36.000' : nf0.format(mt.feed * prog.kindF[op.kind]) + ' mm/dk';
      q('load').textContent = '%' + nf0.format(curLoad * 100);
      q('loadbar').style.width = (curLoad * 100).toFixed(0) + '%';
      q('kw').textContent = nf1.format(machine.type.powerKw * (status === 'running' ? 0.18 + curLoad * 0.82 : status === 'setup' ? 0.2 : 0.08)) + ' kW';
      q('cool').textContent = status === 'running' ? nf1.format(21.4 + curLoad * 3.6 + Math.sin(Date.now() / 60000)) + ' °C' : 'kapalı';
      q('tool').textContent = running ? `${op.tool.t} · ${op.tool.name.split(' ')[0]}` : '—';
      q('op').textContent = running ? `${op.code} · ${op.name}` : '';
      // G kodu penceresi
      const curLine = prog.header + an.k;
      const from = Math.max(0, Math.min(prog.lines.length - 9, curLine - 3));
      const gl = []; for (let i = from; i < Math.min(prog.lines.length, from + 9); i++) gl.push(`<div class="${i === curLine && running ? 'cur' : ''}"><span class="ln">N${(i + 1) * 10}</span>${prog.lines[i]}</div>`);
      q('gcode').innerHTML = gl.join('');
    }

    function sampleLoad() {
      loadHist.push(curLoad); if (loadHist.length > 60) loadHist.shift();
      const w = spark.width, h = spark.height; if (!w) return;
      sctx.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.documentElement);
      const run = cs.getPropertyValue('--s-run').trim() || '#0ca30c';
      const grid = cs.getPropertyValue('--line').trim() || '#ccc';
      sctx.strokeStyle = grid; sctx.lineWidth = 1 * dpr;
      sctx.beginPath(); sctx.moveTo(0, h - 0.5 * dpr); sctx.lineTo(w, h - 0.5 * dpr); sctx.stroke();
      if (loadHist.length < 2) return;
      const xs = i => (i / 59) * (w - 6 * dpr) + 1 * dpr, ys = v => h - 3 * dpr - v * (h - 8 * dpr);
      sctx.beginPath(); loadHist.forEach((v, i) => { const X = xs(i), Y = ys(v); i ? sctx.lineTo(X, Y) : sctx.moveTo(X, Y); });
      sctx.lineTo(xs(loadHist.length - 1), h); sctx.lineTo(xs(0), h); sctx.closePath();
      sctx.globalAlpha = 0.12; sctx.fillStyle = run; sctx.fill(); sctx.globalAlpha = 1;
      sctx.beginPath(); loadHist.forEach((v, i) => { const X = xs(i), Y = ys(v); i ? sctx.lineTo(X, Y) : sctx.moveTo(X, Y); });
      sctx.strokeStyle = run; sctx.lineWidth = 2 * dpr; sctx.lineJoin = 'round'; sctx.stroke();
      const lx = xs(loadHist.length - 1), ly = ys(loadHist[loadHist.length - 1]);
      sctx.fillStyle = run; sctx.beginPath(); sctx.arc(lx, ly, 3.5 * dpr, 0, Math.PI * 2); sctx.fill();
    }

    function sync() {
      const now = Date.now();
      q('ts').textContent = fTs.format(now);
      const st = SF.statusAt(machine, now);
      const j = SF.jobAt(machine, now);
      const realJob = j && j.kind === 'job' ? j : null;
      if (!prog || (realJob && (!job || job.id !== realJob.id)) || (!realJob && !job)) setJob(realJob || SF.nextJob(machine, now) || SF.prevJob(machine, now));
      status = st;
      const ov = q('overlay');
      if (st === 'running' && realJob) {
        ov.hidden = true;
        const done = SF.partsDone(realJob, now);
        const s0 = realJob.start + realJob.setup * SF.MIN;
        const cyc = ((now - s0) % (realJob.cycle * SF.MIN)) / (realJob.cycle * SF.MIN);
        const remainMs = (realJob.cycle * SF.MIN) * (1 - cyc);
        const mm = Math.floor(remainMs / 60000), ss = Math.floor((remainMs % 60000) / 1000);
        q('part').textContent = realJob.part + ' · ' + realJob.mat;
        q('cnt').textContent = `${done} / ${realJob.qty} parça`;
        q('cyc').textContent = `Bu parça %${nf0.format(cyc * 100)} · kalan ${mm}:${String(ss).padStart(2, '0')}`;
        if (lastDone >= 0 && done > lastDone) flashToast();
        lastDone = done;
      } else {
        ov.hidden = false;
        q('cnt').textContent = ''; q('cyc').textContent = '';
        if (st === 'setup' && realJob) {
          const left = (realJob.start + realJob.setup * SF.MIN - now) / SF.MIN;
          q('part').textContent = realJob.part + ' · ' + realJob.mat;
          q('ovt').textContent = 'Ayar yapılıyor';
          q('ovs').textContent = `Yeni iş için iş parçası sıfırı ve takım boyları ölçülüyor. Kesime başlama ${fT.format(realJob.start + realJob.setup * SF.MIN)} (yaklaşık ${Math.max(1, Math.round(left))} dk).`;
        } else if (st === 'maint') {
          q('part').textContent = 'Planlı bakım';
          q('ovt').textContent = j.title;
          q('ovs').textContent = `Makine bakımda. Tahmini bitiş ${fT.format(j.end)}.`;
        } else {
          const nx = SF.nextJob(machine, now);
          q('part').textContent = 'Makine boşta';
          q('ovt').textContent = 'Makine şu an boşta';
          q('ovs').textContent = nx ? `Sonraki iş: ${nx.part} (${nx.qty} adet). Başlangıç ${fWd.format(nx.start)} ${fT.format(nx.start)}.` : 'Takvimde planlanmış iş yok.';
        }
      }
    }

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(cam);
    sync(); resize();
    raf = requestAnimationFrame(frame);
    const iv1 = setInterval(sync, 1000), iv2 = setInterval(updateTele, 120), iv3 = setInterval(sampleLoad, 500);
    updateTele();
    return { destroy() { cancelAnimationFrame(raf); clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); ro.disconnect(); } };
  }

  window.Live = { mount };
})();
