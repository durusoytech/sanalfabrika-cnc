// supabase/setup.sql dosyasını üretir: npm run build:sql
// Supabase SQL Editor'e tek seferde yapıştırılacak dosya = tüm migration'lar + başlangıç verisi.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, migrationFiles } from './supabase-shim.mjs';

const parts = [
  '-- Emek Sermaye · Supabase kurulum dosyası',
  '-- Bu dosya scripts/build-setup-sql.mjs ile üretilir, doğrudan düzenlemeyin.',
  '-- Kullanım: Supabase panelinde SQL Editor > New query > bu dosyanın tamamını yapıştırın > Run.',
  '-- Boş bir projede yalnızca bir kez çalıştırın.',
  ''
];
for (const m of migrationFiles()) parts.push(`-- >>> ${m.name}`, m.sql.trim(), '');
parts.push('-- >>> seed.sql', readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8').trim(), '');
const out = join(ROOT, 'supabase', 'setup.sql');
writeFileSync(out, parts.join('\n'));
console.log(`supabase/setup.sql yazıldı (${parts.join('\n').length.toLocaleString('tr-TR')} karakter)`);
