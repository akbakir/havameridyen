import Link from "next/link";
import Layout from "../components/Layout";

const NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/modeller", label: "Modeller" },
  { href: "/favoriler", label: "Favoriler" },
];

const FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/sss", label: "SSS" },
];

const MODEL_KAYNAKLARI = [
  { model: "ECMWF", kurum: "Avrupa Orta Vadeli Hava Tahminleri Merkezi" },
  { model: "GFS", kurum: "NOAA / NCEP (ABD)" },
  { model: "ICON", kurum: "Deutscher Wetterdienst (Almanya)" },
  { model: "UKMO", kurum: "UK Met Office (Birleşik Krallık)" },
  { model: "ARPEGE", kurum: "Météo-France (Fransa)" },
  { model: "GEM", kurum: "Environment and Climate Change Canada" },
  { model: "JMA", kurum: "Japon Meteoroloji Ajansı" },
  { model: "KNMI", kurum: "Kraliyet Hollanda Meteoroloji Enstitüsü" },
];

export default function Yasal() {
  return (
    <Layout title="Yasal · havameridyen" variant="narrow" nav={NAV} footerLinks={FOOTER}>
      <Link className="back-link" href="/">
        ← Ana sayfaya dön
      </Link>

      <div className="kicker">Yasal</div>
      <h1>Gizlilik Politikası ve Kullanım Şartları</h1>
      <div className="legal-meta">Son güncelleme: 30 Ağustos 2026</div>

      <div className="legal-section">
        <h2>1. Gizlilik Politikası</h2>

        <h3>1.1 Veri Sorumlusu</h3>
        <p>
          Bu web sitesi (&quot;havameridyen.com&quot;) A. Kemal BAKIR tarafından işletilmektedir. 6698 sayılı Kişisel
          Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında veri sorumlusu sıfatıyla hareket edilmektedir.
        </p>
        <p>İletişim: akbakir@gmail.com</p>

        <h3>1.2 Toplanan Veriler</h3>
        <p>havameridyen, mümkün olduğunca az kişisel veri toplama ilkesiyle tasarlanmıştır:</p>
        <ul>
          <li>
            <strong>Konum/şehir arama verisi:</strong> Sitede arama yaptığında girdiğin şehir/konum bilgisi sunucuya
            iletilir, ancak kalıcı olarak saklanmaz veya kullanıcı profiliyle ilişkilendirilmez.
          </li>
          <li>
            <strong>Favoriler:</strong> Favori şehirlerin yalnızca kendi tarayıcının yerel depolama alanında
            (localStorage) tutulur; bu veri sunucularımıza hiç gönderilmez ve tarayıcından silindiğinde kaybolur.
          </li>
          <li>
            <strong>Teknik günlükler:</strong> Barındırma sağlayıcımız (Vercel), standart sunucu günlükleri (IP
            adresi, tarayıcı bilgisi, erişim zamanı) tutabilir. Bu veriler güvenlik ve performans izleme amaçlıdır,
            pazarlama amacıyla kullanılmaz.
          </li>
          <li>
            <strong>Çerezler:</strong> Şu an sitede takip amaçlı çerez veya üçüncü taraf analytics bulunmamaktadır. Bu
            politika, ileride bir analytics aracı eklenirse güncellenecektir.
          </li>
        </ul>

        <h3>1.3 Verilerin İşlenme Amacı</h3>
        <p>
          Toplanan sınırlı veriler yalnızca: (i) hava durumu tahminini görüntülemek, (ii) sitenin teknik olarak
          çalışmasını sağlamak ve (iii) kötüye kullanımı/güvenlik risklerini önlemek amacıyla işlenir. Hiçbir veri
          üçüncü taraflara satılmaz veya pazarlama amacıyla paylaşılmaz.
        </p>

        <h3>1.4 Üçüncü Taraf Veri Kaynakları ve Atıf</h3>
        <p>
          havameridyen&apos;deki tüm hava tahmin verileri{" "}
          <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
            Open-Meteo
          </a>{" "}
          açık API&apos;si üzerinden sağlanmaktadır. Open-Meteo verileri <strong>Creative Commons Attribution 4.0
          International (CC BY 4.0)</strong> lisansı altında sunulmaktadır.
        </p>
        <p>Gösterilen tahminler, aşağıdaki ulusal ve uluslararası meteoroloji kurumlarının sayısal hava tahmin modellerinden türetilmektedir:</p>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Kurum</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_KAYNAKLARI.map((m) => (
              <tr key={m.model}>
                <td>{m.model}</td>
                <td>{m.kurum}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          havameridyen bu kurumların hiçbiriyle resmi olarak bağlantılı değildir; yalnızca kamuya açık model
          çıktılarını Open-Meteo aracılığıyla görselleştirmektedir.
        </p>

        <h3>1.5 Ticari Kullanım ve Sorumluluk Reddi</h3>
        <ul>
          <li>
            havameridyen&apos;de sunulan tahminler <strong>yalnızca bilgilendirme amaçlıdır</strong>. Resmi ve
            bağlayıcı hava tahmini için Türkiye&apos;de <strong>Meteoroloji Genel Müdürlüğü (MGM)</strong> tek yetkili
            kurumdur.
          </li>
          <li>
            Sayısal hava tahmin modelleri doğası gereği belirsizlik içerir; havameridyen modeller arasındaki farkı
            göstermeyi amaçlar, &quot;en doğru&quot; tahmini garanti etmez.
          </li>
          <li>
            havameridyen, tahminlere dayanılarak alınan kararlardan (seyahat, tarım, etkinlik planlama vb.)
            doğabilecek doğrudan veya dolaylı zararlardan sorumlu tutulamaz.
          </li>
          <li>Site şu an ücretsiz ve reklamsız bir kişisel/bağımsız projedir; ticari bir garantisi yoktur.</li>
        </ul>

        <h3>1.6 Çocukların Gizliliği</h3>
        <p>
          havameridyen genel halka yönelik bir hizmettir ve bilerek 13 yaşından küçük çocuklardan kişisel veri
          toplamamaktadır. Sitenin işlevi (hava durumu arama) doğası gereği yaş doğrulaması veya hesap oluşturma
          gerektirmez.
        </p>

        <h3>1.7 Kullanıcı Hakları (KVKK Madde 11)</h3>
        <p>
          KVKK&apos;nın 11. maddesi uyarınca, kişisel verilerinin işlenip işlenmediğini öğrenme, işlenmişse buna
          ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt
          içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme ve
          ilgili mevzuat çerçevesinde silinmesini isteme haklarına sahipsin. Taleplerini akbakir@gmail.com adresine
          iletebilirsin.
        </p>

        <h3>1.8 Politikadaki Değişiklikler</h3>
        <p>
          Bu politika zaman zaman güncellenebilir. Önemli değişikliklerde bu sayfadaki &quot;son güncelleme&quot;
          tarihi güncellenecektir.
        </p>
      </div>

      <div className="legal-section">
        <h2>2. Kullanım Şartları</h2>

        <h3>2.1 Kabul</h3>
        <p>
          havameridyen&apos;i (&quot;Site&quot;) kullanarak bu kullanım şartlarını kabul etmiş sayılırsın. Kabul
          etmiyorsan Site&apos;yi kullanmamanı rica ederiz.
        </p>

        <h3>2.2 Hizmetin Tanımı</h3>
        <p>
          havameridyen, Türkiye&apos;deki kullanıcılar için birden fazla küresel sayısal hava tahmin modelini
          (ECMWF, GFS, ICON, UKMO, ARPEGE, GEM, JMA, KNMI) tek ekranda karşılaştırmalı olarak sunan bağımsız, ücretsiz
          bir web uygulamasıdır.
        </p>

        <h3>2.3 Fikri Mülkiyet</h3>
        <ul>
          <li>Site&apos;nin tasarımı, arayüzü ve özgün metin içerikleri havameridyen&apos;e aittir.</li>
          <li>
            Hava tahmin verileri Open-Meteo ve yukarıda listelenen meteoroloji kurumlarına aittir; bu veriler CC BY
            4.0 lisansı şartlarına tabidir.
          </li>
          <li>İçeriğin ticari amaçla, atıf yapılmadan kopyalanması veya yeniden dağıtılması izin verilmez.</li>
        </ul>

        <h3>2.4 Kullanım Koşulları</h3>
        <p>Site&apos;yi kullanırken:</p>
        <ul>
          <li>Otomatik veri çekme (scraping), aşırı yük bindirme veya hizmeti kesintiye uğratacak faaliyetlerden kaçınman,</li>
          <li>Site&apos;yi yasa dışı bir amaçla kullanmaman</li>
        </ul>
        <p>beklenir.</p>

        <h3>2.5 Hizmetin Sürekliliği</h3>
        <p>
          havameridyen, Site&apos;yi önceden bildirimde bulunmaksızın değiştirme, geçici veya kalıcı olarak durdurma
          hakkını saklı tutar. Hizmetin kesintisiz veya hatasız çalışacağı garanti edilmez.
        </p>

        <h3>2.6 Sorumluluğun Sınırlandırılması</h3>
        <p>
          havameridyen ve işletmecisi, Site&apos;nin kullanımından veya kullanılamamasından, sunulan tahminlerin
          doğruluğundan/güncelliğinden kaynaklanan hiçbir doğrudan, dolaylı, arızi veya sonuç niteliğindeki zarardan
          sorumlu tutulamaz.
        </p>

        <h3>2.7 Uygulanacak Hukuk ve Yetkili Mahkeme</h3>
        <p>
          Bu kullanım şartları Türkiye Cumhuriyeti kanunlarına tabidir. Doğabilecek uyuşmazlıklarda İstanbul
          (Anadolu) Adliyesi Mahkemeleri ve İcra Daireleri yetkilidir.
        </p>

        <h3>2.8 İletişim</h3>
        <p>Sorularınız için: akbakir@gmail.com</p>
      </div>
    </Layout>
  );
}
