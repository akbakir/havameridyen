import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { cityHref, HOME_CITIES, slugify } from "../lib/slugify";

const HOME_NAV = [
  { href: "/modeller", label: "Modeller" },
  { href: "/favoriler", label: "Favoriler" },
  { href: "/hakkinda", label: "Hakkında" },
];

const HOME_FOOTER = [
  { href: "/modeller", label: "Modeller" },
  { href: "/hakkinda", label: "Hakkında" },
  { href: "/sss", label: "SSS" },
  { href: "#", label: "Yasal" },
];

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [note, setNote] = useState("");
  const searchTimer = useRef(null);
  const blockRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (blockRef.current && !blockRef.current.contains(e.target)) {
        setResults(null);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function goToCity({ name, lat, lon }) {
    const slug = slugify(name);
    setNote(`→ /${slug} sayfasına yönlendiriliyor…`);
    router.push(cityHref({ name, lat, lon, slug }));
  }

  function onSearchChange(e) {
    const q = e.target.value;
    setQuery(q);
    setNote("");
    clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => runSearch(q.trim()), 350);
  }

  async function runSearch(q) {
    try {
      const r = await fetch(`/api/locations?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      setResults(data.results || []);
    } catch {
      setResults("error");
    }
  }

  return (
    <Layout title="Meridyen — Türkiye için 4 model, tek ekran" variant="home" nav={HOME_NAV} footerLinks={HOME_FOOTER}>
      <section className="hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          ECMWF · GFS · ICON · GEM canlı karşılaştırma
        </div>
        <h1>
          Türkiye için 4 model,
          <br />
          <em>tek ekran.</em>
        </h1>
        <p className="hero-sub">
          ECMWF, GFS, ICON ve GEM&apos;i yan yana karşılaştır, modellerin ne kadar uyuştuğunu gör, kendi kararını ver.
        </p>

        <div className="search-block" ref={blockRef}>
          <div className="search-shell">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              className="search-input"
              placeholder="Şehir veya ilçe ara (örn. Bodrum)…"
              autoComplete="off"
              value={query}
              onChange={onSearchChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim().length >= 2) runSearch(query.trim());
              }}
            />
            <button className="search-go" type="button" onClick={() => query.trim().length >= 2 && runSearch(query.trim())}>
              Ara
            </button>
          </div>
          {results === "error" && (
            <div className="search-results">
              <div>Arama başarısız oldu</div>
            </div>
          )}
          {Array.isArray(results) && results.length === 0 && (
            <div className="search-results">
              <div>Sonuç bulunamadı</div>
            </div>
          )}
          {Array.isArray(results) && results.length > 0 && (
            <div className="search-results">
              {results.map((r, i) => (
                <div key={`${r.name}-${r.lat}-${i}`} onClick={() => goToCity(r)}>
                  <div>{r.name}</div>
                  <div className="r-sub">
                    {r.admin1 ? `${r.admin1} — ` : ""}
                    {r.country}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="redirect-note">{note}</div>
        </div>

        <div className="cities-row">
          {HOME_CITIES.map((c) => (
            <a
              key={c.name}
              className="city-chip"
              href={cityHref(c)}
              onClick={(e) => {
                e.preventDefault();
                goToCity(c);
              }}
            >
              {c.name}
            </a>
          ))}
        </div>
      </section>

      <section className="how">
        <div className="how-head">
          <div className="kicker">Nasıl çalışır</div>
          <h2>Üç adımda karşılaştır</h2>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-num">1</div>
            <div className="step-title">Konum seç</div>
            <div className="step-desc">Şehir ara ya da hızlı erişim listesinden birine tıkla.</div>
          </div>
          <div className="step">
            <div className="step-num">2</div>
            <div className="step-title">Periyot seç</div>
            <div className="step-desc">Saatlik, 3 günlük, 7 günlük ya da 16 günlük görünüme geç.</div>
          </div>
          <div className="step">
            <div className="step-num">3</div>
            <div className="step-title">Modelleri karşılaştır</div>
            <div className="step-desc">4 modelin tahminini tek grafikte incele, uyum skorunu gör.</div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
