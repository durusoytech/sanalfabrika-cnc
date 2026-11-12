/* Emek Sermaye · Firebase bağlantı ayarları
   Bu değerler herkese açık olacak şekilde tasarlanmıştır ve depoya yazılabilir.
   Verinin güvenliğini Firestore erişim kuralları (firestore.rules) sağlar.
   Yönetici anahtarları ve hizmet hesabı dosyaları buraya ASLA yazılmaz. */
window.EMEK_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyCixglViU16bd6XPLbUovrRTz_KfRBTX-k',
    authDomain: 'emeksermaye.firebaseapp.com',
    projectId: 'emeksermaye',
    appId: '1:392329719485:web:cad9e24cd4ddf1177c51d4',
    messagingSenderId: '392329719485'
  },
  // Yalnızca localhost'ta kullanılır: "npm run dev" ile açılan yerel test ortamı.
  // Yerelde canlı veriyi görmek için adrese ?canli=1 ekleyin.
  emulators: { auth: 'http://127.0.0.1:9199', firestoreHost: '127.0.0.1', firestorePort: 8185 }
};
