# Emek Sermaye

Sermaye ile emeğin buluştuğu üretim platformu. Yatırımcılar profesyonelce işletilen fabrikalardaki boş slotlara 3, 4 veya 5 eksen CNC alır. Makine gerçek siparişler için parça üretir, yatırımcı iş takvimini, canlı görüntüyü ve kazancını platformdan izler.

**Site:** https://emeksermaye.com (Firebase Hosting, `emeksermaye` projesi)
**Yedek adres:** https://emeksermaye.web.app

## Sayfalar

- **Tanıtım sitesi (`index.html`):** Sade tek sayfa. Nasıl çalıştığı, kazancın nasıl oluştuğu, makine seçenekleri tablosu, güvence, haberler ve sık sorulan sorular.
- **Yatırımcı platformu (`platform.html`):** Aşağıdaki ekranlar, giriş ve yatırım talebi. Personel için ayrıca Yönetim ekranı.

## Logo

Logo dosyaları `assets/logo/` klasöründedir: yatay ve dikey logo, amblem, sekme simgesi ve PNG sürümleri. Anlamı, renk kodları ve kullanım kuralları [assets/logo/README.md](assets/logo/README.md) dosyasındadır.

## Platform ekranları

- **Tesisler:** Harita, tesis bilgisi, çalışan tezgâhlar ve yatırıma açık slotlar. Boş slot seçilerek yatırım talebi oluşturulur.
- **Makinelerim:** Yatırımcının tezgâhları, talepleri, iş takvimi ve kazanç dökümü.
- **Analiz:** Aylık net kazanç, günlük grafik, gelir dökümü ve tezgâh bazında kârlılık.
- **Yönetim:** Personel için talepler, tezgâh durumları, iş kayıtları ve haberler.

## Gelir modeli

Makine dakika ücreti üzerinden çalışır. Bu ücretten işletme ücreti düşülür: operatör, elektrik, bakım, takım, tesis ve sigorta. İşi makine sahibi bulduysa platform %5, platform bulduysa %20 pay alır. Fiyatlar, ücretler ve oranlar Firestore'daki `machineTypes` ve `config` belgelerindedir.

## Mimari

Site, giriş ve veritabanı Firebase üzerinde çalışır: Hosting, Authentication ve Cloud Firestore. Ayrı bir sunucu yoktur. Erişim yetkileri `firestore.rules` dosyasındaki kurallarla verilir. Kurulum, günlük işletme ve yayınlama adımları için [KURULUM.md](KURULUM.md) dosyasına bakın.

## Komutlar

```bash
npm run dev          # yerel test ortamı (emülatör), http://localhost:5055
npm run seed:local   # yerel ortama ilk verileri yükler
npm run test:rules   # erişim kurallarının testleri
npm run deploy       # siteyi ve kuralları yayınlar
```
