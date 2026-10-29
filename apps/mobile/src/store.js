// Cihazda saklanan ayarlar: son konum, favoriler, seçili modeller, rüzgar birimi. Hesap yok; sunucuya gönderilmez.
// Depolama kapalı ya da boşsa uygulama varsayılanlarla açılır.

const KEY = "hm_mobile_v1";

export const DEFAULT_PLACE = { name: "İzmit", admin1: "Kocaeli", lat: 40.77, lon: 29.94 }; // web ile aynı (lib/slugify.js)

const DEFAULTS = {
  place: DEFAULT_PLACE,
  favorites: [DEFAULT_PLACE],
  // Yeni kurulum "Ortak tahmin" ile açılır: varsayılan 5 model (Ali Kemal 28 Ekim: "EVET AÇILSIN"; önceden yalnız
  // ECMWF, 23 Eylül). Kayıtlı seçimi olan kurulumlar etkilenmez.
  selected: ["ecmwf_ifs", "gfs_seamless", "icon_seamless", "ukmo_seamless", "meteofrance_seamless"],
  unit: "kmh",
  listOpen: false, // günlük sayfadaki 16 günlük liste (son tercih hatırlanır)
};

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return {
      place: raw.place && Number.isFinite(raw.place.lat) ? raw.place : DEFAULTS.place,
      favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((f) => f && Number.isFinite(f.lat)) : DEFAULTS.favorites,
      selected: Array.isArray(raw.selected) && raw.selected.length ? raw.selected : DEFAULTS.selected,
      unit: raw.unit === "kt" ? "kt" : "kmh",
      listOpen: raw.listOpen === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* depolama kapalı: ayar bu oturumla sınırlı kalır */
  }
}

export const placeKey = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
export const placeLabel = (p) => (p.admin1 && p.admin1 !== p.name ? `${p.name}, ${p.admin1}` : p.name);
