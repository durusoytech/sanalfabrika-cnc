# SanalFabrika CNC

CNC fabrikalarının dijital ikizini gösteren görsel bir prototip. Yatırımcılar fabrikalardaki boş slotlara 3, 4 veya 5 eksen CNC alabilir, makinelerin iş takvimini ve canlı görüntüsünü izleyebilir, kazançlarını ve aylık kârlılığı analiz edebilir.

**Canlı site:** https://durusoytech.github.io/sanalfabrika-cnc/

## Ekranlar

- **Fabrikalar:** Her tesiste 10 slot var. Dolu slota tıklayınca makinenin takvimi, canlı izleme ve gelir özeti açılır. Boş slota tıklayınca satın alma adımları başlar.
- **Makinelerim:** Makine başına çalışma süresi, çıkan parça, brüt gelir, işletme ücreti dökümü ve net kazanç.
- **Analiz:** Günlük net kâr, gelirden kâra döküm, aylık trend, kendi işi ile platform işi karşılaştırması, doluluk ısı haritası ve yatırım geri dönüşü.

## Gelir modeli

Makine dakika ücreti üzerinden çalışır. Bu ücretten işletme ücreti düşülür: operatör, elektrik, bakım, takım, tesis ve sigorta. İşi makine sahibi bulduysa platform %5, platform bulduysa %20 pay alır. Fiyatlar, ücretler ve oranlar `assets/data.js` dosyasındadır.

## Mimari

Site GitHub Pages'te çalışır. Gerçek veri için ayrı bir sunucu yerine Supabase kullanılır: Postgres veritabanı, kullanıcı girişi ve otomatik API. İş kuralları Postgres fonksiyonları ve satır bazlı erişim kuralları olarak `supabase/` klasöründedir. Kurulum ve ayrıntılar için [KURULUM.md](KURULUM.md) dosyasına bakın.

`assets/config.js` boşsa site tarayıcıda üretilen demo verisiyle çalışır. Supabase bilgileri girilince giriş, gerçek satın alma ve kalıcı veriler açılır.

## Çalıştırma

Derleme adımı yoktur. Demo modu için `index.html` dosyasını tarayıcıda açmak yeterlidir.

Veritabanıyla birlikte yerelde çalıştırmak için Node.js 20 veya üstü gerekir, Docker gerekmez:

```bash
npm install
npm run test:db
npm run dev
```
