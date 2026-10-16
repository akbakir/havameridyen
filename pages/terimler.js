import Link from "next/link";
import Layout from "../components/Layout";
import { TERMS } from "../lib/terms";

// Terimler sayfası (Paket 5, Ekim 2026) — metinler lib/terms.js'ten, mobil uygulamadaki Terimler ile aynı.
// Her terimin çapası var (/terimler#cape gibi); grafiklerin altındaki "… nedir?" bağlantıları buraya gelir.

const FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/sss", label: "SSS" },
  { href: "/yasal", label: "Yasal" },
];

// Metindeki <b>…</b> parçalarını kalın yazar; başka biçim yok.
function Rich({ text }) {
  return text.split(/<b>(.*?)<\/b>/).map((part, k) => (k % 2 ? <b key={k}>{part}</b> : part));
}

export default function Terimler() {
  return (
    <Layout title="Terimler · havameridyen" variant="narrow" footerLinks={FOOTER}>
      <Link className="back-link" href="/">
        ← Ana sayfaya dön
      </Link>

      <div className="kicker">Destek</div>
      <h1>Terimler</h1>
      <p className="terms-intro">
        Grafiklerde ve tabloda geçen kavramlar: ne anlama geldikleri ve havameridyen&apos;de nasıl kullanıldıkları.
      </p>

      <nav className="terms-toc" aria-label="Terimler">
        {TERMS.map(([id, title]) => (
          <a key={id} href={`#${id}`}>
            {title.split(" (")[0]}
          </a>
        ))}
      </nav>

      <div className="terms">
        {TERMS.map(([id, title, sub, desc, ours]) => (
          <section key={id} className="term" id={id}>
            <h2>{title}</h2>
            {sub && <div className="term-sub">{sub}</div>}
            <p>
              <Rich text={desc} />
            </p>
            {ours && (
              <div className="term-ours">
                <Rich text={ours} />
              </div>
            )}
          </section>
        ))}
      </div>
    </Layout>
  );
}
