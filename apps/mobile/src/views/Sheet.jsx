// ⓘ menüsü ve alttan açılan sayfa (V07 C3): Modeller · Terimler · SSS · Hakkında · Yasal.
// Terimler web ile aynı kaynaktan (lib/terms.js); diğer metinler Prototip 9 ile aynı.

import { useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { TERMS } from "@lib/terms";
import { pad } from "../format";
import { sourceOf } from "../data";
import IntensityFaq from "./IntensityFaq";
import { FAQ_INTENSITY, FAQ_THRESHOLDS } from "@lib/intensityFaq";

export const MENU = [
  ["modeller", "Modeller", "8 model, kurum, çözünürlük, güncelleme", "M"],
  ["terimler", "Terimler", "CAPE, CIN, Lifted Index, uyum…", "T"],
  ["sss", "SSS", "Sık sorulan sorular", "?"],
  ["hakkinda", "Hakkında", "Proje ve veri kaynağı", "i"],
  ["yasal", "Yasal", "Gizlilik ve kullanım şartları", "§"],
];

const MINFO = {
  ecmwf_ifs: ["AVRUPA", "Avrupa Orta Vadeli Hava Tahminleri Merkezi", "~9 km", "Günde 4 kez", "Genellikle 3-7 gün arası orta vadeli tahminlerde en isabetli kabul edilir. Küresel modeller arasında referans noktası sayılır."],
  gfs_seamless: ["ABD", "NOAA Küresel Tahmin Sistemi", "~13 km", "Günde 4 kez", "Sık güncellendiği için ani hava değişimlerine hızlı tepki verir. Kısa vadeli (1-3 gün) takipte pratik bir referans."],
  icon_seamless: ["ALMANYA", "Deutscher Wetterdienst küresel modeli", "~7 km (Avrupa), ~11 km (küresel)", "Günde 4 kez", "Avrupa ve çevresinde yüksek çözünürlüklü bölgesel varyantlarıyla bilinir, yerel detayları daha net yakalar."],
  ukmo_seamless: ["İNGİLTERE", "UK Met Office küresel modeli", "~10 km", "Günde 4 kez", "Birleşik Krallık merkezli geliştirilse de küresel kapsama sahiptir; orta vadeli tahminlerde ECMWF'e yakın performans gösterir."],
  meteofrance_seamless: ["FRANSA", "Météo-France ARPEGE / AROME modeli", "~25 km (Avrupa'da ~11 km)", "Günde 4 kez", "Avrupa ve Kuzey Afrika'da yüksek çözünürlüklü AROME verisiyle desteklenir; konuma göre en uygun çözünürlük otomatik seçilir."],
  gem_seamless: ["KANADA", "Environment Canada küresel modeli", "~15 km", "Günde 2 kez", "Bağımsız bir veri asimilasyon sistemi kullanır — diğer modellerden farklı bir \"ikinci görüş\" sağlar."],
  jma_gsm: ["JAPONYA", "Japon Meteoroloji Ajansı Küresel Spektral Modeli (GSM)", "~55 km", "Günde 4 kez", "Diğer modellere göre daha düşük çözünürlüklü, ancak Asya-Pasifik bölgesinde uzun yıllardır kullanılan, kanıtlanmış bir model."],
  ecmwf_aifs025_single: ["AVRUPA · YAPAY ZEKÂ", "ECMWF Yapay Zekâ Tahmin Sistemi (AIFS)", "~28 km", "Günde 4 kez · 6 saatlik veri · 15 gün", "ECMWF'nin makine öğrenmesiyle çalışan küresel modeli. Yalnız 6 saatlik adım üretir; aradaki saatler hesaplanır, yağış 6 saate eşit bölünür. Hamle, CAPE, CIN, kar kalınlığı ve görüş vermez. Ortak tahminde yağış türü ECMWF'ye göre alınır."],
};
const TAGTX = { own: "modelin", calc: "hesaplanan", no: "yok" };

// 12 Kas 2026 (Ali Kemal: "mobil SSS'te madde atıfları hatalı; web ile mobil neden farklı sayıda"): mobil SSS web /sss
// ile aynı 11 soru, aynı sırada; böylece "10. soru" / "11. soru" atıfları iki tarafta da doğru. Çok paragraflı
// yanıtlar dizi olarak verilir. 04 mobil grafiklere göre yazıldı (web metni web'deki tablolara göre).
const SSS = [
  ["Hangi model en doğru?", 'Kesin bir "en doğru" model yok. ECMWF genelde 3-7 gün arası orta vadede güçlü kabul edilir, GFS sık güncellendiği için kısa vadede hızlı tepki verir, ICON Avrupa\'da yüksek çözünürlük sunar. Her modelin güçlü olduğu koşullar farklıdır — bu yüzden karşılaştırma yapıyoruz.'],
  ["Modeller arasındaki uyum nasıl hesaplanıyor?", "Ortak tahmindeki her değer seçili modellerin ortancasıdır (yağışta yağış veren modellerin ortancası). Uyum çubuğu ise modellerin o değerde ne kadar ayrıştığını gösterir: sıcaklık, nem ve basınçta en düşük ile en yüksek değer arasındaki fark, bulutluluk ve CAPE'de aynı sınıftaki modellerin oranı. Ayrıntısı Terimler › Uyum'da."],
  ["Basınç ve nem değerleri nereden geliyor?", "Basınç deniz seviyesine indirgenmiş değerdir; yüzey basıncı modelin yükselti haritasına bağlı olduğu için karşılaştırmayı bozar. Nem bağıl nemdir; ECMWF'de modelin sıcaklık ve çiy noktasından hesaplanır."],
  [
    "Grafiklerdeki bantlar ve çizgiler ne gösteriyor?",
    [
      "Açık renkli bant gündüz saatleridir (bakılan konumun gün doğumundan gün batımına). Kesikli koyu dikey çizgi şu anki saati, turkuaz çerçeve seçtiğin dilimi gösterir. Grafiğe dokununca o dilimdeki model değerleri açılır ve sayfanın altındaki Model verileri detay tablosu o zamana gider.",
      "Her grafiğin altındaki uyum şeridi, modellerin o dilimde hemfikir mi ayrışıyor mu olduğunu gösterir; şeride dokununca açıklaması çıkar. Siyah-beyaz kesikli çizgi seçili modellerin ortancasıdır. Tek model seçiliyken yalnız o modelin çizgileri çizilir; ortanca ve uyum şeritleri gösterilmez.",
      "Nemde %85 üstü \"doygunluğa yakın\" ve %30 altı \"kuru\" bantlarla, basınçta 1013,25 hPa standart atmosfer çizgisiyle, CAPE'de 500 J/kg (sağanak yağış) ve 1000 J/kg (gök gürültülü sağanak yağış) çizgileriyle işaretlenir. Hamlede her günün en yüksek değeri yönüyle yazılır; hamle 50 km/s'ye yaklaşınca 62 km/s fırtına çizgisi çıkar. Basıncın altındaki eğilim şeridi 3 saatlik değişimi gösterir.",
      "Toplam yağışta her çubuk, seçtiğin 1 / 3 / 6 / 12 saatlik dilimdeki toplam yağıştır; modeller yan yana durur. Altındaki uzlaşı şeridi, seçtiğin eşiği aşan modellerin oranıyla koyulaşır. Bulutlulukta hücre dilimin ortalamasıdır, rengi bulut sınıfını gösterir; mavi nokta o dilimde yağış olduğunu gösterir.",
      "Bir grafiğin başlığına dokunarak o grafiği kapatıp açabilirsin; seçimin bu cihazda hatırlanır.",
    ],
  ],
  [
    "Hava durumu ifadesi nasıl belirleniyor?",
    [
      "Her model için saat saat bakılır. Modelin o günkü toplam yağışı en az 0.2 mm ve o saatteki yağışı en az 0.1 mm ise yağış ifadesi kullanılır. Ayrımı o saatin CAPE değeri yapar: 500 J/kg ve altı \"Yağmurlu\", 500 üstü \"Sağanak Yağış\", 1000 üstü \"Gök Gürültülü Sağanak Yağış\". JMA CAPE vermediği için JMA'da yağış hep \"Yağmurlu\" görünür. AIFS de CAPE vermez; AIFS'te ayrımı sağanak payı yapar (yağışın en az yarısı sağanaksa \"Sağanak Yağış\"), gök gürültülü ifadesi kullanılmaz. Ortak tahminde AIFS'in yağış miktarı sayılır, türü ise ECMWF'ye göre alınır. O saatteki yağışın en az yarısı kar ise aynı ayrımla \"Kar Yağışlı\", \"Kar Sağanağı\" ya da \"Gök Gürültülü Kar Sağanağı\" yazılır. Yağışın şiddeti (hafif, normal, kuvvetli) ifadeye ve ikona ayrıca yansır; ayrıntısı 10. soruda. Ortak tahminde kar ifadesi için en az 2 modelin kar vermesi gerekir.",
      "Yağış yoksa bulutluluk sınıfı yazılır: Açık (%0–10), Az Bulutlu (%10–30), Parçalı Bulutlu (%30–50), Çok Bulutlu (%50–90) ya da Kapalı (%90–100). Bakılan konumda gün batımından gün doğumuna kadar açık, az bulutlu, parçalı bulutlu ve puslu ikonlarında güneş yerine ay çizilir. 3 ve 6 saatlik görünümde dilimdeki en belirgin durum gösterilir: yağış bulut sınıfından önce gelir (aynı türde kar yağmurdan önce), bulutta daha kapalı olanı seçilir.",
      "Hava durumu grafiğinin altındaki uyum şeridinde, o saatte modellerin en az yarısı yağış veriyorsa yağış verenlerin oranına, vermiyorsa ortanca bulut sınıfındaki modellerin oranına bakılır (o saatte verisi olan bütün modeller bulut sınıfıyla sayılır, yağış veren azınlık da; verisi olmayan model sayılmaz): %75 ve üstü hemfikir, %50–75 kısmen, altı ayrışıyor.",
    ],
  ],
  ["Veriler ne sıklıkla güncelleniyor?", "ECMWF, AIFS, GFS, ICON, UKMO, ARPEGE ve JMA günde 4 kez, GEM günde 2 kez güncellenir. havameridyen bu güncellemeleri Open-Meteo üzerinden otomatik olarak yansıtır."],
  ["Bu MGM'nin resmi uygulaması mı?", "Hayır. havameridyen bağımsız, kişisel bir karşılaştırma aracıdır — Meteoroloji Genel Müdürlüğü ile bir bağlantısı yoktur. Afet veya acil durum kararları için MGM'nin resmi uyarılarını takip et."],
  ["Favorilerim nerede saklanıyor?", "Yalnız kendi cihazında saklanır. Hesap oluşturmana gerek yok."],
  [
    "Saatlik yağış miktarlarını topladığımda neden günlük toplam yağışı elde edemiyorum?",
    [
      "Ortak tahminde günlük toplam yağış, saatlik değerlerin toplamı değildir; ikisi ayrı hesaplanır. Günlük toplam yağış için önce her modelin o günkü toplam yağışı bulunur, sonra yağış veren modellerin toplamlarının ortancası alınır. Saatlik yağışta ise her saat için o saatte yağış veren modellerin miktarlarının ortancası alınır. Modeller yağışın başlama, bitme ve ara verme saatlerinde çoğu zaman ayrıştığı için bu iki yol farklı sonuç verir.",
      "Örnek: Üç model de günde 10 mm yağış veriyor, ama biri sabah, biri öğlen, biri akşam. Günlük toplamın ortancası 10 mm'dir. Her saatte ise yalnızca bir model yağış verdiği için o saatler yağışlı sayılmaz ve saatlik miktar gösterilmez.",
      "Ayrıca saatlik yağış yalnızca modellerin en az yarısı o saatte yağış veriyorsa gösterilir ve değerler bir ondalığa yuvarlanır. Tek model seçtiğinde saatlik değerlerin toplamı, yuvarlama farkı dışında, günlük toplama eşittir.",
    ],
  ],
  // 8 Kas 2026: yağış / kar şiddeti — web SSS 10 ve 11 ile aynı içerik (lib/intensityFaq.js)
  [FAQ_INTENSITY.q, FAQ_INTENSITY],
  [FAQ_THRESHOLDS.q, FAQ_THRESHOLDS],
];

// <b>…</b> parçalarını kalın yazar (web /terimler ile aynı)
const rich = (text) => text.split(/<b>(.*?)<\/b>/).map((part, k) => (k % 2 ? <b key={k}>{part}</b> : part));

function Models({ allModels, loaded }) {
  return (
    <>
      <p style={{ marginTop: 8 }}>Uygulamadaki modeller ve kararsızlık verisinin kaynağı (modelin kendi değeri / bizim hesapladığımız / yok).</p>
      {allModels.map((m) => {
        const x = MINFO[m.id] || ["", "", "", "", ""];
        const lm = loaded.find((l) => l.id === m.id);
        return (
          <div className="mdl" key={m.id}>
            <div className="nm">
              <i style={{ background: m.color }} />
              {m.label}
              <small>{x[0]}</small>
            </div>
            <dl>
              <dt>Kurum</dt>
              <dd>{x[1]}</dd>
              <dt>Çözünürlük</dt>
              <dd>{x[2]}</dd>
              <dt>Güncelleme</dt>
              <dd>{x[3]}</dd>
              {lm && (
                <>
                  <dt>Kararsızlık</dt>
                  <dd>
                    {[
                      ["CAPE", "cape"],
                      ["CIN", "cin"],
                      ["LI", "lifted_index"],
                    ].map(([n, k]) => {
                      const s = sourceOf(lm, k);
                      return (
                        <span key={k} className={`tag2 t-${s}`}>
                          {n} · {TAGTX[s]}
                        </span>
                      );
                    })}
                  </dd>
                </>
              )}
            </dl>
            <p style={{ fontSize: 12.5, color: "var(--s-soft)" }}>{x[4]}</p>
          </div>
        );
      })}
    </>
  );
}

function Body({ page, allModels, loaded, onPage }) {
  if (page === "menu")
    return MENU.map(([k, t, d, ic]) => (
      <button key={k} type="button" className="mi" onClick={() => onPage(k)}>
        <span className="ic">{ic}</span>
        <span>
          <b>{t}</b>
          <small>{d}</small>
        </span>
        <span className="ch">›</span>
      </button>
    ));
  if (page === "modeller") return <Models allModels={allModels} loaded={loaded} />;
  if (page === "terimler")
    return TERMS.map(([id, t, sub, d, bz]) => (
      <div className="term" id={`term-${id}`} key={id}>
        <h4>
          {t}
          {sub && <small>{sub}</small>}
        </h4>
        <p>{rich(d)}</p>
        {bz && <div className="bz">{rich(bz)}</div>}
      </div>
    ));
  if (page === "sss")
    return SSS.map(([q, a], i) => (
      <div key={q}>
        <h4>
          {pad(i + 1)} · {q}
        </h4>
        {typeof a === "string" ? <p>{a}</p> : Array.isArray(a) ? a.map((t, k) => <p key={k}>{t}</p>) : <IntensityFaq blocks={a.blocks} />}
      </div>
    ));
  if (page === "hakkinda")
    return (
      <>
        <h4>Bağımsız bir model karşılaştırma aracı</h4>
        <p>
          havameridyen ECMWF, GFS, ICON, UKMO, ARPEGE, GEM, JMA ve AIFS tahminlerini yan yana gösterir. Amaç tek bir "genel tahmin" üretmek değil, modellerin nerede aynı
          şeyi söyleyip nerede ayrıştığını göstermektir.
        </p>
        <p>Veri: Open-Meteo (CC BY 4.0). Meteoroloji Genel Müdürlüğü'nün (MGM) resmi bir kanalı değildir.</p>
        <p>Konum adları © OpenStreetMap katkıda bulunanlar (ODbL).</p>
        <p style={{ color: "var(--s-soft)" }}>
          <Version />
        </p>
      </>
    );
  if (page === "yasal")
    return (
      <>
        <h4>Gizlilik</h4>
        <p>Hesap yok, reklam ve takip aracı yok. Favoriler, ayarlar ve son tahmin (çevrimdışı görmek için) yalnız cihazda saklanır.</p>
        <p>
          Konum: "Konumumu kullan" yalnız uygulama açıkken ve yalnız <b>yaklaşık konum</b> izniyle çalışır. Tahmin ve yer adı için
          koordinat yaklaşık 1 km'ye yuvarlanarak havameridyen sunucusuna gönderilir; hesapla ya da cihazla ilişkilendirilmez ve
          saklanmaz. Yer adı OpenStreetMap servislerinden (Nominatim, Photon) sunucu üzerinden alınır.
        </p>
        <h4>Sorumluluk</h4>
        <p>Gösterilen değerler model tahminidir, ölçüm değildir. Afet ve acil durumlarda MGM uyarıları esas alınır.</p>
        <p style={{ color: "var(--s-soft)" }}>Tam metin: havameridyen.com/yasal (Gizlilik Politikası ve Kullanım Şartları, KVKK).</p>
      </>
    );
  return null;
}

// sheet: { page, term? } ya da null
// Sürüm (31 Ekim, eksikler turu): Android'de uygulamanın sürüm adı ve numarası (build.gradle versionName / versionCode)
function Version() {
  const [v, setV] = useState(null);
  useEffect(() => {
    CapApp.getInfo()
      .then((i) => setV(`Sürüm ${i.version} (${i.build})`))
      .catch(() => setV("Sürüm: web önizleme"));
  }, []);
  return v || "";
}

export default function Sheet({ sheet, allModels, loaded, onSheet }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !sheet) return;
    el.scrollTop = 0;
    if (sheet.term) {
      const t = el.querySelector(`#term-${sheet.term}`);
      if (t) {
        el.scrollTop = t.offsetTop - 8;
        t.classList.remove("hl");
        void t.offsetWidth;
        t.classList.add("hl");
      }
    }
  }, [sheet]);
  if (!sheet) return null;
  const item = MENU.find((m) => m[0] === sheet.page);
  return (
    <div className="sheet">
      <div className="sh-back" onClick={() => onSheet(null)} />
      <div className="sh-card" role="dialog" aria-modal="true" aria-label={item ? item[1] : "Bilgi"}>
        <div className="sh-grip" />
        <div className="sh-head">
          <button type="button" aria-label="Menüye dön" style={{ visibility: sheet.page === "menu" ? "hidden" : "visible" }} onClick={() => onSheet({ page: "menu" })}>
            ‹
          </button>
          <b>{item ? item[1] : "Bilgi"}</b>
          <button type="button" aria-label="Kapat" onClick={() => onSheet(null)}>
            ×
          </button>
        </div>
        <div className="sh-body" ref={bodyRef}>
          <Body page={sheet.page} allModels={allModels} loaded={loaded} onPage={(p) => onSheet({ page: p })} />
        </div>
      </div>
    </div>
  );
}
