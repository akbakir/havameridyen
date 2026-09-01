import Head from "next/head";
import Link from "next/link";

const DEFAULT_NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/modeller", label: "Modeller" },
  { href: "/favoriler", label: "Favoriler" },
];

const DEFAULT_FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/sss", label: "SSS" },
  { href: "/yasal", label: "Yasal" },
];

function Isobars() {
  return (
    <div className="isobars" aria-hidden="true">
      <svg viewBox="0 0 1400 640" preserveAspectRatio="none">
        <g className="iso-group">
          <path className="iso-line" d="M0,80 C200,40 400,120 600,80 S1000,40 1200,80 S1600,120 1800,80" />
          <path className="iso-line" d="M0,150 C200,190 400,110 600,150 S1000,190 1200,150 S1600,110 1800,150" />
          <path className="iso-line" d="M0,220 C200,180 400,260 600,220 S1000,180 1200,220 S1600,260 1800,220" />
        </g>
        <g className="iso-group slow">
          <path className="iso-line" d="M0,340 C220,300 420,380 620,340 S1020,300 1220,340 S1620,380 1820,340" />
          <path className="iso-line" d="M0,410 C220,450 420,370 620,410 S1020,450 1220,410 S1620,370 1820,410" />
        </g>
      </svg>
    </div>
  );
}

export default function Layout({ title, variant = "default", nav = DEFAULT_NAV, footerLinks = DEFAULT_FOOTER, children }) {
  const wrapClass = [
    "wrap",
    variant === "home" && "wrap-home",
    variant === "narrow" && "wrap-narrow",
    variant === "city" && "city-page",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      {variant === "home" && <Isobars />}
      <div className={wrapClass}>
        <header>
          <Link href="/" className="brand">
            <span className="brand-hava">hava</span><span className="brand-meridyen">meridyen</span>
          </Link>
          <nav>
            {nav.map((item) => (
              <Link key={item.href + item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
        <footer>
          <div className="foot-row">
            <div className="foot-attr">
              VERİ KAYNAĞI:{" "}
              <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
                OPEN-METEO
              </a>{" "}
              (CC BY 4.0)
            </div>
            <div className="foot-links">
              {footerLinks.map((item) => (
                <Link key={item.href + item.label} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
