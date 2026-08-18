# Meridyen — çoklu model hava tahmin platformu

Türkiye odaklı, birden fazla sayısal hava tahmin modelini (ECMWF, GFS, ICON, GEM)
tek ekranda karşılaştıran web uygulaması. Veri kaynağı: [Open-Meteo](https://open-meteo.com).

## Mimari

- **Frontend:** Next.js (React) — `pages/index.js`
- **Backend:** Next.js API routes — `pages/api/forecast.js`, `pages/api/locations.js`
- **Cache:** In-memory, 1 saatlik TTL (`lib/forecast.js`) — API kotasını korur, tekrar
  eden istekleri hızlandırır. İleride ölçeklenince Redis'e taşınabilir; sadece
  `lib/forecast.js` içindeki `cache` nesnesi değişir, geri kalan kod aynı kalır.

## Kurulum

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:3000` adresini aç.

## API sözleşmesi

`GET /api/forecast?lat=38.42&lon=27.14&period=3d&name=İzmir`

```json
{
  "location": { "name": "İzmir", "lat": 38.42, "lon": 27.14 },
  "period": "3d",
  "generated_at": "2026-08-17T12:00:00.000Z",
  "cached": false,
  "models": [
    { "id": "ecmwf_ifs025", "label": "ECMWF", "color": "#D98E2B", "dashed": false,
      "series": [{ "time": "2026-08-17T15:00", "temp": 27.3, "precip_prob": 20,
        "precip_amount": 0.4, "wind_speed": 18.2, "wind_direction": 270 }] }
  ],
  "agreement": { "metric": "precip_24h", "agree_count": 3, "total_count": 4, "agree_pct": 75 }
}
```

`period` değerleri: `hourly` (2 gün, saatlik), `3d`, `7d`, `16d`.

`GET /api/locations?q=izmir` — konum arama (geocoding proxy).

## Sıradaki adımlar

- [ ] Favori lokasyonlar (localStorage → sonra kullanıcı hesabıyla senkron)
- [ ] Vercel'e deploy (ücretsiz tier yeterli)
- [ ] Cache'i Redis'e taşımak (trafik artınca)
- [ ] Mobil uygulama: bu API route'ları aynen React Native'den de tüketilebilir
