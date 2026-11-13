// Hesaplama aracının hesap modelini sınar: npm run test:hesap
// Beklenen değerler örnek girdilerle elle hesaplanmıştır.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = { window: {} }; ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(new URL('../assets/hesap.js', import.meta.url), 'utf8'), ctx);
const { defaults, compute, migrateV2, migrateV3, migrateV4 } = ctx.window.EmekHesapModel;
let fail = 0;
const near = (name, got, want, tol = 0.01) => { const ok = Math.abs(got - want) <= tol; if (!ok) fail++; console.log(ok ? '  tamam' : '  HATA ', name, ok ? '' : `beklenen ${want}, bulunan ${got}`); };
const yes = (name, cond) => { if (!cond) fail++; console.log(cond ? '  tamam' : '  HATA ', name); };

const d = defaults(), r = compute(d);
// Örnek: 8 tezgâh (3 × 3 eksen, 3 × 4 eksen, 2 × 5 eksen), 26 gün, %65 doluluk → 16,9 dolu gün; 2 vardiya × 8 saat
const busy = 16.9, fee = 0.3 * 0.05 + 0.7 * 0.2;
const gross = busy * 16 * (3 * 45 + 3 * 60 + 2 * 90), pf = gross * fee;
const opDay = 8 * 8 * 7.5, plDay = 1 * 8 * 11;                    // 8 operatör × 8 saat × $7,5; 1 planlamacı × 8 saat × $11
const op = opDay * busy, pl = plDay * busy;
const elec = 8 * busy * 36 * 16 / 24, tool = 8 * busy * 72 * 16 / 24;
const rent = 8 * 1000, ins = (3 * 1050 + 3 * 2100 + 2 * 3600) / 12, maint = 1665000 * 0.03 / 12;
const invCost = op + pl + elec + tool + rent + ins + maint;
const platMonthly = 5000 + 1800 + 3000 + 1800 + 1500 + 600, facility = 60000 + 15000 + 35000 + 8000 + 25000;

console.log('Yatırımcılar toplamı');
near('ortalama platform payı', r.fee, fee, 1e-12);
near('iş geliri = saatlik ücret × 16 saat × dolu gün', r.gross, gross);
near('operatör sayısı', r.people.operators, 8);
near('dolu günde operatör saati', r.people.opHoursDay, 64);
near('dolu günde operatör gideri', r.people.opDayCost, 480);
near('dolu günde planlamacı saati', r.people.plHoursDay, 8);
near('dolu günde planlamacı gideri', r.people.plDayCost, 88);
near('aylık operatör gideri', r.inv.operator, op);
near('aylık planlamacı gideri', r.inv.planner, pl);
near('elektrik', r.inv.elec, elec);
near('takım ve sarf', r.inv.tool, tool);
near('slot kirası', r.inv.rent, rent);
near('sigorta', r.inv.ins, ins);
near('bakım', r.inv.maint, maint);
near('yatırımcıların toplam gideri', r.invCost, invCost);
near('yatırımcılara kalan', r.investorNet, gross - pf - invCost);

console.log('Bir yatırımcı: 4 eksen tezgâh');
const t4 = r.types[1], g4 = 60 * 16 * busy;
const c4 = op / 8 + pl / 8 + busy * 24 + busy * 48 + 1000 + 175 + 525;
near('başta ödediği (fiyat + kurulum)', t4.invest, 216500);
near('aylık iş geliri', t4.lines.gross, g4);
near('aylık platform payı', t4.lines.pf, g4 * fee);
near('operatör payı', t4.lines.operator, op / 8);
near('slot kirası', t4.lines.rent, 1000);
near('aylık gider', t4.cost, c4);
near('aylık eline geçen', t4.net, g4 * (1 - fee) - c4);
near('yıl sonunda eline geçen', t4.net * 12, (g4 * (1 - fee) - c4) * 12);
near('geri dönüş (yıl)', t4.paybackYears, 216500 / ((g4 * (1 - fee) - c4) * 12), 1e-9);
near('tezgâhların netlerinin toplamı = yatırımcılara kalan', r.types.reduce((a, t) => a + t.net * t.count, 0), r.investorNet);
near('tüm tezgâhlar görünümü = toplam', r.all.net, r.investorNet);
near('tüm tezgâhların yatırımı', r.all.invest, 3 * 109500 + 3 * 216500 + 2 * 369500);

console.log('Platform');
near('tesis giderleri', r.platMonthly, platMonthly);
near('slot kirası geliri', r.rentIncome, rent);
near('platformun aylık kârı = pay + kira − tesis giderleri', r.platformProfit, pf + rent - platMonthly);
near('tesis yatırımı', r.facility, facility);
near('tesis yatırımının geri dönüşü (ay)', r.platformPaybackMonths, facility / (pf + rent - platMonthly), 1e-9);
near('para akışı dengede: iş geliri + platform giderleri = yatırımcılara + yatırımcı giderleri (kira hariç) + platform kârı',
  r.gross, r.investorNet + (r.invCost - r.rentIncome) + (r.platformProfit + r.platMonthly) , 0.01);

console.log('Doluluk');
const u0 = compute({ ...d, util: 0 });
yes('doluluk sıfırsa operatör ve planlamacı ücreti yok', u0.inv.operator === 0 && u0.inv.planner === 0);
yes('doluluk sıfırsa elektrik ve takım yok', u0.inv.elec === 0 && u0.inv.tool === 0);
near('doluluk sıfırsa yatırımcılar kira, sigorta ve bakımı öder', u0.investorNet, -(rent + ins + maint));
near('doluluk sıfırsa platform kirayı alır, tesis giderini öder', u0.platformProfit, rent - platMonthly);
near('yatırımcının başabaş dolulukta neti sıfır', compute({ ...d, util: r.breakEven * 100 }).investorNet, 0, 0.5);
near('platformun başabaş dolulukta kârı sıfır', compute({ ...d, util: r.platBreakEven * 100 }).platformProfit, 0, 0.5);
yes('operatör gideri dolulukla doğru orantılı', Math.abs(compute({ ...d, util: 30 }).inv.operator * 2 - compute({ ...d, util: 60 }).inv.operator) < 0.01);

console.log('Vardiya ve saatlik ücret');
const s3 = compute({ ...d, shifts: 3 });
near('3 vardiyada 12 operatör × 8 saat', s3.people.opHoursDay, 96);
near('3 vardiyada iş geliri 24 saat', s3.gross, busy * 24 * (3 * 45 + 3 * 60 + 2 * 90));
const s12 = compute({ ...d, shifts: 2, hours: 12 });
near('2 × 12 saatte operatör saati', s12.people.opHoursDay, 8 * 12);
const over = compute({ ...d, shifts: 3, hours: 10 });
yes('24 saati aşan vardiya 24 saate indirilir', over.workHours === 24 && over.shiftLen === 8 && over.overHours && !r.overHours);
near('operatör saatlik ücreti iki katına çıkınca gideri de', compute({ ...d, operatorHour: 15 }).inv.operator, op * 2);

console.log('Önceki sürümlerden taşıma');
const v4 = { ...d, operatorDay: 60, plannerDay: 90, hours: 8, days: 26, rent: 5000,
  staff: [{ name: 'Tesis sorumlusu', count: 1, day: 115 }, { name: 'Kalite kontrol', count: 1, day: 70 }],
  monthly: [{ name: 'Genel giderler', amount: 1500 }, { name: 'Yazılım lisansları', amount: 600 }] };
delete v4.operatorHour; delete v4.plannerHour; delete v4.slotRent; delete v4.platformMonthly;
const m4 = migrateV4(v4);
yes('v4: günlük ücretler saatliğe çevrilir', m4.operatorHour === 7.5 && m4.plannerHour === 11.25);
yes('v4: kira ve ekip platformun aylık giderleri olur', m4.platformMonthly.map(x => x.amount).join() === '5000,2990,1820,1500,600');
near('v4: yatırımcı aynı tutarı slot kirası olarak öder', m4.slotRent, Math.round(11910 / 8), 0);
yes('v4: eski alanlar kalkar', !('operatorDay' in m4) && !('staff' in m4) && !('rent' in m4) && !('monthly' in m4));
const v3 = { ...v4, machines: d.machines.map(m => { const o = { ...m, rate24: m.hourly * 24 }; delete o.hourly; return o; }) };
yes('v3 → v4 → v5 zinciri', migrateV4(migrateV3(v3)).machines.map(m => m.hourly).join() === '45,60,90');
const v2 = { ...v4, machines: d.machines.map(m => { const o = { ...m, dayRate: m.hourly * 16 }; delete o.hourly; return o; }), elecDay: 24, toolDay: 48 };
delete v2.elec24; delete v2.tool24;
const m2 = migrateV4(migrateV3(migrateV2(v2)));
yes('v2 → v5 zinciri', m2.machines.map(m => m.hourly).join() === '45,60,90' && m2.elec24 === 36 && m2.tool24 === 72);

console.log('Sınır durumlar');
const z = compute({ ...d, machines: [] });
yes('tezgâh yokken sayı hatası yok', [z.gross, z.investorNet, z.platformProfit, z.all.yearly].every(Number.isFinite) && z.costBusyDay === null && z.breakEven === Infinity);
near('tezgâh yokken platform tesis giderini öder', z.platformProfit, -platMonthly);
yes('boş girdide sayı hatası yok', (e => [e.investorNet, e.platformProfit, e.fee].every(Number.isFinite))(compute({})));
yes('slot aşımı bildirilir', compute({ ...d, slots: 6 }).free === -2);
yes('zarar eden tezgâhın geri dönüşü yok', compute({ ...d, util: 3 }).types[0].paybackYears === Infinity);
console.log(fail ? `\n${fail} sınama başarısız` : '\nTüm sınamalar geçti');
process.exit(fail ? 1 : 0);
