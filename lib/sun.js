// Gün doğumu ve gün batımı (31 Ekim 2026, Ali Kemal: "hava kapalı değilken güneş veya ay görünsün; kışın gündüz
// 07–19, yazın 06–21 olabiliyor"): her nokta ve gün için hesaplanır, sunucuya ek istek gerekmez. NOAA'nın gün doğumu
// denklemi (Almanac for Computers, 1990; zenit 90° 50′ = kırılma + güneş yarıçapı); Türkiye enlemlerinde hata 1–2 dk.
// Saatler TSİ (UTC+3), ondalık saat (ör. 7.33 = 07:20). Kutup günü / gecesinde null.

const RAD = Math.PI / 180;
const TSI = 3;

function dayOfYear(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
}

function sunEvent(lat, lon, n, rise) {
  const lngHour = lon / 15;
  const t = n + ((rise ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * RAD)) / RAD;
  RA = ((RA % 360) + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rise ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = (((T - lngHour) % 24) + 24) % 24;
  return (((UT + TSI) % 24) + 24) % 24;
}

// { rise, set } TSİ ondalık saat ya da null. date: "YYYY-MM-DD"
export function sunTimes(lat, lon, date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || "");
  if (!m || lat == null || lon == null) return null;
  const n = dayOfYear(+m[1], +m[2], +m[3]);
  const rise = sunEvent(lat, lon, n, true);
  const set = sunEvent(lat, lon, n, false);
  return rise == null || set == null ? null : { rise, set };
}

// Saatin (h:00) aydınlık olup olmadığı: gün doğumundan yarım saat önce ile gün batımından yarım saat sonrası arası
// (alacakaranlık payı). sun yoksa eski sabit kural (06:00–19:59).
export function isDayHour(h, sun) {
  if (!sun) return h >= 6 && h < 20;
  return h >= sun.rise - 0.5 && h < sun.set + 0.5;
}

// Gökyüzü evresi (uygulama ve widget zemin rengi): day · dawn (doğumdan sonraki ilk saat) · dusk (batımdan önceki
// saat) · night. sun yoksa eski sabit kural (08–17 gündüz, 06–07 şafak, 18–19 akşam).
export function skyPhase(h, sun) {
  if (!sun) return h >= 8 && h <= 17 ? "day" : h === 6 || h === 7 ? "dawn" : h === 18 || h === 19 ? "dusk" : "night";
  if (!isDayHour(h, sun)) return "night";
  if (h < sun.rise + 1) return "dawn";
  if (h >= sun.set - 1) return "dusk";
  return "day";
}
