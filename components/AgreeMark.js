// Uyum işaretleri — ✓ hemfikir · ~ kısmen · ≠ ayrışıyor — SVG olarak çizilir.
// Sitenin fontlarında (IBM Plex Mono / Sans, Space Grotesk) ✓ ve ≠ karakterleri yok; metin olarak
// yazılınca tarayıcı başka bir fonttan alıyor ve özellikle küçük boyda, beyaz-kalın hâlde bozuk
// görünüyordu. Model seçimindeki işaret kutusu (ModelCheck) da aynı yaklaşımla çiziliyor.
//
// Kullanım:
//   HTML içinde:   <AgreeMark level="ok" />             → metin satırına hizalı, currentColor
//   SVG içinde:    <AgreeMark level="split" x={..} y={..} size={9} color="#fff" />
//                  (x/y verilince iç içe <svg> olarak konumlanır)

const VIEW = 12;

function Shape({ level }) {
  switch (level) {
    case "ok":
      return <path d="M2.4 6.4 L5 9 L9.6 3.4" />;
    case "partial":
      return <path d="M1.8 7.2 C3.1 4.6 4.7 4.6 6 6 C7.3 7.4 8.9 7.4 10.2 4.8" />;
    case "split":
      return (
        <>
          <path d="M2.2 4.6 H9.8" />
          <path d="M2.2 7.4 H9.8" />
          <path d="M8.2 2 L3.8 10" />
        </>
      );
    default:
      // "na" — veri yok
      return <circle cx="6" cy="6" r="1.2" style={{ fill: "currentColor", stroke: "none" }} />;
  }
}

export default function AgreeMark({ level, size = 11, color = "currentColor", x, y, strokeWidth = 1.7, title }) {
  const inSvg = x != null && y != null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      x={inSvg ? x : undefined}
      y={inSvg ? y : undefined}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      style={{
        color,
        fill: "none",
        stroke: "currentColor",
        strokeWidth,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        overflow: "visible",
        ...(inSvg ? {} : { display: "inline-block", verticalAlign: "-0.12em" }),
      }}
    >
      {title && <title>{title}</title>}
      <Shape level={level} />
    </svg>
  );
}
