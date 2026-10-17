// Hava durumu ikonları (Paket 4, Ekim 2026) — Hava durumu matrisi ve Model detayları tablosu kullanır.
// Durum ifadesinin kuralları (yağış / sağanak / bulut sınıfı, dilimde en belirgin durum, uyum) sunucu
// madde 2a'dan beri lib/agreement.js içinde: condAt, slotCond, weatherAgreement.

// --- ikonlar (36 × 36) ---
function Cloud({ dark }) {
  const c = dark ? ["#7F8C97", "#A9B4BD", "#B9C3CB", "#98A4AE"] : ["#B7C2CC", "#E6EBEF", "#EEF2F5", "#D3DBE1"];
  return (
    <>
      <ellipse cx="13" cy="20" rx="7.5" ry="5.8" fill={c[0]} />
      <rect x="12" y="17" width="18" height="8" rx="4" fill={c[1]} />
      <ellipse cx="21" cy="15" rx="9.5" ry="7.5" fill={c[2]} />
      <ellipse cx="28" cy="19.5" rx="6.5" ry="5.2" fill={c[3]} />
    </>
  );
}

function Sun() {
  return (
    <>
      <circle cx="18" cy="18" r="7" fill="#F2B640" />
      <g stroke="#F2B640" strokeWidth="2" strokeLinecap="round">
        <path d="M18 5v3M18 28v3M5 18h3M28 18h3M8.8 8.8l2.1 2.1M25.1 25.1l2.1 2.1M8.8 27.2l2.1-2.1M25.1 10.9l2.1-2.1" />
      </g>
    </>
  );
}

function Moon() {
  return <path d="M22 6a11 11 0 1 0 8 18 9.5 9.5 0 0 1-8-18z" fill="#8FA3BF" />;
}

const DROP_LINES = [
  [12, 27, 10, 33],
  [19, 27, 17, 33],
  [26, 27, 24, 33],
  [15, 30, 13, 35],
];

function Drops({ n }) {
  return DROP_LINES.slice(0, n).map((p) => (
    <line key={p.join()} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke="#3B6FB6" strokeWidth="2" strokeLinecap="round" />
  ));
}

function IconBody({ ic }) {
  switch (ic) {
    case "clear":
      return <Sun />;
    case "clearN":
      return <Moon />;
    case "few":
    case "fewN":
      return (
        <>
          <g transform={ic === "few" ? "translate(-5,-5) scale(.85)" : "translate(-4,-4) scale(.8)"}>{ic === "few" ? <Sun /> : <Moon />}</g>
          <g transform="translate(6,8) scale(.75)">
            <Cloud />
          </g>
        </>
      );
    case "part":
    case "partN":
      return (
        <>
          <g transform={ic === "part" ? "translate(-3,-5) scale(.8)" : "translate(-2,-4) scale(.75)"}>{ic === "part" ? <Sun /> : <Moon />}</g>
          <g transform="translate(1,4)">
            <Cloud />
          </g>
        </>
      );
    case "cloud":
      return (
        <g transform="translate(0,1)">
          <Cloud />
        </g>
      );
    case "over":
      return (
        <>
          <g transform="translate(-3,-3) scale(.9)" opacity=".9">
            <Cloud dark />
          </g>
          <g transform="translate(2,3)">
            <Cloud dark />
          </g>
        </>
      );
    case "rain":
      return (
        <>
          <g transform="translate(0,-3)">
            <Cloud />
          </g>
          <Drops n={3} />
        </>
      );
    case "shower":
      return (
        <>
          <g transform="translate(0,-3)">
            <Cloud dark />
          </g>
          <Drops n={4} />
        </>
      );
    case "storm":
      return (
        <>
          <g transform="translate(0,-3)">
            <Cloud dark />
          </g>
          <line x1="11" y1="27" x2="9" y2="33" stroke="#3B6FB6" strokeWidth="2" strokeLinecap="round" />
          <line x1="27" y1="27" x2="25" y2="33" stroke="#3B6FB6" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 22l-5 7h4l-3 6 8-9h-4.5z" fill="#F2B640" />
        </>
      );
    default:
      return null;
  }
}

// HTML içinde: <WxIcon ic="rain" size={22} /> · SVG içinde: <WxIcon ic="rain" size={26} x={..} y={..} />
export function WxIcon({ ic, size = 22, x, y }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" x={x} y={y} aria-hidden="true" style={x == null ? { flexShrink: 0 } : undefined}>
      <IconBody ic={ic} />
    </svg>
  );
}

export const WX_KEY = [
  ["clear", "Açık"],
  ["few", "Az Bulutlu"],
  ["part", "Parçalı Bulutlu"],
  ["cloud", "Çok Bulutlu"],
  ["over", "Kapalı"],
  ["rain", "Yağmurlu"],
  ["shower", "Sağanak Yağışlı"],
  ["storm", "Gök Gürültülü Sağanak"],
];
