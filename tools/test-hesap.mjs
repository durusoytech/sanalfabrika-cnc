// Hesaplama aracının hesap modelini sınar: npm run test:hesap
// Beklenen değerler örnek girdilerle elle hesaplanmıştır.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = { window: {} }; ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(new URL('../assets/hesap.js', import.meta.url), 'utf8'), ctx);
const { defaults, compute, migrateV2, migrateV3 } = ctx.window.EmekHesapModel;
let fail = 0;
const near = (name, got, want, tol = 0.01) => { const ok = Math.abs(got - want) <= tol; if (!ok) fail++; console.log(ok ? '  tamam' : '  HATA ', name, ok ? '' : `beklenen ${want}, bulunan ${got}`); };
const yes = (name, cond) => { if (!cond) fail++; console.log(cond ? '  tamam' : '  HATA ', name); };

const d = defaults(), r = compute(d);
// Örnek: 8 tezgâh, 26 gün, %65 doluluk → tezgâh başına 16,9 dolu gün; 2 × 8 = 16 saat çalışma
const busy = 16.9, gross = busy * (3 * 720 + 3 * 960 + 2 * 1440), pf = gross * 0.155;
const ops = 8 * 60 * busy, plans = 1 * 90 * busy, others = (115 + 70) * 26;
const elec = 8 * busy * 24, tool = 8 * busy * 48, maint = 1665000 * 0.03 / 12, ins = 16650 / 12;
const total = ops + plans + others + 5000 + elec + tool + maint + ins + 2100;
const fixed = others + 5000 + maint + ins + 2100;

console.log('Örnek değerler');
yes('saatlik iş ücretleri 45 / 60 / 90', d.machines.map(m => m.hourly).join() === '45,60,90');
yes('tezgâh satırında 24 saatlik ücret yok', d.machines.every(m => !('rate24' in m)));
near('tezgâh dolu günde 16 saat çalışır', r.workHours, 16);
yes('dolu günde gelir 720 / 960 / 1440', r.types.map(t => Math.round(t.dayRate)).join() === '720,960,1440');
near('tezgâh başına dolu gün', r.busy, busy);
near('aylık ciro', r.gross, gross);
near('platform payı', r.pf, pf);
near('operatör sayısı', r.people.operators, 8);
near('planlamacı sayısı', r.people.planners, 1);
near('operatör gideri dolu günle', r.cost.operators, ops);
near('planlamacı gideri dolu günle', r.cost.planners, plans);
near('diğer ekip her çalışma günü', r.cost.others, others);
near('elektrik', r.cost.elec, elec);
near('takım ve sarf', r.cost.tool, tool);
near('bakım', r.cost.maint, maint);
near('sigorta', r.cost.ins, ins);
near('toplam işletme gideri', r.cost.total, total);
near('yatırımcılara kalan', r.investorNet, gross - pf - total);
near('yatırımcı neti, tezgâh başına günlük', r.day.investorOne, (gross - pf - total) / 8 / 26);
near('şirketin günlük kârı', r.day.profit, pf / 26);
near('başabaş doluluk', r.breakEven, fixed / (26 * 7920 * 0.845 - 8 * 26 * 72 - (8 * 60 + 90) * 26), 1e-9);
const t4 = r.types[1], shared = (ops + plans + others + 5000 + 2100) / 8, cost4 = shared + busy * 72 + 525 + 175;
near('4 eksen aylık işletme gideri', t4.opCost, cost4);
near('4 eksen aylık net', t4.net, 960 * busy * 0.845 - cost4);
near('4 eksen geri dönüş (yıl)', t4.paybackYears, 216500 / ((960 * busy * 0.845 - cost4) * 12), 1e-9);

console.log('Doluluk ve ekip');
const u0 = compute({ ...d, util: 0 });
yes('doluluk sıfırsa operatör ve planlamacı ücreti yok', u0.cost.operators === 0 && u0.cost.planners === 0);
near('doluluk sıfırsa diğer giderler sürer', u0.cost.total, fixed);
near('doluluk sıfırsa yatırımcılar sabit giderleri öder', u0.investorNet, -fixed);
yes('doluluk sıfırken sayı hatası yok', u0.costBusyDay === null && u0.types[0].netDay === null && u0.types[0].paybackYears === Infinity);
const u100 = compute({ ...d, util: 100 });
near('tam dolulukta operatör her çalışma günü', u100.cost.operators, 8 * 60 * 26);
yes('operatör gideri dolulukla doğru orantılı', Math.abs(compute({ ...d, util: 30 }).cost.operators * 2 - compute({ ...d, util: 60 }).cost.operators) < 0.01);
near('başabaş dolulukta yatırımcı neti sıfır', compute({ ...d, util: r.breakEven * 100 }).investorNet, 0, 0.5);
yes('saatlik ücret artınca yatırımcı neti artar', compute({ ...d, machines: d.machines.map(m => ({ ...m, hourly: m.hourly + 5 })) }).investorNet > r.investorNet);

console.log('Tutarlılık');
near('ciro = yatırımcılara + işletme giderleri + platform payı', r.investorNet + r.cost.total + r.pf, r.gross);
near('tezgâh netlerinin toplamı = yatırımcılara kalan', r.types.reduce((a, t) => a + t.net * t.count, 0), r.investorNet);
near('günlük = aylık ÷ çalışma günü', r.day.gross * 26, r.gross);

console.log('Vardiya');
const s3 = compute({ ...d, shifts: 3 });
near('3 vardiyada tezgâh 24 saat çalışır', s3.workHours, 24);
near('3 vardiyada ciro', s3.gross, busy * (3 * 1080 + 3 * 1440 + 2 * 2160));
near('3 vardiyada operatör', s3.people.operators, 12);
yes('24 saati aşan vardiya bildirilir', compute({ ...d, shifts: 3, hours: 10 }).overHours === true && !r.overHours);

console.log('Önceki sürümlerden taşıma');
const v3 = { ...d, machines: d.machines.map(m => { const o = { ...m, rate24: m.hourly * 24 }; delete o.hourly; return o; }) };
const m3 = migrateV3(v3);
yes('v3: 24 saatlik ücret saatliğe çevrilir', m3.machines.map(m => m.hourly).join() === '45,60,90' && !('rate24' in m3.machines[0]));
near('v3: çevrilen değerlerle sonuç aynı', compute(m3).investorNet, r.investorNet);
const v2 = { ...d, machines: d.machines.map(m => { const o = { ...m, dayRate: m.hourly * 16 }; delete o.hourly; return o; }), elecDay: 24, toolDay: 48 };
delete v2.hours; delete v2.elec24; delete v2.tool24;
const m2 = migrateV3(migrateV2(v2));
yes('v2: günlük ücret saatliğe çevrilir', m2.machines.map(m => m.hourly).join() === '45,60,90' && m2.elec24 === 36 && m2.tool24 === 72);

console.log('Sınır durumlar');
const z = compute({ ...d, machines: [] });
yes('tezgâh yokken sayı hatası yok', [z.gross, z.profit, z.investorOne, z.investorYearly, z.day.investorOne].every(Number.isFinite) && z.costBusyDay === null && z.breakEven === Infinity);
yes('boş ve hatalı girişler sıfır sayılır', Math.abs(compute({ ...d, rent: '', elec24: 'abc', tool24: -5 }).cost.total - (total - 5000 - elec - tool)) < 0.01);
yes('operatör oranı sıfırsa operatör yok', compute({ ...d, perOperator: 0 }).people.operators === 0);
yes('slot aşımı bildirilir', compute({ ...d, slots: 6 }).free === -2);
console.log(fail ? `\n${fail} sınama başarısız` : '\nTüm sınamalar geçti');
process.exit(fail ? 1 : 0);
