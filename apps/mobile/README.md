# havameridyen mobil uygulaması

Vite + React, Capacitor ile önce Android (sunucu madde 5, Ekim 2026). Ekranlar Prototip 9'a göre.

- **Bu sürümde:** konum sayfası (arama, "Konumumu kullan", hızlı şehirler, ECMWF favori kartları), tek model ekranı, Sayfa 1 (iki ve daha çok model: ortanca + uyum), Sayfa 2 (modeller ayrı ayrı, günlük kartlar), Sayfa 3 (grafikler: saatlik / 3 / 7 / 16 gün), ⓘ menüsü (Modeller, Terimler, SSS, Hakkında, Yasal).
- **Sonraki paketlerde:** widget, Android'de deneme.
- **Veri:** uygulama Open-Meteo'yu doğrudan çağırmaz; yalnız `https://www.havameridyen.com/api/v1/forecast` (7 gün; Sayfa 3'te "16 gün" seçilince bir kez 16 gün) ve `/api/v1/locations`.
- **Kurallar web ile ortak:** kök klasördeki `lib/` (agreement.js, consensus.js, terms.js, forecast.js içindeki model listesi) `@lib` adıyla kullanılır. Bir kural değişince web ve uygulama birlikte değişir.

## Tarayıcıda deneme (Android Studio gerekmez)

İki terminal:

```bash
# 1) kök klasörde: web + /api (http://localhost:3000)
npm run dev

# 2) apps/mobile içinde
npm install
npm run dev
```

`npm run dev` adresini (http://localhost:5173) tarayıcıda telefon boyutunda aç (geliştirici araçları → cihaz görünümü, ör. 390 × 844). `/api` istekleri yerel Next sunucusuna aktarılır. Canlı siteyle denemek için: `API_TARGET=https://www.havameridyen.com npm run dev`.

## Android (Android Studio kurulunca)

```bash
cd apps/mobile
npm run build
npx cap add android        # yalnız ilk kez; android/ klasörünü oluşturur
npx cap sync android
npx cap open android       # Android Studio'da açar; emülatörde ya da telefonda çalıştır
```

İlk kez eklendikten sonra `android/app/src/main/AndroidManifest.xml` içine konum izni eklenir:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

Sonraki her değişiklikte: `npm run android` (derler, eşitler, Android Studio'yu açar).
