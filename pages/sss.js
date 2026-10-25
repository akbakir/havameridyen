import Link from "next/link";
import Layout from "../components/Layout";
import AgreeMark from "../components/AgreeMark";

const FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/terimler", label: "Terimler" },
  { href: "/yasal", label: "Yasal" },
];

// SSS cevaplarında kullanılan küçük tablo stilleri (globals.css'e dokunmamak için satır içi).
const FAQ_TH = { textAlign: "left", fontWeight: 600, color: "var(--ink)", padding: "6px 10px 6px 0", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const FAQ_TD = { padding: "6px 10px 6px 0", borderBottom: "1px solid var(--line)", verticalAlign: "top" };

// Uyum eşikleri — grafiklerdeki LINE_CHARTS ayarlarıyla aynı değerler (components/LineChartPanel.js).
const AGREE_ROWS = [
  ["Sıcaklık", "< 2 °C", "2–4 °C", "> 4 °C"],
  ["Nem", "< %10", "%10–20", "> %20"],
  ["Basınç", "< 2 hPa", "2–4 hPa", "> 4 hPa"],
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
    q: "Modeller arasındaki uyum nasıl hesaplanıyor?",
    a: (
      <>
        <p style={{ margin: "0 0 12px" }}>
          Sıcaklık, nem ve basınçta aynı soru sorulur: o saatte en düşük ve en yüksek değeri veren modeller arasındaki
          fark ne kadar? Ortalama ya da ortanca alınmaz — amaç tek bir "genel tahmin" üretmek değil, modellerin nerede
          ayrıştığını göstermektir.
        </p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, margin: "0 0 12px" }}>
          <thead>
            <tr>
              <th style={FAQ_TH}></th>
              <th style={FAQ_TH}>
                <AgreeMark level="ok" /> hemfikir
              </th>
              <th style={FAQ_TH}>
                <AgreeMark level="partial" /> kısmen
              </th>
              <th style={FAQ_TH}>
                <AgreeMark level="split" /> ayrışıyor
              </th>
            </tr>
          </thead>
          <tbody>
            {AGREE_ROWS.map((r) => (
              <tr key={r[0]}>
                <td style={{ ...FAQ_TD, color: "var(--ink)" }}>{r[0]}</td>
                <td style={FAQ_TD}>{r[1]}</td>
                <td style={FAQ_TD}>{r[2]}</td>
                <td style={FAQ_TD}>{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "0 0 12px" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Bulutlulukta</strong> fark yerine sınıfa bakılır:
          her modelin değeri açık (%0–10), az bulutlu (%10–30), parçalı bulutlu (%30–50), çok bulutlu (%50–90) ya da
          kapalı (%90–100) sınıfına yerleştirilir. Modellerin sınıflarının ortancası bulunur ve o sınıftaki modellerin
          oranına bakılır: %75 ve üstü hemfikir, %50–75 kısmen, altı ayrışıyor. Örneğin 5 modelin 4'ü "çok bulutlu"
          diyorsa, değerleri %55 ile %88 arasında dağılsa bile modeller hemfikirdir.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Rüzgarda</strong> tek bir fark yerine yön ve hız
          birlikte değerlendirilir: modeller arasındaki en büyük yön farkı 90°'yi ya da en büyük hız farkı 10 knot'u
          aşarsa uyum "kısmen"e düşer. İkisi birden aşılırsa veya fark 135° / 20 knot'u geçerse "ayrışıyor" olur.
          3 knot'un altındaki sakin rüzgarda yön karşılaştırılmaz — sakin havada yön zaten anlamsızdır.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Yağışta</strong> gün bazında bakılır: bir modelin o
          gün için verdiği toplam yağış eşiği aşıyorsa (varsayılan 0.2 mm; grafiğin altından değiştirebilirsin) o model
          "yağış bekliyor" sayılır. Modellerin en az %75'i aynı yöndeyse uzlaşı, altındaysa "modeller bölünmüş"
          gösterilir. Yağış olasılığı kullanılmaz, çünkü UKMO ve ARPEGE bu değeri sunmuyor.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>CAPE'de</strong> de sınıfa bakılır: 500 J/kg altı,
          500–1000 J/kg (sağanak yağış) ve 1000 J/kg üstü (gök gürültülü sağanak yağış). Ortanca sınıftaki modellerin oranı %75 ve üstüyse
          hemfikir, %50–75 kısmen, altındaysa ayrışıyor.
        </p>
        <p style={{ margin: 0 }}>
          Grafiklerin altındaki uyum şeridi saat saat değil dilim dilim çizilir ve her dilim o dilimdeki{" "}
          <em>en büyük</em> farka göre renklenir; böylece ayrışma ortalama alınarak yumuşatılmaz. Şerit, grafikte
          seçtiğin 1s / 3s / 6s aralığından bağımsız olarak saatlik veriden hesaplanır. Aynı seviyedeki komşu dilimler
          tek blokta birleşir; blok yeterince genişse içinde seviye ve "en çok 3.2°" gibi o bloktaki en büyük fark
          yazar. Şeridin üzerine gelince hangi iki modelin ayrıştığı görünür. Rüzgar ve bulutluluk tablolarındaki uyum
          satırı da aynı yolla, her sütunun en ayrışık saatine göre çizilir; yağışta ise şerit günlüktür. Tek model
          seçiliyken şerit gösterilmez — karşılaştıracak model yoktur.
        </p>
        <p style={{ margin: "12px 0 0" }}>
          CAPE, ortanca, hamle gibi kavramların açıklaması{" "}
          <Link href="/terimler" style={{ color: "var(--teal)" }}>
            Terimler
          </Link>{" "}
          sayfasında.
        </p>
      </>
    ),
  },
  {
    num: "03",
    q: "Basınç ve nem değerleri nereden geliyor?",
    a: (
      <>
        <p style={{ margin: "0 0 12px" }}>
          Basınçta deniz seviyesine indirgenmiş değer kullanılır. Yüzey basıncı her modelin kendi yükselti haritasına
          bağlıdır; onu karşılaştırmak modelleri değil modellerin rakım farkını karşılaştırmak olurdu — tek bir noktada
          20-30 hPa'ya varan, gerçekte var olmayan bir ayrışma görürdün.
        </p>
        <p style={{ margin: 0 }}>
          Nem, bağıl nemdir (%). ECMWF IFS 2 metre bağıl nemi ham olarak yayınlamadığı için bu modelin nem değeri, yine
          modelin kendi sıcaklık ve çiy noktası tahminlerinden Magnus formülüyle hesaplanır.
        </p>
        <p style={{ margin: "12px 0 0" }}>
          Basınç grafiğinin altındaki eğilim şeridi son 3 saatteki değişimin model ortancasıdır: 3 saatte 2 hPa'dan hızlı
          düşüş havanın bozulabileceğini, hızlı yükseliş açılacağını gösterir. Modeller değişimin yönünde ayrışıyorsa
          renk soluklaşır.
        </p>
      </>
    ),
  },
  {
    num: "04",
    q: "Grafiklerdeki bantlar ve çizgiler ne gösteriyor?",
    a: (
      <>
        <p style={{ margin: "0 0 12px" }}>
          Açık renkli bant 06:00–18:00 TSİ gündüz saatleridir; 06, 12 ve 18 dikmeleri saati okumayı kolaylaştırır.
          Teal dikey çizgi ve tablolardaki koyu turkuaz çerçeve şu anki saati gösterir. Bir grafiğe ya da tabloya
          tıklayınca sayfanın altındaki Model detayları o zamana gider; seçtiğin dilim bütün grafiklerde kesikli koyu
          bir çerçeveyle gösterilir. Tablodaki ← Şimdi → düğmeleri bu çerçeveyi her yerde birlikte kaydırır.
        </p>
        <p style={{ margin: 0 }}>
          Sıcaklıkta 30 °C çizgisi koyu çizilir. Nemde %85 üstü "doygunluğa yakın" (sis, çiy) ve %30 altı "kuru"
          bantlarla, basınçta 1013.25 hPa standart atmosfer çizgisiyle, CAPE'de 500 J/kg (sağanak yağış) ve 1000 J/kg
          (gök gürültülü sağanak yağış) çizgileriyle işaretlenir. Modellerin tahmin süreleri farklıdır; süresi biten modelin çizgisi bir
          noktayla biter. 16 günlük görünümde grafikler ve tablolar yatay kaydırılır ve saat üzerinden birlikte kayar.
        </p>
        <p style={{ margin: "12px 0 0" }}>
          Toplam yağışta her çubuk, seçtiğin 1 / 3 / 6 saatlik dilimdeki toplam yağıştır; modeller yan yana durur.
          Bulutluluk tablosunda hücre o dilimin ortalamasıdır ve rengi bulut sınıfını gösterir.
        </p>
        <p style={{ margin: "12px 0 0" }}>
          Rüzgar tablosunda hücre rengi ortalama rüzgar hızının bofor kademesidir (MGM Beaufort rüzgâr ıskalası). Ok
          rüzgarın estiği yönü gösterir; üstteki sayı ortalama hız, alttaki hamledir (o saatteki en yüksek ani rüzgar).
          3 ve 6 saatlik görünümde hücre dilimin ilk saatini gösterir. Koyu kırmızı çerçeve MGM fırtına eşiğinin (8
          bofor · 17.2 m/s ≈ 62 km/s ≈ 34 knot) aşıldığı saatleri işaretler.
        </p>
      </>
    ),
  },
  {
    num: "05",
    q: "Hava durumu ifadesi nasıl belirleniyor?",
    a: (
      <>
        <p style={{ margin: "0 0 12px" }}>
          Her model için saat saat bakılır. Modelin o günkü toplam yağışı en az 0.2 mm ve o saatteki yağışı en az 0.1
          mm ise yağış ifadesi kullanılır. Ayrımı o saatin CAPE değeri yapar: 500 J/kg ve altı &quot;Yağmurlu&quot;, 500
          üstü &quot;Sağanak Yağış&quot;, 1000 üstü &quot;Gök Gürültülü Sağanak Yağış&quot;. JMA CAPE vermediği için
          JMA&apos;da yağış hep &quot;Yağmurlu&quot; görünür. O saatteki yağışın en az yarısı kar ise aynı ayrımla
          &quot;Kar Yağışlı&quot;, &quot;Kar Sağanağı&quot; ya da &quot;Gök Gürültülü Kar Sağanağı&quot; yazılır.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          Yağış yoksa bulutluluk sınıfı yazılır: Açık (%0–10), Az Bulutlu (%10–30), Parçalı Bulutlu (%30–50), Çok
          Bulutlu (%50–90) ya da Kapalı (%90–100). 20:00–06:00 arasında açık, az ve parçalı bulutlu ikonlarında güneş
          yerine ay çizilir. 3 ve 6 saatlik görünümde dilimdeki en belirgin durum gösterilir: yağış bulut sınıfından
          önce gelir (aynı türde kar yağmurdan önce), bulutta daha kapalı olanı seçilir.
        </p>
        <p style={{ margin: 0 }}>
          Hava durumu tablosunun uyum satırında, o saatte modellerin en az yarısı yağış veriyorsa yağış verenlerin
          oranına, vermiyorsa ortanca bulut sınıfındaki yağışsız modellerin oranına bakılır: %75 ve üstü hemfikir,
          %50–75 kısmen, altı ayrışıyor.
        </p>
      </>
    ),
  },
  {
    num: "06",
    q: "Veriler ne sıklıkla güncelleniyor?",
    a: "Modelden modele değişir: ECMWF, GFS, ICON, UKMO, ARPEGE ve JMA günde 4 kez, GEM günde 2 kez güncellenir. havameridyen bu güncellemeleri Open-Meteo üzerinden otomatik olarak yansıtır.",
  },
  {
    num: "07",
    q: "Bu MGM'nin resmi sitesi mi?",
    a: "Hayır. havameridyen bağımsız, kişisel bir karşılaştırma aracıdır — Meteoroloji Genel Müdürlüğü ile bir bağlantısı yoktur. Afet veya acil durum kararları için lütfen MGM'nin resmi uyarılarını takip et.",
  },
  {
    num: "08",
    q: "Favorilerim nerede saklanıyor?",
    a: "Yalnızca kendi cihazında, tarayıcının yerel deposunda (localStorage) saklanır. Hesap oluşturmana gerek yok, hiçbir veri sunucuya gönderilmez. Tarayıcı verilerini temizlersen favorilerin de silinir.",
  },
];

export default function SSS() {
  return (
    <Layout title="Sık sorulan sorular · havameridyen" variant="narrow" footerLinks={FOOTER}>
      <Link className="back-link" href="/">
        ← Ana sayfaya dön
      </Link>

      <div className="kicker">Destek</div>
      <h1>Sık sorulan sorular</h1>

      <div className="faq-list">
        {FAQS.map((item) => (
          <details key={item.num} className="faq-item" open={!!item.open}>
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
