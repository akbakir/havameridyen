// Hava durumu ikonları — Hava durumu matrisi, Model detayları tablosu ve favori kartları kullanır. Durum ifadesinin
// kuralları (yağış / sağanak yağış / kar / bulut sınıfı, dilimde en belirgin durum, uyum) lib/agreement.js içinde.
// Çizimler 26 Ekim'den beri lib/wxicons.js'te: site, uygulama ve widget'lar aynı ikonları kullanır; damla ve kar
// tanelerinin hareketi styles/globals.css (.wx-dr, .wx-sh, .wx-fl).

import { wxBody } from "../lib/wxicons";

// HTML içinde: <WxIcon ic="rain" size={22} /> · SVG içinde: <WxIcon ic="rain" size={26} x={..} y={..} />
export function WxIcon({ ic, size = 22, x, y }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      x={x}
      y={y}
      className="wx"
      aria-hidden="true"
      style={x == null ? { flexShrink: 0 } : undefined}
      dangerouslySetInnerHTML={{ __html: wxBody(ic) }}
    />
  );
}

// Anahtar: 8 Kas 2026'dan beri yağışlı ikonlar 4 şiddet kademeli (< 1 · hafif · normal · kuvvetli; SSS 10). Açıklamada
// hafif, normal ve kuvvetli gösterilir (< 1 hafifle aynı ifade, bir öğe eksik).
export const WX_KEY = [
  ["clear", "Açık"],
  ["few", "Az Bulutlu"],
  ["part", "Parçalı Bulutlu"],
  ["cloud", "Çok Bulutlu"],
  ["over", "Kapalı"],
  ["rainL", "Hafif Yağmurlu"],
  ["rain", "Yağmurlu"],
  ["rainH", "Kuvvetli Yağmurlu"],
  ["showerL", "Hafif Sağanak Yağış"],
  ["shower", "Sağanak Yağış"],
  ["showerH", "Kuvvetli Sağanak Yağış"],
  ["storm", "Gök Gürültülü Sağanak Yağış"],
  ["stormH", "Kuvvetli Gök Gürültülü Sağanak Yağış"],
];

// Kar ikonları açıklamada yalnız gösterilen dönemde en az bir modelde kar ifadesi varsa görünür
// Sis ve pus ikonları (30 Ekim) açıklamada yalnız gösterilen dönemde en az bir modelde görünüyorsa
export const WX_KEY_OBS = [
  ["fog", "Sisli (görüş ≤ 1 km)"],
  ["haze", "Puslu (1–5 km)"],
  ["hazeC", "Puslu, kapalı"],
];

export const WX_KEY_SNOW = [
  ["snowL", "Hafif Kar"],
  ["snow", "Kar Yağışlı"],
  ["snowH", "Yoğun Kar Yağışlı"],
  ["snowshowerL", "Hafif Kar Sağanağı"],
  ["snowshower", "Kar Sağanağı"],
  ["snowshowerH", "Kuvvetli Kar Sağanağı"],
  ["snowstorm", "Gök Gürültülü Kar Sağanağı"],
  ["snowstormH", "Kuvvetli Gök Gürültülü Kar Sağanağı"],
];
