import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { getFavorites, removeFavorite } from "../lib/favorites";
import { cityHref } from "../lib/slugify";

const NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/modeller", label: "Modeller" },
  { href: "/izmir", label: "İzmir" },
];

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
        const res = await fetch(
          `/api/forecast?lat=${f.lat}&lon=${f.lon}&period=hourly&name=${encodeURIComponent(f.name)}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        const series = data.models[0]?.series || [];
        const day = series.slice(0, 24);
        const vals = day.map((s) => s.temp).filter((v) => v != null);
        if (!vals.length) throw new Error();
        const hour = new Date().getHours();
        const now = day[hour]?.temp ?? vals[0];
        if (cancelled) return;
        setTemps((prev) => ({
          ...prev,
          [f.name]: {
            now: Math.round(now),
            min: Math.round(Math.min(...vals)),
            max: Math.round(Math.max(...vals)),
          },
        }));
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
    <Layout title="Favorilerin · Meridyen" nav={NAV}>
      <div className="page-head">
        <h1>Kayıtlı konumların</h1>
        <p>
          {!loaded
            ? "—"
            : favs.length
            ? `${favs.length} konum kayıtlı · anlık sıcaklıklar güncelleniyor`
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
                <div className="fav-card-temp">
                  {!t && <span className="fav-card-loading">Yükleniyor…</span>}
                  {t?.error && <span className="fav-card-err">Veri alınamadı</span>}
                  {t && !t.error && (
                    <>
                      <span className="fav-temp-value">{t.now}°</span>
                      <span className="fav-temp-range">
                        {t.min}° / {t.max}°
                      </span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
