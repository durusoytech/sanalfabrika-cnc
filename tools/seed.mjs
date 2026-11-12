// Firestore'a başlangıç verilerini yükler.
//   node tools/seed.mjs               canlı projeye, yalnızca eksik belgeleri oluşturur
//   node tools/seed.mjs --overwrite   canlı projedeki belgelerin üzerine yazar
//   node tools/seed.mjs --emulator    yerel emülatöre yükler
// Canlı proje için Firebase CLI oturumu gerekir: npx firebase-tools login
import { PROJECT, EMULATOR, getAdminToken, writeDoc, loadCore } from './firestore-rest.mjs';
import { facilities, machines, news } from './seed-data.mjs';

const overwrite = process.argv.includes('--overwrite');
const SF = loadCore();
const token = await getAdminToken();

const docs = [];
docs.push(['config/pricing', { fees: { own: SF.FEES.own, platform: SF.FEES.platform }, depositRate: SF.DEPOSIT_RATE }]);
docs.push(['config/procurement', { steps: SF.PROC_STEPS.map(s => ({ key: s.key, label: s.label, days: s.days, description: s.desc })) }]);
for (const T of Object.values(SF.TYPES)) docs.push([`machineTypes/${T.axes}`, SF.typeToDoc(T)]);
for (const [id, f] of Object.entries(facilities)) docs.push([`facilities/${id}`, f]);
for (const [id, m] of Object.entries(machines)) docs.push([`machines/${id}`, m]);
for (const [id, n] of Object.entries(news)) docs.push([`news/${id}`, n]);

console.log(`Hedef: ${EMULATOR ? 'yerel emülatör' : 'canlı proje'} (${PROJECT})${overwrite ? ' · üzerine yazma açık' : ''}`);
for (const [path, data] of docs) {
  const result = await writeDoc(path, data, { token, overwrite });
  console.log(`  ${path.padEnd(28)} ${result}`);
}
console.log(`${docs.length} belge işlendi.`);
