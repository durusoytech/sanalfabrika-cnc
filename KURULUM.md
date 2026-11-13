# Emek Sermaye · Kurulum ve işletme rehberi

Site, giriş ve veritabanı Firebase üzerinde çalışır. Ayrı bir sunucu yoktur. Her şey Firebase'in kart istemeyen ücretsiz planındadır.

## Mimari

```
Tarayıcı
  ├─ index.html        Tanıtım sitesi (emeksermaye.com)
  └─ platform.html     Yatırımcı platformu: Tesisler, Makinelerim, Analiz, Yönetim
        │
        ▼
Firebase projesi: emeksermaye
  ├─ Hosting           Site dosyalarını yayınlar
  ├─ Authentication    E-posta ve şifreyle kayıt ve giriş
  └─ Cloud Firestore   Veritabanı (Avrupa bölgesi, eur3)
       └─ firestore.rules   Kim neyi okuyabilir, kim neyi yazabilir
```

Yetkiler site kodunda değil, veritabanındaki kurallarda tutulur. Bir kullanıcı tarayıcıdaki kodu değiştirse bile kuralların izin vermediği veriyi okuyamaz ve yazamaz.

| Dosya | Görevi |
|---|---|
| `index.html`, `assets/site.css`, `assets/site.js` | Tanıtım sitesi |
| `platform.html`, `assets/platform.css`, `assets/platform.js` | Yatırımcı platformu |
| `assets/admin.js` | Yönetim ekranı, yalnızca personele görünür |
| `assets/firebase.js` | Giriş ve Firestore bağlantısı |
| `assets/core.js` | Varsayılan ayarlar ve gelir hesabı |
| `assets/config.js` | Firebase bağlantı ayarları, herkese açık değerler |
| `firestore.rules` | Erişim kuralları |
| `tools/` | Veri yükleme, personel tanımlama ve kural testleri |

## Veritabanı

| Koleksiyon | İçerik | Kim okur | Kim yazar |
|---|---|---|---|
| `config` | Platform payı oranları, ön ödeme oranı, tedarik adımları | Herkes | Personel |
| `machineTypes` | 3, 4 ve 5 eksen tezgâh tipleri, fiyat ve dakika ücretleri | Herkes | Personel |
| `facilities` | Tesisler: ad, konum, slotlar, fotoğraflar | Herkes | Personel |
| `machines` | Tezgâhlar: slot, tip, sahibi, durum | Herkes | Personel |
| `news` | Ana sayfadaki haberler | Herkes | Personel |
| `jobs` | İş ve bakım kayıtları, müşteri adı dahil | Tezgâh sahibi, personel | Personel |
| `investors` | Yatırımcının adı ve kodu | Kendisi, personel | Kendisi |
| `requests` | Yatırım talepleri | Kendisi, personel | Kendisi oluşturur, personel yönetir |
| `staff` | Personel listesi | Kendisi | Yalnızca araç ya da konsol |

Makinelerin o anki durumu `machines` belgesindeki `liveStatus` alanıdır: `running`, `setup`, `idle` ya da `maintenance`. Bu alanı personel Yönetim ekranından günceller. Tezgâhlar fabrikada bir sisteme bağlandığında aynı alan otomatik güncellenebilir.

## Günlük işletme

### Personel tanımlama

1. Kişi sitede kendi e-postasıyla hesap açar.
2. Bu bilgisayarda şu komutu çalıştırın:

```bash
node tools/make-staff.mjs kisi@ornek.com
```

3. Kişi sayfayı yenilediğinde üst menüde **Yönetim** sekmesini görür.

Personellikten çıkarmak için aynı komuta `--remove` ekleyin. Komut Firebase komut satırı oturumunu kullanır, önce bir kez `npx firebase-tools login` gerekir.

### Yatırım talebinden üretime

1. Yatırımcı Tesisler sayfasında boş bir slot seçip **yatırım talebi** oluşturur. Talep bir ön başvurudur, slotu kilitlemez ve ödeme almaz.
2. Personel Yönetim ekranında talebi görür, yatırımcıyla görüşür ve talebi **Görüşülüyor** yapar.
3. Sözleşme imzalanıp ön ödeme alındıktan sonra personel **Tezgâhı tanımla** der. Slot yatırımcıya ayrılır ve tedarik süreci o gün başlar. Yatırımcı adımları Makinelerim sayfasından izler.
4. Kurulum bittiğinde personel **Üretime al** der. Tezgâh iş almaya başlar.
5. Personel **İşler** bölümünden iş ve bakım kayıtlarını girer. Bitiş saati adet, çevrim ve ayar süresinden hesaplanır. Aynı tezgâha çakışan kayıt girilemez.

Yatırımcının kazancı bu iş kayıtlarından hesaplanır: çalışılan dakika, dakika ücreti, işletme ücreti ve platform payı.

### Haber yayınlama

Yönetim ekranındaki **Haberler** bölümünden başlık ve metin girin. Haber ana sayfada görünür. Fotoğraflı haber için aşağıdaki fotoğraf adımlarını izleyip haberin `image` alanını Firebase konsolundan doldurun.

### Tesis fotoğrafını değiştirme

Şu an Kazan tesisinde internetten alınmış temsili bir fotoğraf var. Gerçek fotoğrafı koymak için:

1. Fotoğrafı `assets/img/tesisler/` klasörüne koyun, örneğin `kazan-2.jpg`. Yaklaşık 1280 piksel genişlik yeterlidir.
2. Siteyi yayınlayın: `npm run deploy`
3. Firebase konsolunda **Firestore > facilities > kazan** belgesini açın. `photos` listesindeki ilk öğede `src` alanını `assets/img/tesisler/kazan-2.jpg` yapın, `alt` alanına kısa bir açıklama yazın ve `representative`, `credit`, `license`, `sourceUrl` alanlarını silin.
4. Aynı değişikliği **news > ilk-subemiz-acildi** belgesindeki `image` alanında da yapın.

### Yeni tesis ekleme

`tools/seed-data.mjs` dosyasındaki `facilities` bölümüne yeni tesisi ekleyip şu komutu çalıştırın. Komut yalnızca eksik belgeleri oluşturur, var olanlara dokunmaz.

```bash
node tools/seed.mjs
```

Tesis haritada `lat` ve `lng` alanlarındaki konumda görünür.

### Fiyat ve oranları değiştirme

Firebase konsolunda **Firestore** bölümünden değiştirin. Değişiklik siteye hemen yansır.

- Tezgâh fiyatı, dakika ücreti ve işletme kalemleri: `machineTypes` koleksiyonu
- Platform payı ve ön ödeme oranı: `config/pricing` belgesi
- Tedarik adımları ve süreleri: `config/procurement` belgesi

## Yayınlama

```bash
npm run deploy
```

Komut site dosyalarını ve erişim kurallarını yayınlar. Çıktıda `found 36 files` civarında bir sayı görmelisiniz. Sayı çok daha büyükse `firebase.json` içindeki hariç tutma kurallarını kontrol edin.

## Yerel geliştirme ve test

Node.js 20 veya üstü, Java ve Firebase komut satırı aracı gerekir. Yerel test ortamı canlı veriye dokunmaz.

```bash
npm run dev
```

Site http://localhost:5055 adresinde açılır ve yerel giriş ile veritabanı emülatörüne bağlanır. İlk verileri yüklemek için ikinci bir terminalde:

```bash
npm run seed:local
```

Erişim kurallarının testleri:

```bash
npm run test:rules
```

Yerelde çalışırken canlı veriyi görmek için adrese `?canli=1` ekleyin.

## Alan adı

emeksermaye.com, Firebase Hosting'deki `emeksermaye` projesine bağlıdır. `www.emeksermaye.com` ana adrese yönlenir. Alan adı Turkticaret.net'te kayıtlıdır ve DNS kayıtları oradan yönetilir. SSL sertifikasını Firebase kendisi alır ve yeniler.

| Ad | Tür | Değer | Not |
|---|---|---|---|
| `@` | A | `199.36.158.100` | Firebase Hosting |
| `@` | TXT | `hosting-site=emeksermaye` | Firebase sahiplik doğrulaması |
| `www` | CNAME | `emeksermaye.web.app` | www adresi, ana adrese yönlenir |
| `@` | MX | `mx.turkticaret.net` | E-posta, değiştirmeyin |
| `@` | TXT | `v=spf1 include:_spf.turkticaret.net ~all` | E-posta, değiştirmeyin |

## Ücretsiz plan sınırları

- **Firestore:** 1 GB veri, günde 50.000 okuma ve 20.000 yazma. Sınır aşılırsa o gün için okuma ve yazma durur, ücret çıkmaz.
- **Hosting:** 10 GB depolama ve ayda 10 GB trafik.
- **Authentication:** E-posta ve şifreyle giriş ücretsizdir.
- **Dosya depolama yok.** Firebase'in dosya deposu artık ücretli plan istiyor. Bu yüzden fotoğraflar site dosyalarıyla birlikte `assets/img/` klasöründe durur.

## Bilinen eksikler

- **Tezgâh bağlantısı yok.** Tezgâh durumunu ve iş kayıtlarını personel elle girer.
- **Ödeme yok.** Ön ödeme ve tahsilat site dışında yapılır.
- **Bildirim yok.** Yeni talep geldiğinde e-posta gitmez, personel Yönetim ekranından görür.
- **E-posta onayı zorunlu değil.** Kayıt olan kullanıcı e-postasını doğrulamadan giriş yapabilir.
- **Harita.** Harita karoları OpenStreetMap'in ücretsiz sunucularından gelir. Ziyaretçi sayısı arttığında ücretli bir harita sağlayıcısına geçmek gerekir.

## İleride kendi sunucunuza geçiş

Firestore bir Postgres veritabanı değildir. Kendi Postgres sunucunuza geçtiğinizde veriyi dışarı aktarıp tabloya dönüştürmek ve `assets/firebase.js` dosyasını kendi API'nize göre yeniden yazmak gerekir. Gelir hesapları `assets/core.js` içinde ayrı durduğu için o kısım değişmez. Daha önce hazırlanan Postgres şeması ve kuralları depo geçmişinde durur.
