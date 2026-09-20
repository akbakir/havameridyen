import Link from "next/link";
import Layout from "../components/Layout";

const FOOTER = [
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/yasal", label: "Yasal" },
];

// SSS cevaplarında kullanılan küçük tablo stilleri (globals.css'e dokunmamak için satır içi).
const FAQ_TH = { textAlign: "left", fontWeight: 600, color: "var(--ink)", padding: "6px 10px 6px 0", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const FAQ_TD = { padding: "6px 10px 6px 0", borderBottom: "1px solid var(--line)", verticalAlign: "top" };

// Uyum eşikleri — grafiklerdeki AGREE_PARAMS ile aynı değerler (pages/[sehir].js).
const AGREE_ROWS = [
  ["Sıcaklık", "< 2 °C", "2–4 °C", "> 4 °C"],
  ["Nem", "< %10", "%10–20", "> %20"],
  ["Basınç", "< 2 hPa", "2–4 hPa", "> 4 hPa"],
  ["Bulutluluk", "< %25", "%25–50", "> %50"],
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
          Her parametrede aynı soru sorulur: o saatte en düşük ve en yüksek değeri veren modeller arasındaki fark ne
          kadar? Ortalama ya da ortanca alınmaz — amaç tek bir "genel tahmin" üretmek değil, modellerin nerede
          ayrıştığını göstermektir.
        </p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, margin: "0 0 12px" }}>
          <thead>
            <tr>
              <th style={FAQ_TH}></th>
              <th style={FAQ_TH}>✓ hemfikir</th>
              <th style={FAQ_TH}>~ kısmen</th>
              <th style={FAQ_TH}>≠ ayrışıyor</th>
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
        <p style={{ margin: 0 }}>
          Grafiklerin altındaki uyum şeridi saat saat değil dilim dilim çizilir (3 günlük görünümde 3 saatlik, 16
          günlükte günlük dilimler) ve her dilim o dilimdeki <em>en büyük</em> farka göre renklenir. Böylece ayrışma
          ortalama alınarak yumuşatılmaz, şerit de okunaklı kalır. Bir dilimin üzerine gelince hangi iki modelin
          ayrıştığı yazar.
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
      </>
    ),
  },
  {
    num: "04",
    q: "Veriler ne sıklıkla güncelleniyor?",
    a: "Modelden modele değişir: ECMWF, GFS, ICON, UKMO, ARPEGE ve JMA günde 4 kez, GEM günde 2 kez güncellenir. havameridyen bu güncellemeleri Open-Meteo üzerinden otomatik olarak yansıtır.",
  },
  {
    num: "05",
    q: "Bu MGM'nin resmi sitesi mi?",
    a: "Hayır. havameridyen bağımsız, kişisel bir karşılaştırma aracıdır — Meteoroloji Genel Müdürlüğü ile bir bağlantısı yoktur. Afet veya acil durum kararları için lütfen MGM'nin resmi uyarılarını takip et.",
  },
  {
    num: "06",
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