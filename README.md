# SanalFabrika CNC

CNC fabrikalarının dijital ikizini gösteren görsel bir prototip. Yatırımcılar fabrikalardaki boş slotlara 3, 4 veya 5 eksen CNC alabilir, makinelerin iş takvimini ve canlı görüntüsünü izleyebilir, kazançlarını ve aylık kârlılığı analiz edebilir.

**Canlı site:** https://durusoytech.github.io/sanalfabrika-cnc/

## Ekranlar

- **Fabrikalar:** Her tesiste 10 slot var. Dolu slota tıklayınca makinenin takvimi, canlı izleme ve gelir özeti açılır. Boş slota tıklayınca satın alma adımları başlar.
- **Makinelerim:** Makine başına çalışma süresi, çıkan parça, brüt gelir, işletme ücreti dökümü ve net kazanç.
- **Analiz:** Günlük net kâr, gelirden kâra döküm, aylık trend, kendi işi ile platform işi karşılaştırması, doluluk ısı haritası ve yatırım geri dönüşü.

## Gelir modeli

Makine dakika ücreti üzerinden çalışır. Bu ücretten işletme ücreti düşülür: operatör, elektrik, bakım, takım, tesis ve sigorta. İşi makine sahibi bulduysa platform %5, platform bulduysa %20 pay alır. Fiyatlar, ücretler ve oranlar `assets/data.js` dosyasındadır.

## Çalıştırma

Derleme adımı yoktur. `index.html` dosyasını tarayıcıda açmak yeterlidir.

Tüm veriler demo amaçlıdır ve tarayıcıda üretilir. Satın alınan makineler sayfa yenilenince kaybolur.
