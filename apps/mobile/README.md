# havameridyen mobil uygulaması

Vite + React, Capacitor ile önce Android (sunucu madde 5, Ekim 2026). Ekranlar Prototip 9'a göre.

- **Bu sürümde:** konum sayfası (arama, "Konumumu kullan", hızlı şehirler, ECMWF favori kartları), tek model ekranı, Sayfa 1 (iki ve daha çok model: ortanca + uyum), Sayfa 2 (modeller ayrı ayrı, günlük kartlar), Sayfa 3 (grafikler: saatlik / 3 / 7 / 16 gün), ⓘ menüsü (Modeller, Terimler, SSS, Hakkında, Yasal).
- **Sonraki paketlerde:** widget, uygulama ikonu ve açılış ekranı.
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

## Android

`android/` klasörü depoda (Capacitor 8; minSdk 24, targetSdk 36). Konum izni `android/app/src/main/AndroidManifest.xml` içinde.

```bash
cd apps/mobile
npm run android            # derler (dist), android/'a kopyalar, Android Studio'yu açar
```

Android Studio'da ilk açılışta Gradle eşitlemesi birkaç dakika sürer. Sonra üstteki cihaz listesinden emülatörü (Device Manager → Pixel, API 36) ya da USB hata ayıklaması açık telefonu seçip ▶ Run. Uygulama veriyi `https://www.havameridyen.com/api/v1` üzerinden alır.

Web kodunda her değişiklikten sonra yine `npm run android` (ya da Android Studio açıksa `npx cap sync android` ve ▶ Run).
