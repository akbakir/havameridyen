// ⓘ menüsü ve alttan açılan sayfa (V07 C3): Modeller · Terimler · SSS · Hakkında · Yasal.
// Terimler web ile aynı kaynaktan (lib/terms.js); diğer metinler Prototip 9 ile aynı.

import { useEffect, useRef } from "react";
import { TERMS } from "@lib/terms";
import { pad } from "../format";
import { sourceOf } from "../data";

export const MENU = [
  ["modeller", "Modeller", "7 model, kurum, çözünürlük, güncelleme", "M"],
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
};
const TAGTX = { own: "modelin", calc: "hesaplanan", no: "yok" };

const SSS = [
  ["Hangi model en doğru?", 'Kesin bir "en doğru" model yok. ECMWF genelde 3-7 gün arası orta vadede güçlü kabul edilir, GFS sık güncellendiği için kısa vadede hızlı tepki verir, ICON Avrupa\'da yüksek çözünürlük sunar. Her modelin güçlü olduğu koşullar farklıdır — bu yüzden karşılaştırma yapıyoruz.'],
  ["Modeller arasındaki uyum nasıl hesaplanıyor?", 'Ortalama ya da ortanca üzerinden bir "genel tahmin" üretilmez; her parametrede modellerin ne kadar ayrıştığına bakılır. Ayrıntısı Terimler › Uyum\'da.'],
  ["Basınç ve nem değerleri nereden geliyor?", "Basınç deniz seviyesine indirgenmiş değerdir; yüzey basıncı modelin yükselti haritasına bağlı olduğu için karşılaştırmayı bozar. Nem bağıl nemdir; ECMWF'de modelin sıcaklık ve çiy noktasından hesaplanır."],
  ["Veriler ne sıklıkla güncelleniyor?", "ECMWF, GFS, ICON, UKMO, ARPEGE ve JMA günde 4 kez, GEM günde 2 kez güncellenir. havameridyen bu güncellemeleri Open-Meteo üzerinden otomatik olarak yansıtır."],
  ["Bu MGM'nin resmi uygulaması mı?", "Hayır. havameridyen bağımsız, kişisel bir karşılaştırma aracıdır — Meteoroloji Genel Müdürlüğü ile bir bağlantısı yoktur. Afet veya acil durum kararları için MGM'nin resmi uyarılarını takip et."],
  ["Favorilerim nerede saklanıyor?", "Yalnız kendi cihazında saklanır. Hesap oluşturmana gerek yok."],
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
        <p>{a}</p>
      </div>
    ));
  if (page === "hakkinda")
    return (
      <>
        <h4>Bağımsız bir model karşılaştırma aracı</h4>
        <p>
          havameridyen ECMWF, GFS, ICON, UKMO, ARPEGE, GEM ve JMA tahminlerini yan yana gösterir. Amaç tek bir "genel tahmin" üretmek değil, modellerin nerede aynı
          şeyi söyleyip nerede ayrıştığını göstermektir.
        </p>
        <p>Veri: Open-Meteo (CC BY 4.0). Meteoroloji Genel Müdürlüğü'nün (MGM) resmi bir kanalı değildir.</p>
      </>
    );
  if (page === "yasal")
    return (
      <>
        <h4>Gizlilik</h4>
        <p>Hesap yok; favoriler ve ayarlar yalnız cihazda saklanır, kişisel veri sunucuya gönderilmez.</p>
        <h4>Sorumluluk</h4>
        <p>Gösterilen değerler model tahminidir, ölçüm değildir. Afet ve acil durumlarda MGM uyarıları esas alınır.</p>
        <p style={{ color: "var(--s-soft)" }}>Tam metin: havameridyen.com/yasal (Gizlilik Politikası ve Kullanım Şartları, KVKK).</p>
      </>
    );
  return null;
}

// sheet: { page, term? } ya da null
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
