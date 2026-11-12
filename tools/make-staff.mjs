// Kayıtlı bir kullanıcıyı personel yapar ya da personellikten çıkarır.
//   node tools/make-staff.mjs kisi@ornek.com            personel yap
//   node tools/make-staff.mjs kisi@ornek.com --remove   personellikten çıkar
//   node tools/make-staff.mjs kisi@ornek.com --emulator yerel emülatörde
// Kullanıcı önce sitede hesap açmış olmalıdır. Canlı proje için Firebase CLI oturumu gerekir.
import { PROJECT, EMULATOR, AUTH_EMULATOR, getAdminToken, call, writeDoc, deleteDoc } from './firestore-rest.mjs';

const email = process.argv.slice(2).find(a => !a.startsWith('--'));
const remove = process.argv.includes('--remove');
if (!email) { console.error('Kullanım: node tools/make-staff.mjs <e-posta> [--remove] [--emulator]'); process.exit(2); }

const token = await getAdminToken();
const base = EMULATOR ? `${AUTH_EMULATOR}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
const r = await call('POST', `${base}/v1/projects/${PROJECT}/accounts:lookup`, { token, body: { email: [email] } });
const user = r.ok && r.json && r.json.users && r.json.users[0];
if (!user) { console.error(`Bu e-posta ile kayıtlı kullanıcı bulunamadı: ${email}. Önce sitede hesap açılmalı.`); process.exit(1); }

if (remove) {
  await deleteDoc(`staff/${user.localId}`, { token });
  console.log(`${email} personellikten çıkarıldı.`);
} else {
  await writeDoc(`staff/${user.localId}`, { role: 'admin', email, addedAt: new Date() }, { token, overwrite: true });
  console.log(`${email} personel yapıldı. Sayfayı yenileyince Yönetim sekmesi görünür.`);
}
