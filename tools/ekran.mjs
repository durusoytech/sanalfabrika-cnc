// Başsız Chrome ile bir sayfayı açar, isteğe göre bir ifade çalıştırır ve ekran görüntüsü alır.
// Önce Chrome'u başlatın:  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=<geçici klasör> about:blank
// Kullanım: node tools/ekran.mjs '<json>'
// Alanlar: url, out (png), scheme (light|dark), w, h, scale, mobile, ready (hazır olunca true dönen ifade), wait (ms),
//          before / expr (sayfada çalışacak ifadeler), scroll (seçici), clip {x,y,w,h}, clipSel (seçici), pad, clipBottom (ifade), full (tüm sayfa)
import { writeFileSync } from 'node:fs';
const o = Object.assign({ port: 9333, scheme: 'light', w: 1280, h: 900, scale: 2, wait: 1200 }, JSON.parse(process.argv[2]));
const targets = await (await fetch(`http://127.0.0.1:${o.port}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const evalJs = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.result && !r.result.exceptionDetails ? r.result.result.value : 'HATA ' + JSON.stringify(r.result).slice(0, 500); };
await send('Emulation.setDeviceMetricsOverride', { width: o.w, height: o.h, deviceScaleFactor: o.scale, mobile: !!o.mobile });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: o.scheme }] });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.enable');
if (o.url) {
  await send('Page.navigate', { url: 'about:blank' }); await wait(150);
  await send('Page.navigate', { url: o.url });
  let ok = false;
  for (let i = 0; i < 80 && !ok; i++) { await wait(400); ok = await evalJs(`(${o.ready || "document.readyState === 'complete'"}) && (!document.fonts || document.fonts.status === 'loaded')`); }
  if (ok !== true) console.log('ZAMAN AŞIMI', ok);
}
if (o.before) console.log('önce:', await evalJs(o.before));
await wait(o.wait);
if (o.scroll) { await evalJs(`document.querySelector(${JSON.stringify(o.scroll)}).scrollIntoView({ block: 'start' })`); await wait(900); }
if (o.expr) console.log(await evalJs(o.expr));
if (o.out) {
  let clip = o.clip;
  const pad = o.pad || 0;
  if (o.clipSel) clip = JSON.parse(await evalJs(`(r => JSON.stringify({ x: Math.max(0, Math.floor(r.left + scrollX) - ${pad}), y: Math.max(0, Math.floor(r.top + scrollY) - ${pad}), w: Math.ceil(r.width) + ${2 * pad}, h: Math.ceil(r.height) + ${2 * pad} }))(document.querySelector(${JSON.stringify(o.clipSel)}).getBoundingClientRect())`));
  if (o.clipBottom) clip = { x: 0, y: 0, w: o.w, h: Math.round(await evalJs(o.clipBottom)) };
  if (o.full) clip = { x: 0, y: 0, w: o.w, h: Math.ceil(await evalJs('document.documentElement.scrollHeight')) };
  const params = { format: 'png' };
  if (clip) { params.clip = { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 }; params.captureBeyondViewport = true; }
  const shot = await send('Page.captureScreenshot', params);
  writeFileSync(o.out, Buffer.from(shot.result.data, 'base64'));
  console.log('png', o.out.split('/').pop(), clip ? clip.w + 'x' + clip.h : o.w + 'x' + o.h);
}
ws.close();
