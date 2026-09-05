import Link from "next/link";
import Layout from "../components/Layout";

const NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/modeller", label: "Modeller" },
  { href: "/hakkinda", label: "Hakkında" },
];

const FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/yasal", label: "Yasal" },
];

const FAQS = [
  {
    num: "01",
    q: "Hangi model en doğru?",
    a: 'Kesin bir "en doğru" model yok. ECMWF genelde 3-7 gün arası orta vadede güçlü kabul edilir, GFS sık güncellendiği için kısa vadede hızlı tepki verir, ICON Avrupa\'da yüksek çözünürlük sunar. Her modelin güçlü olduğu koşullar farklıdır — bu yüzden karşılaştırma yapıyoruz.',
    open: true,
  },
  {
    num: "02",
    q: "Veriler ne sıklıkla güncelleniyor?",
    a: "Modelden modele değişir: GFS ve ICON günde 4 kez, ECMWF ve GEM günde 2 kez güncellenir. havameridyen bu güncellemeleri Open-Meteo üzerinden otomatik olarak yansıtır.",
  },
  {
    num: "03",
    q: "Bu MGM'nin resmi sitesi mi?",
    a: "Hayır. havameridyen bağımsız, kişisel bir karşılaştırma aracıdır — Meteoroloji Genel Müdürlüğü ile bir bağlantısı yoktur. Afet veya acil durum kararları için lütfen MGM'nin resmi uyarılarını takip et.",
  },
  {
    num: "04",
    q: "Favorilerim nerede saklanıyor?",
    a: "Yalnızca kendi cihazında, tarayıcının yerel deposunda (localStorage) saklanır. Hesap oluşturmana gerek yok, hiçbir veri sunucuya gönderilmez. Tarayıcı verilerini temizlersen favorilerin de silinir.",
  },
];

export default function SSS() {
  return (
    <Layout title="Sık sorulan sorular · havameridyen" variant="narrow" nav={NAV} footerLinks={FOOTER}>
      <Link className="back-link" href="/">
        ← Ana sayfaya dön
      </Link>

      <div className="kicker">Destek</div>
      <h1>Sık sorulan sorular</h1>

      <div className="faq-list">
        {FAQS.map((item) => (
          <details key={item.num} className="faq-item" defaultOpen={!!item.open}>
            <summary className="faq-q">
              <span className="faq-num">{item.num}</span>
              <span className="faq-q-text">{item.q}</span>
              <span className="faq-icon">+</span>
            </summary>
            <div className="faq-a">{item.a}</div>
          </details>
        ))}
      </div>
    </Layout>
  );
}
