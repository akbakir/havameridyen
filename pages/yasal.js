import Link from "next/link";
import Layout from "../components/Layout";

const NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/sss", label: "SSS" },
];

const FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/sss", label: "SSS" },
];

const TOC = [
  { href: "#gizlilik", label: "1. Gizlilik politikası" },
  { href: "#kullanim-sartlari", label: "2. Kullanım şartları" },
  { href: "#iletisim", label: "3. İletişim" },
];

export default function Yasal() {
  return (
    <Layout title="Yasal · Meridyen" variant="narrow" nav={NAV} footerLinks={FOOTER}>
      <Link className="back-link" href="/">
        ← Ana sayfaya dön
      </Link>

      <div className="kicker">Yasal</div>
      <h1>Gizlilik politikası ve kullanım şartları</h1>

      <div className="legal-meta">Son güncelleme: 31.08.2026</div>

      <nav className="legal-toc" aria-label="Sayfa içeriği">
        {TOC.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="legal-body">
        <section id="gizlilik">
          <h2>1. Gizlilik politikası</h2>
          <p>
            Meridyen&apos;in kısa özeti: <strong>hesap yok, takip yok, reklam yok.</strong> Siteyi kullanmak için
            kimlik bilgisi vermen gerekmiyor ve senden kişisel veri toplamıyoruz.
          </p>

          <h3>1.1 Cihazında saklanan veriler</h3>
          <p>
            Favori şehirlerin yalnızca kendi tarayıcının yerel deposunda (<code>localStorage</code>) tutulur. Bu veri
            hiçbir zaman sunucuya gönderilmez, başka bir cihazla eşitlenmez ve bizim tarafımızdan okunamaz. Tarayıcı
            verilerini temizlediğinde favorilerin de silinir.
          </p>

          <h3>1.2 Analitik ve çerezler</h3>
          <p>
            Sitede <strong>analitik aracı, reklam pikseli veya izleme çerezi bulunmuyor.</strong> Ziyaretini profilleyen
            hiçbir üçüncü taraf betiği yüklenmiyor. Bu durum ileride değişirse bu bölüm ve yukarıdaki
            &quot;Son güncelleme&quot; tarihi yenilenecek.
          </p>

          <h3>1.3 Konum bilgisi</h3>
          <p>
            Meridyen tarayıcının <strong>konum iznini istemez</strong>; nerede olduğunu otomatik olarak tespit etmeye
            çalışmaz. Şehir aradığında yazdığın metin, sonuçları getirmek için Open-Meteo&apos;nun geocoding
            servisine iletilir. Baktığın şehrin koordinatları tahmin verisini çekmek için kullanılır ve sunucu
            tarafında yalnızca geçici önbellekte, kimliğinle ilişkilendirilmeden bir saat süreyle tutulur.
          </p>

          <h3>1.4 Üçüncü taraf servisler</h3>
          <p>
            Sayfalar açılırken hava tahmini ve konum verisi için <strong>Open-Meteo</strong>, yazı tipleri için
            <strong> Google Fonts</strong> kullanılır. Bu servisler kendi altyapılarında teknik istek kayıtları
            (IP adresi gibi) tutabilir; söz konusu kayıtlar üzerinde bizim bir kontrolümüz veya erişimimiz yoktur.
            Siteyi barındıran sağlayıcı da standart sunucu günlükleri tutabilir.
          </p>

          <h3>1.5 Verilerini silmek</h3>
          <p>
            Silinecek bir hesabın yok. Meridyen&apos;in cihazında bıraktığı her şeyi tarayıcının site verilerini
            temizleyerek kaldırabilirsin; bu işlem favori listeni de sıfırlar.
          </p>
        </section>

        <section id="kullanim-sartlari">
          <h2>2. Kullanım şartları</h2>
          <p>
            Meridyen&apos;i kullanarak aşağıdaki koşulları kabul etmiş olursun. Katılmıyorsan lütfen siteyi kullanma.
          </p>

          <h3>2.1 Hizmetin niteliği</h3>
          <p>
            Meridyen, açık kaynaklardan gelen sayısal hava tahmin modeli çıktılarını karşılaştırmalı olarak gösteren,
            bağımsız ve kişisel bir projedir. Hizmet &quot;olduğu gibi&quot; sunulur; kesintisiz çalışacağı, her zaman
            güncel olacağı veya herhangi bir amaca uygunluğu garanti edilmez.
          </p>

          <div className="panel panel-note">
            <div className="p-label">Önemli uyarı</div>
            <p>
              Meridyen, <strong>Meteoroloji Genel Müdürlüğü&apos;nün (MGM) resmi bir kanalı değildir</strong> ve resmi
              hava durumu uyarısı yayınlamaz. Buradaki tahminler bilgilendirme amaçlıdır; can güvenliği, afet, tarım,
              denizcilik, havacılık gibi kritik kararlarda tek başına kullanılmamalıdır. Böyle durumlarda MGM&apos;nin
              resmi uyarılarını esas al. Sitedeki bilgilere dayanarak aldığın kararların sonuçlarından Meridyen
              sorumlu tutulamaz.
            </p>
          </div>

          <h3>2.2 Telif ve içerik kullanımı</h3>
          <p>
            Sitedeki arayüz tasarımı ve metinler proje sahibine aittir. Model verilerinin lisansı ise kaynağına
            tabidir.
          </p>

          <div className="panel panel-attr">
            <div className="p-label">Veri kaynağı</div>
            <p>
              Hava tahmin verileri{" "}
              <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
                Open-Meteo
              </a>{" "}
              tarafından <strong>CC BY 4.0</strong> lisansı altında sağlanmaktadır. Veriyi başka bir yerde
              kullanırsan aynı atfı yapman gerekir. Meridyen&apos;in kendi ölçüm istasyonu veya model üretimi yoktur;
              yalnızca bu açık veriyi işler ve görselleştirir.
            </p>
          </div>

          <h3>2.3 Kabul edilebilir kullanım</h3>
          <p>
            Siteyi ve API uç noktalarını otomatik araçlarla aşırı yükleyecek, servisi kesintiye uğratacak ya da
            Open-Meteo&apos;nun kullanım koşullarını ihlal edecek biçimde kullanma. Makul olmayan trafik kaynaklı
            erişim kısıtlamaları uygulanabilir.
          </p>

          <h3>2.4 Değişiklikler</h3>
          <p>
            Bu metin zaman içinde güncellenebilir. Güncel sürüm her zaman bu sayfada yayınlanır ve yukarıdaki
            &quot;Son güncelleme&quot; tarihi buna göre değişir.
          </p>
        </section>

        <section id="iletisim">
          <h2>3. İletişim</h2>
          <p>
            Gizlilik, veri kullanımı veya sitedeki bir hata hakkında sorun varsa{" "}
            <a href="mailto:akbakir@gmail.com">akbakir@gmail.com</a> adresine yazabilirsin.
          </p>
          <p>
            Yanlış görünen bir tahmin, kırık bir sayfa ya da öneri bildirmek istersen aynı adres geçerli:{" "}
            <a href="mailto:akbakir@gmail.com?subject=Meridyen%20geri%20bildirim">akbakir@gmail.com</a>.
          </p>
        </section>
      </div>
    </Layout>
  );
}
