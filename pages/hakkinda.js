import Link from "next/link";
import Layout from "../components/Layout";

const NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/modeller", label: "Modeller" },
  { href: "/favoriler", label: "Favoriler" },
];

const FOOTER = [
  { href: "/sss", label: "SSS" },
  { href: "/yasal", label: "Yasal" },
];

export default function Hakkinda() {
  return (
    <Layout title="Hakkında · Meridyen" variant="narrow" nav={NAV} footerLinks={FOOTER}>
      <Link className="back-link" href="/">
        ← Ana sayfaya dön
      </Link>

      <div className="kicker">Hakkında</div>
      <h1>Bağımsız bir model karşılaştırma aracı</h1>

      <div className="body-text">
        <p>
          Meridyen, Türkiye&apos;deki kullanıcılar için <strong>ECMWF, GFS, ICON, UKMO, ARPEGE, GEM, JMA ve KNMI</strong>{" "}
          olmak üzere dünyanın önde gelen sekiz sayısal hava tahmin modelini tek ekranda yan yana gösteren, bağımsız
          bir web uygulamasıdır.
        </p>
        <p>
          Fikir basit: hiçbir model her zaman &quot;en doğru&quot; değildir. Modeller bazen aynı şeyi söyler, bazen
          ayrışır — ve bu ayrışmanın kendisi de bir bilgidir. Meridyen bu farkı gizlemek yerine görünür kılmayı
          amaçlıyor, böylece kararı sana bırakıyor.
        </p>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">8</div>
          <div className="stat-label">karşılaştırılan model</div>
        </div>
        <div className="stat">
          <div className="stat-value">16</div>
          <div className="stat-label">gün ileri tahmin</div>
        </div>
        <div className="stat">
          <div className="stat-value">0</div>
          <div className="stat-label">hesap gerekliliği</div>
        </div>
      </div>

      <div className="panel panel-attr">
        <div className="p-label">Veri kaynağı</div>
        <p>
          Hava tahmin verileri{" "}
          <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
            Open-Meteo
          </a>{" "}
          tarafından <strong>CC BY 4.0</strong> lisansı altında sağlanmaktadır. Open-Meteo, ECMWF, NOAA, DWD,
          Environment Canada gibi ulusal meteoroloji servislerinin açık verilerini tek bir API&apos;de birleştirir.
          Meridyen bu veriyi işleyip görselleştirir; kendi ölçüm istasyonu veya model üretimi yoktur.
        </p>
      </div>

      <div className="panel panel-note">
        <div className="p-label">Netlik notu</div>
        <p>
          Meridyen, <strong>Meteoroloji Genel Müdürlüğü&apos;nün (MGM) resmi bir kanalı değildir.</strong> Bağımsız,
          kişisel bir projedir. Afet veya acil durum kararları için lütfen MGM&apos;nin resmi uyarılarını takip et.
        </p>
      </div>
    </Layout>
  );
}
