# SanalFabrika · Gerçek veritabanı kurulumu

Bu rehber, siteyi tarayıcıdaki demo verisinden gerçek bir Postgres veritabanına geçirir. Her şey ücretsiz planlarda çalışır ve kredi kartı gerekmez.

## Mimari: backend nerede çalışıyor?

Ayrı bir Node.js sunucusu yok. Sistem iki parçadan oluşur:

```
Tarayıcı                          GitHub Pages (ücretsiz)
  └─ index.html + assets/*        Statik site: arayüz, grafikler, canlı izleme
        │
        │  HTTPS (supabase-js)
        ▼
Supabase (ücretsiz plan)
  ├─ Auth            Kayıt, giriş, oturum
  ├─ Data API        Tablolar ve fonksiyonlar için otomatik REST uç noktaları
  └─ Postgres        Asıl backend burası
       ├─ Tablolar          tesisler, slotlar, makineler, işler, siparişler, ücretler
       ├─ RLS kuralları     kim neyi görebilir, kim neyi değiştirebilir
       ├─ Fonksiyonlar      satın alma, takvim, kâr hesabı (iş kuralları)
       └─ pg_cron           saatlik demo iş takvimi üretimi
```

İş kuralları Postgres fonksiyonları olarak yazıldı. Bu sayede:

- Kâr, işletme ücreti ve platform payı hesabı sunucuda yapılır ve tarayıcıda değiştirilemez.
- Bir yatırımcı başka yatırımcının müşteri adlarını ve gelirini göremez. Bu kural veritabanında uygulanır, site kodunda değil.
- Aynı makineye çakışan iş girilemez, dolu slota ikinci makine alınamaz.
- Kod standart SQL'dir. Supabase'den ayrılırken veritabanıyla birlikte taşınır.

| Dosya | Görevi |
|---|---|
| `supabase/migrations/*_sema.sql` | Tablolar, kısıtlar ve referans verileri |
| `supabase/migrations/*_is_kurallari.sql` | Satın alma, takvim, durum ve kâr fonksiyonları |
| `supabase/migrations/*_guvenlik.sql` | RLS kuralları ve rol yetkileri |
| `supabase/migrations/*_demo_motoru.sql` | Gerçek makine bağlantısı gelene kadar iş takvimi simülasyonu |
| `supabase/seed.sql` | 3 tesis, 30 slot ve 21 demo makine |
| `supabase/setup.sql` | Yukarıdakilerin hepsi tek dosyada, SQL Editor'e yapıştırmak için |
| `assets/config.js` | Supabase adresi ve publishable key |
| `assets/backend.js` | Sitenin Supabase ile konuştuğu katman |

## Site nerede yayınlanmalı?

Site statik dosyalardan oluşur ve Supabase'e tarayıcıdan bağlanır. Bu yüzden herhangi bir statik barındırma hizmetinden yayınlanabilir. Supabase'in API'si her alan adından gelen isteği kabul eder.

| Seçenek | Ücret | Sınır | Bu proje için |
|---|---|---|---|
| GitHub Pages | Ücretsiz | Site en fazla 1 GB, ayda 100 GB trafik | Prototip ve tanıtım için uygun |
| Firebase Hosting, Spark planı | Ücretsiz, kart istemez | 10 GB depolama, ayda 10 GB trafik | Gerçek kullanıcılar için önerilen |
| Supabase | Site barındırma hizmeti yok | Dosya deposu HTML dosyalarını güvenlik nedeniyle düz metin olarak sunar | Uygun değil |

**GitHub Pages'in kullanım şartları** ticari işlemlere aracılık eden siteleri, SaaS olarak çalışan siteleri ve şifre gibi hassas bilgilerin gönderildiği siteleri yasaklar. Gerçek yatırımcılar giriş yapıp makine satın almaya başladığında siteyi Firebase Hosting'e taşıyın.

**Firebase Hosting'de** aylık trafik sınırı aşılırsa kısa bir ek süreden sonra site ay sonuna kadar kapanır, ücret çıkmaz. Bu projenin dosyaları toplamda yaklaşık 250 KB olduğu için sınır uzun süre sorun olmaz.

### Firebase Hosting'e yayınlama

Depodaki `firebase.json` dosyası hazırdır. Yalnızca site dosyalarını yükler; `supabase/`, `scripts/` ve `node_modules/` yüklenmez.

1. https://console.firebase.google.com adresinde Spark planında bir proje açın. Kart istenmez.
2. Bilgisayarınızda Firebase hesabınıza giriş yapın:

```bash
npx firebase-tools login
```

3. Proje kimliğinizi yazarak yayınlayın:

```bash
npx firebase-tools deploy --only hosting --project PROJE-KIMLIGINIZ
```

4. Komutun verdiği `https://PROJE-KIMLIGINIZ.web.app` adresini Supabase'de **Authentication > URL Configuration** sayfasına Site URL ve Redirect URL olarak ekleyin.

## Kurulum adımları

### 1. Supabase projesi açın

1. https://supabase.com adresinde ücretsiz hesap açın. Kart istenmez.
2. **New project** ile bir proje oluşturun. Bölge olarak Avrupa bölgelerinden birini seçin, örneğin Frankfurt.
3. Veritabanı şifresini güvenli bir yerde saklayın. Siteye yazılmaz.

### 2. Veritabanını kurun

1. Sol menüden **SQL Editor** sayfasını açın, **New query** deyin.
2. `supabase/setup.sql` dosyasının tamamını yapıştırıp **Run** deyin.
3. Bitince **Table Editor** sayfasında `machines` tablosunda 21 satır görmelisiniz.

Bu dosyayı boş bir projede yalnızca bir kez çalıştırın. İkinci kez çalıştırırsanız tablolar zaten var hatası alırsınız.

### 3. Giriş ayarları

**Authentication > URL Configuration** sayfasında:

- **Site URL:** sitenin yayınlandığı adres. GitHub Pages için `https://durusoytech.github.io/sanalfabrika-cnc/`, Firebase Hosting için `https://PROJE-KIMLIGINIZ.web.app`.
- **Redirect URLs** listesine aynı adresi ekleyin. İki yerde birden yayınlıyorsanız ikisini de ekleyin.

E-posta onayı varsayılan olarak açıktır. Yeni kullanıcı kayıttan sonra e-postasındaki bağlantıya tıklamadan giriş yapamaz. Supabase'in yerleşik e-posta servisi saatte birkaç e-postayla sınırlıdır. Gerçek kullanıcılara açılmadan önce **Authentication > Emails > SMTP Settings** bölümünden kendi e-posta servisinizi bağlayın.

### 4. Siteyi veritabanına bağlayın

1. Proje sayfasının üstündeki **Connect** düğmesinden veya **Project Settings > API Keys** sayfasından iki değeri alın:
   - Project URL, örneğin `https://abcdxyz.supabase.co`
   - Publishable key, `sb_publishable_` ile başlar
2. `assets/config.js` dosyasına yazın:

```js
window.SF_CONFIG = {
  supabaseUrl: 'https://abcdxyz.supabase.co',
  supabaseKey: 'sb_publishable_...'
};
```

3. Değişikliği GitHub'a gönderin. Bir iki dakika içinde site canlı veriyle açılır ve sağ üstte **Canlı veri** yazar.

Publishable key herkese açık olacak şekilde tasarlanmıştır ve depoya yazılabilir. **Secret key** (`sb_secret_` ile başlar) ise hiçbir zaman siteye veya depoya yazılmaz.

### 5. Demo portföyünü kendi hesabınıza bağlayın

1. Sitede **Giriş yap > Ücretsiz hesap oluşturun** ile kayıt olun ve e-postanızı onaylayın.
2. SQL Editor'de şunu çalıştırın:

```sql
select public.link_demo_portfolio('sizin@e-postaniz.com');
```

Sayfayı yenilediğinizde Makinelerim ve Analiz ekranlarında Deniz Aksoy demo portföyünü görürsünüz.

### 6. Tesis personeli tanımlayın (isteğe bağlı)

Personel iş ve bakım kaydı girebilir, makineleri yönetebilir. Kayıt olmuş bir kullanıcıyı personel yapmak için:

```sql
insert into public.staff (user_id, role)
select id, 'admin' from auth.users where email = 'personel@e-posta.com';
```

## Ayarlar

`app_settings` tablosunda iki ayar vardır:

| Anahtar | Varsayılan | Anlamı |
|---|---|---|
| `simulate_jobs` | `true` | Yeni alınan makineler kurulum bitince demo iş takvimi alır |
| `max_open_orders` | `3` | Bir yatırımcının aynı anda bekleyebileceği en fazla sipariş |

Gerçek işlere geçtiğinizde simülasyonu kapatın:

```sql
update public.app_settings set value = 'false' where key = 'simulate_jobs';
update public.machines set is_demo = false;
select cron.unschedule('sanalfabrika-demo');
```

## Ücretsiz plan sınırları

- Veritabanı 500 MB. Bu proje başlangıçta yaklaşık 2 MB kullanır.
- Ayda 50.000 aktif kullanıcı.
- **7 gün hiç istek gelmezse proje duraklatılır.** Veri silinmez ama panelden elle yeniden başlatmak gerekir. Bunu önlemek için depoda `.github/workflows/supabase-uyanik.yml` görevi var. Üç günde bir veritabanına küçük bir istek atar. Çalışması için GitHub'da **Settings > Secrets and variables > Actions > Variables** sayfasına `SUPABASE_URL` ve `SUPABASE_KEY` değişkenlerini ekleyin. Bu yöntem yaygın kullanılır ama Supabase bunun duraklatmayı her zaman önleyeceğini garanti etmez.
- GitHub, 60 gün boyunca hiç commit gelmeyen depolarda zamanlanmış görevleri kapatır. Uzun süre değişiklik yapmazsanız görevi **Actions** sekmesinden yeniden açın.

## Yerel geliştirme

Docker gerekmez. Node.js 20 veya üstü yeterlidir.

```bash
npm install
```

```bash
npm run test:db
```

Veritabanı testleri migration'ları bellekte çalışan bir Postgres'e kurar, ardından güvenlik ve kâr hesaplarını doğrulayan 26 testi çalıştırır.

```bash
npm run dev
```

Yerel sunucu http://localhost:8792 adresinde açılır. Supabase'in sitenin kullandığı kısmını taklit eder ve her açılışta veritabanını sıfırdan kurar. Test hesabı: `demo@sanalfabrika.test` / `demo1234`.

Migration dosyalarını değiştirdikten sonra tek parça dosyayı yeniden üretin:

```bash
npm run build:sql
```

## Kendi sunucunuza taşıma

İki yol vardır:

1. **Supabase'i kendi sunucunuzda çalıştırmak.** Supabase açık kaynaktır ve Docker ile kurulur. Bu yolda kod hiç değişmez, sadece `config.js` içindeki adres değişir. Ayrıntılar: https://supabase.com/docs/guides/self-hosting/docker
2. **Düz Postgres ve kendi Node.js API'niz.** Veritabanı `pg_dump` ile taşınır. Tablolar, kurallar ve fonksiyonlar standart Postgres olduğu için aynen çalışır. Değişmesi gereken iki şey var: kullanıcı kimliğini veren `auth.uid()` fonksiyonunu kendi giriş sisteminize bağlamak ve `assets/backend.js` dosyasını kendi API'nize göre uyarlamak.
