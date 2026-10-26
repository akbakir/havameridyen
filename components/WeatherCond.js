// Hava durumu ikonları — Hava durumu matrisi, Model detayları tablosu ve favori kartları kullanır. Durum ifadesinin
// kuralları (yağış / sağanak yağış / kar / bulut sınıfı, dilimde en belirgin durum, uyum) lib/agreement.js içinde.
// Çizimler 26 Ekim'den beri lib/wxicons.js'te: site, uygulama ve widget'lar aynı 16 ikonu kullanır; damla ve kar
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

export const WX_KEY = [
  ["clear", "Açık"],
  ["few", "Az Bulutlu"],
  ["part", "Parçalı Bulutlu"],
  ["cloud", "Çok Bulutlu"],
  ["over", "Kapalı"],
  ["rain", "Yağmurlu"],
  ["shower", "Sağanak Yağış"],
  ["storm", "Gök Gürültülü Sağanak Yağış"],
];

// Kar ikonları açıklamada yalnız gösterilen dönemde en az bir modelde kar ifadesi varsa görünür
export const WX_KEY_SNOW = [
  ["snow", "Kar Yağışlı"],
  ["snowshower", "Kar Sağanağı"],
  ["snowstorm", "Gök Gürültülü Kar Sağanağı"],
];
