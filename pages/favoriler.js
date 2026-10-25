import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { getFavorites, removeFavorite } from "../lib/favorites";
import { cityHref } from "../lib/slugify";
import { WxIcon } from "../components/WeatherCond";
import AgreeMark from "../components/AgreeMark";

// Kartlar küçük widget (K) gibi: beş modelin ortak tahmini (/api/v1, ortanca + uyum). Widget'la aynı istek,
// aynı önbellek: şimdiki saatin ortak durumu, ikonu ve sıcaklığı; bugünün en yüksek / en düşüğü; gün kuralıyla
// yağışlıysa bugünün toplam yağışı (modellerin ortancası); şimdiki saatin uyumu.
const FAV_MODELS = "ecmwf_ifs,gfs_seamless,icon_seamless,ukmo_seamless,meteofrance_seamless";
const FAV_DAYS = 5;
// Uyum etiketleri: Hava durumu matrisindeki şeritle aynı renkler (components/LineChartPanel.js)
const AGREE = {
  ok: { bg: "#DDE0DB", ink: "#1F2A24", text: "hemfikir" },
  partial: { bg: "#F0C98A", ink: "#1F2A24", text: "kısmen" },
  split: { bg: "#D98E2B", ink: "#FFFFFF", text: "ayrışıyor" },
};

const v = (p) => (p && p.v != null ? p.v : null);
const deg = (x) => (x == null ? "—" : `${Math.round(x)}°`);

// Widget'taki gibi: 10 mm altı tek ondalık (virgüllü), üstü tam sayı; 0,05 altı yazılmaz
function mmText(x) {
  if (x == null || x < 0.05) return null;
  return `${x < 9.95 ? x.toFixed(1).replace(".", ",") : Math.round(x)} mm`;
}

function summarize(data) {
  const time = data.time || [];
  const cons = data.consensus || {};
  // Seri TSİ duvar saatiyle gelir; "şimdi"yi de TSİ'ye göre bul (tarayıcı saat diliminden bağımsız).
  const nowKey = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  const i = time.findIndex((t) => typeof t === "string" && t.startsWith(nowKey));
  const h = i >= 0 ? cons.hourly?.[i] : null;
  if (!h || v(h.temp) == null) return null;
  const today = (cons.daily || []).find((d) => d.date === nowKey.slice(0, 10));
  const c = h.cond || {};
  return {
    time: time[i].slice(11, 16),
    temp: v(h.temp),
    ic: c.ic || "cloud",
    text: c.text || "",
    level: c.level || "na",
    max: today ? v(today.temp_max) : null,
    min: today ? v(today.temp_min) : null,
    mm: today && today.cond?.wet ? mmText(v(today.precip_total)) : null,
  };
}

export default function Favoriler() {
  const [favs, setFavs] = useState(null);
  const [temps, setTemps] = useState({});

  useEffect(() => {
    setFavs(getFavorites());
  }, []);

  useEffect(() => {
    if (!favs || !favs.length) return;
    let cancelled = false;
    favs.forEach(async (f) => {
      try {
        // Kanonik adres (iki ondalık, modeller site sırasıyla): yönlendirmesiz, widget ve uygulamayla ortak önbellek
        const lat = (Math.round(Number(f.lat) * 100) / 100).toFixed(2);
        const lon = (Math.round(Number(f.lon) * 100) / 100).toFixed(2);
        const res = await fetch(`/api/v1/forecast?lat=${lat}&lon=${lon}&days=${FAV_DAYS}&models=${FAV_MODELS}`);
        if (!res.ok) throw new Error();
        const sum = summarize(await res.json());
        if (!sum) throw new Error();
        if (cancelled) return;
        setTemps((prev) => ({ ...prev, [f.name]: sum }));
      } catch {
        if (!cancelled) setTemps((prev) => ({ ...prev, [f.name]: { error: true } }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [favs]);

  function onRemove(e, name) {
    e.preventDefault();
    e.stopPropagation();
    setFavs(removeFavorite(name));
    setTemps((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  const loaded = favs !== null;

  return (
    <Layout title="Favorilerin · havameridyen">
      <div className="page-head">
        <h1>Kayıtlı konumların</h1>
        <p>
          {!loaded
            ? "—"
            : favs.length
            ? `${favs.length} konum kayıtlı · beş modelin ortak tahmini`
            : "Henüz kayıtlı konumun yok."}
        </p>
      </div>

      {loaded && !favs.length && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <h2>Henüz favori eklemedin</h2>
          <p>Bir şehir sayfasında konum etiketinin yanındaki yıldıza tıkla, buradan tek ekranda takip et.</p>
          <Link className="empty-cta" href="/">
            Ana sayfaya git →
          </Link>
        </div>
      )}

      {loaded && favs.length > 0 && (
        <div className="fav-grid">
          {favs.map((f) => {
            const t = temps[f.name];
            return (
              <Link key={f.name} className="fav-card" href={cityHref(f)}>
                <div className="fav-card-top">
                  <div>
                    <div className="fav-card-name">{f.name}</div>
                    <div className="fav-card-coords">
                      {Number(f.lat).toFixed(2)}°K {Number(f.lon).toFixed(2)}°D
                    </div>
                  </div>
                  <button
                    className="remove-btn"
                    type="button"
                    aria-label="Favorilerden çıkar"
                    title="Favorilerden çıkar"
                    onClick={(e) => onRemove(e, f.name)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {!t && <span className="fav-card-loading">Yükleniyor…</span>}
                {t?.error && <span className="fav-card-err">Veri alınamadı</span>}
                {t && !t.error && (
                  <>
                    <div className="fav-card-now">
                      <WxIcon ic={t.ic} size={40} />
                      <span className="fav-temp-value">{deg(t.temp)}</span>
                      <span className="fav-card-time">{t.time}</span>
                    </div>
                    <div className="fav-card-cond">
                      <span>{t.text}</span>
                      {t.mm && <span className="fav-card-mm">bugün {t.mm}</span>}
                    </div>
                    <div className="fav-card-bottom">
                      <span className="fav-temp-range">
                        <span className="fav-max">{deg(t.max)}</span> / <span className="fav-min">{deg(t.min)}</span>
                      </span>
                      {AGREE[t.level] && (
                        <span
                          className="fav-agree"
                          style={{ background: AGREE[t.level].bg, color: AGREE[t.level].ink }}
                        >
                          <AgreeMark level={t.level} size={10} />
                          {AGREE[t.level].text}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {loaded && favs.length > 0 && (
        <p
          className="panel-sub"
          style={{ marginTop: 16, fontSize: 12, lineHeight: 1.5, maxWidth: 640 }}
        >
          ⓘ Kartlardaki değerler <strong>beş modelin (ECMWF, GFS, ICON, UKMO, ARPEGE) ortak tahminidir</strong>:
          her değer modellerin ortancası olup ölçüm değildir. Sıcaklık ve hava durumu ikonu şu anki saatin (TSİ)
          tahminidir. Altta bugünün en yüksek / en düşük sıcaklığı ile modellerin şimdiki saatte ne kadar hemfikir
          olduğu yazmaktadır. Bugün yağışlıysa (modellerin en az yarısı yağış veriyorsa) bugünün toplam yağışı da
          karta işlenir. Modelleri tek tek karşılaştırmak için karta dokunup şehir sayfasını açabilirsiniz.
        </p>
      )}
    </Layout>
  );
}