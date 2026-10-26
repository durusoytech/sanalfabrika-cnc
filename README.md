# Emek Sermaye

Sermaye ile emeğin buluştuğu üretim platformu. Yatırımcılar profesyonelce işletilen fabrikalardaki boş slotlara 3, 4 veya 5 eksen CNC alır. Makine gerçek siparişler için parça üretir, yatırımcı iş takvimini, canlı görüntüyü ve kazancını platformdan izler.

**Alan adı:** emeksermaye.com (bağlantı adımları KURULUM.md dosyasında)
**Geçici adres:** https://durusoytech.github.io/sanalfabrika-cnc/

## Sayfalar

- **Tanıtım sitesi (`index.html`):** Sermayenin ne yaptığı, bir dakikalık ücretin nasıl paylaşıldığı, makine seçenekleri, kazanç hesaplayıcı, tesisler, güvenceler ve riskler, sık sorulan sorular.
- **Yatırımcı platformu (`platform.html`):** Aşağıdaki üç ekran, giriş ve satın alma.

## Platform ekranları

- **Fabrikalar:** Her tesiste 10 slot var. Dolu slota tıklayınca makinenin takvimi, canlı izleme ve gelir özeti açılır. Boş slota tıklayınca satın alma adımları başlar.
- **Makinelerim:** Makine başına çalışma süresi, çıkan parça, brüt gelir, işletme ücreti dökümü ve net kazanç.
- **Analiz:** Günlük net kâr, gelirden kâra döküm, aylık trend, kendi işi ile platform işi karşılaştırması, doluluk ısı haritası ve yatırım geri dönüşü.

## Gelir modeli

Makine dakika ücreti üzerinden çalışır. Bu ücretten işletme ücreti düşülür: operatör, elektrik, bakım, takım, tesis ve sigorta. İşi makine sahibi bulduysa platform %5, platform bulduysa %20 pay alır. Fiyatlar, ücretler ve oranlar `assets/data.js` dosyasındadır.

## Mimari

Site statik dosyalardan oluşur; şimdilik GitHub Pages'te, gerçek kullanıcılar için Firebase Hosting'de yayınlanır. Gerçek veri için ayrı bir sunucu yerine Supabase kullanılır: Postgres veritabanı, kullanıcı girişi ve otomatik API. İş kuralları Postgres fonksiyonları ve satır bazlı erişim kuralları olarak `supabase/` klasöründedir. Kurulum ve ayrıntılar için [KURULUM.md](KURULUM.md) dosyasına bakın.

`assets/config.js` boşsa site tarayıcıda üretilen demo verisiyle çalışır. Supabase bilgileri girilince giriş, gerçek satın alma ve kalıcı veriler açılır.

## Çalıştırma

Derleme adımı yoktur. Demo modu için `index.html` veya `platform.html` dosyasını tarayıcıda açmak yeterlidir.

Veritabanıyla birlikte yerelde çalıştırmak için Node.js 20 veya üstü gerekir, Docker gerekmez:

```bash
npm install
npm run test:db
npm run dev
```
