import Link from "next/link";
import Layout from "../components/Layout";

const NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/favoriler", label: "Favoriler" },
  { href: "/izmir", label: "İzmir" },
];

const MODELS = [
  {
    code: "ECMWF",
    flag: "AVRUPA",
    color: "#D98E2B",
    agency: "Avrupa Orta Vadeli Hava Tahminleri Merkezi",
    resolution: "~9 km",
    update: "Günde 2 kez",
    note: "Genellikle 3-7 gün arası orta vadeli tahminlerde en isabetli kabul edilir. Küresel modeller arasında referans noktası sayılır.",
  },
  {
    code: "GFS",
    flag: "ABD",
    color: "#1E7A6B",
    agency: "NOAA Küresel Tahmin Sistemi",
    resolution: "~28 km",
    update: "Günde 4 kez",
    note: "Sık güncellendiği için ani hava değişimlerine hızlı tepki verir. Kısa vadeli (1-3 gün) takipte pratik bir referans.",
  },
  {
    code: "ICON",
    flag: "ALMANYA",
    color: "#2C4A6E",
    agency: "Deutscher Wetterdienst küresel modeli",
    resolution: "~13 km",
    update: "Günde 4 kez",
    note: "Avrupa ve çevresinde yüksek çözünürlüklü bölgesel varyantlarıyla bilinir, yerel detayları daha net yakalar.",
  },
  {
    code: "GEM",
    flag: "KANADA",
    color: "#B4553B",
    agency: "Environment Canada küresel modeli",
    resolution: "~15 km",
    update: "Günde 2 kez",
    note: "Bağımsız bir veri asimilasyon sistemi kullanır — diğer üç modelden farklı bir \"ikinci görüş\" sağlar.",
  },
];

export default function Modeller() {
  return (
    <Layout title="Modeller — ECMWF, GFS, ICON, GEM · Meridyen" nav={NAV}>
      <div className="models-page">
        <Link className="back-link" href="/izmir">
          ← Şehir sayfasına dön
        </Link>

        <div className="page-head lead">
          <div className="kicker">Model rehberi</div>
          <h1>4 model, 4 farklı bakış açısı</h1>
          <p>
            Her hava tahmin merkezi kendi verisini, kendi fiziksel varsayımlarını ve kendi çözünürlüğünü kullanır. Bu
            yüzden aynı gün için farklı sonuçlar görebilirsin — hangisinin &quot;doğru&quot; olduğu değil, hangisinin
            senin durumun için daha güvenilir olduğu önemlidir.
          </p>
        </div>

        <div className="model-grid">
          {MODELS.map((m) => (
            <div key={m.code} className="model-card" style={{ "--m-color": m.color }}>
              <div className="model-top">
                <div className="model-code">{m.code}</div>
                <div className="model-flag">{m.flag}</div>
              </div>
              <div className="model-agency">{m.agency}</div>
              <div className="model-facts">
                <div>
                  <div className="fact-label">Çözünürlük</div>
                  <div className="fact-value">{m.resolution}</div>
                </div>
                <div>
                  <div className="fact-label">Güncelleme</div>
                  <div className="fact-value">{m.update}</div>
                </div>
              </div>
              <div className="model-note">{m.note}</div>
            </div>
          ))}
        </div>

        <div className="why-panel">
          <h2>Neden birden fazla model?</h2>
          <p>
            Her model, dünyanın atmosferini biraz farklı bir matematiksel yaklaşımla simüle eder: farklı başlangıç
            verisi, farklı çözünürlük, farklı fizik kuralları. Bu farklar özellikle 4 günden uzun vadeli tahminlerde
            belirginleşir.
          </p>
          <p>
            Modeller aynı şeyi söylüyorsa (yüksek uyum skoru), tahmine güvenmek daha kolaydır. Ayrışıyorlarsa, bu senin
            için de bir sinyaldir — hava durumu o gün için daha belirsiz demektir.
          </p>
        </div>
      </div>
    </Layout>
  );
}
