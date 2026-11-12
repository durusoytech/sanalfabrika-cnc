// Firestore'a ilk kez yüklenecek gerçek veriler: tesisler, makineler ve haberler.
// Makine tipleri, ücret oranları ve tedarik adımları assets/core.js içindeki varsayılanlardan alınır.
// Buradaki değerleri değiştirdikten sonra "node tools/seed.mjs --overwrite" ile yeniden yükleyin
// ya da doğrudan Firebase konsolundan düzenleyin.

const OPENED = new Date('2026-11-12T09:00:00+03:00');

const KAZAN_PHOTO = {
  src: 'assets/img/tesisler/kazan-1.jpg',
  alt: 'Beş eksenli bir işleme merkezinin iç görünümü',
  representative: true,                       // gerçek tesis fotoğrafı eklenince false yapın ya da bu alanı silin
  credit: 'Maschinologen',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mechanische_Fertigung.jpg'
};

export const facilities = {
  kazan: {
    code: 'KZN',
    name: 'Kazan Tesisi',
    shortName: 'Kazan',
    city: 'Kahramankazan, Ankara',
    address: '',                              // açık adres netleşince doldurun
    description: 'Emek Sermaye\'nin ilk tesisi. Ankara\'nın havacılık ve savunma sanayisine yakın konumuyla Kahramankazan\'da üretim yapar.',
    status: 'active',
    lat: 40.2053,                             // ilçe merkezi; tesisin tam konumuyla değiştirin
    lng: 32.6814,
    openedAt: OPENED,
    slots: ['A01', 'A02', 'A03', 'A04', 'A05', 'B01', 'B02', 'B03', 'B04', 'B05'],
    photos: [KAZAN_PHOTO],
    sort: 1
  }
};

// liveStatus: running | setup | idle | maintenance. Tezgâhın o anki durumu; personel günceller.
export const machines = {
  'KZN-A01': {
    facilityId: 'kazan', slot: 'A01', axes: 4, model: 'HMC-500',
    ownerUid: null, ownerLabel: 'Emek Sermaye',
    status: 'active', liveStatus: 'running', commissionedAt: OPENED, ownShareTarget: 0
  },
  'KZN-A02': {
    facilityId: 'kazan', slot: 'A02', axes: 3, model: 'VMC-850',
    ownerUid: null, ownerLabel: 'Emek Sermaye',
    status: 'active', liveStatus: 'running', commissionedAt: OPENED, ownShareTarget: 0
  }
};

export const news = {
  'ilk-subemiz-acildi': {
    title: 'İlk şubemiz Kazan\'da açıldı',
    summary: 'Ankara Kahramankazan\'daki ilk tesisimiz üretime başladı. İki CNC tezgâhı çalışıyor, sekiz slot yatırıma açık.',
    body: [
      'Emek Sermaye\'nin ilk tesisi Ankara Kahramankazan\'da üretime başladı. Tesisteki on CNC slotunun ikisinde tezgâhlar çalışıyor. Kalan sekiz slot, tezgâh sahibi olmak isteyen yatırımcılara açık.',
      'Boş slotları platformdan inceleyip yatırım talebi oluşturabilirsiniz. Talebinizin ardından ekibimiz sözleşme ve ön ödeme adımları için sizinle iletişime geçer.'
    ],
    publishedAt: OPENED,
    facilityId: 'kazan',
    image: KAZAN_PHOTO
  }
};
