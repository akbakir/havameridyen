// Hesaplanan Lifted Index (ve CIN) — sunucu madde 3, Ekim 2026. Modelin kendi yüzey ve basınç seviyesi
// verisinden; yalnız o değeri yayınlamayan modellerde. Farklı çözünürlükteki veriler birleştirilmez.
// Doğrulama (17 Ekim, 16 nokta × 16 gün, canlı veri): LI, GFS'in kendi LI'siyle fark ortanca 0,4 °C →
// kullanılıyor. CIN, CAPE > 0 saatlerde GFS / ICON ile aynı sınıf % 64 / % 67 (kural ≥ % 70) → hesaplanan
// CIN şimdilik gösterilmiyor (karar bekliyor); fonksiyon yeniden ölçüm için duruyor.
//
// Yöntem (yüzey parseli): parsel 2 m sıcaklık ve çiy noktasıyla yüzey basıncından kaldırılır; yoğuşma
// seviyesine (LCL) kadar kuru adyabat, sonra doymuş (psödo) adyabat. Kaldırma sıcaklık farkı sanal
// sıcaklıkla (Tv) hesaplanır.
//   CIN = Rd · Σ (Tv_parsel − Tv_çevre) · ln(p_alt / p_üst), yüzeyden serbest konveksiyon seviyesine (LFC)
//         kadar parselin çevreden soğuk kaldığı katmanlar; pozitif sayı olarak verilir (J/kg). LFC yoksa null.
//   LI  = T_çevre(500 hPa) − T_parsel(500 hPa) (°C).

const RD = 287.04;
const CP = 1005.7;
const KAPPA = RD / CP;
const EPS = 0.622;
const LV = 2.501e6;

// Doyma buhar basıncı (hPa), Bolton 1980; T °C
export function esat(tc) {
  return 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));
}
function mixing(e, p) {
  return (EPS * e) / (p - e);
}
function tv(tk, w) {
  return tk * (1 + w / EPS) / (1 + w);
}

// Doymuş adyabat: dT/dp (K/hPa), psödo-adyabatik yaklaşım
function moistLapse(tk, p) {
  const ws = mixing(esat(tk - 273.15), p);
  const num = (RD * tk + LV * ws) / p;
  const den = CP + (LV * LV * ws * EPS) / (RD * tk * tk);
  return num / den;
}

// Bolton (1980) LCL sıcaklığı (K)
function lclTemp(tk, tdk) {
  return 1 / (1 / (tdk - 56) + Math.log(tk / tdk) / 800) + 56;
}

// profile: [{ p (hPa), t (°C), rh (%) }] — yüzeyden yukarı herhangi sırayla; yüzey: { p, t, td }
// Dönüş: { cin, li, lcl, lfc } ya da veri yetersizse null
export function parcelIndices(surface, levels) {
  if (!surface || surface.p == null || surface.t == null || surface.td == null) return null;
  const env = levels
    .filter((l) => l.p != null && l.t != null && l.rh != null && l.p < surface.p - 1)
    .sort((a, b) => b.p - a.p)
    .map((l) => ({ p: l.p, tk: l.t + 273.15, w: mixing((Math.max(l.rh, 1) / 100) * esat(l.t), l.p) }));
  if (env.length < 3 || env[env.length - 1].p > 500) return null;
  const ps = surface.p;
  const t0 = surface.t + 273.15;
  const td0 = Math.min(surface.td, surface.t) + 273.15;
  const w0 = mixing(esat(td0 - 273.15), ps);
  const sEnv = { p: ps, tk: t0, w: w0 };
  const prof = [sEnv, ...env];

  const tl = lclTemp(t0, td0);
  const pl = ps * Math.pow(tl / t0, 1 / KAPPA);

  // ln p'de doğrusal ara değer: çevre (tk, w) — p azalan sırada
  function envAt(p) {
    for (let k = 0; k < prof.length - 1; k++) {
      const a = prof[k];
      const b = prof[k + 1];
      if (p <= a.p && p >= b.p) {
        const f = Math.log(a.p / p) / Math.log(a.p / b.p);
        return { tk: a.tk + f * (b.tk - a.tk), w: a.w + f * (b.w - a.w) };
      }
    }
    return null;
  }

  // Parseli 5 hPa adımlarla kaldır
  const top = prof[prof.length - 1].p;
  const step = 5;
  let p = ps;
  let tp = t0;
  let tParcel500 = null;
  let prevB = null;
  let prevP = ps;
  let cinAcc = 0;
  let lfc = null;
  while (p - step >= top) {
    const pn = p - step;
    if (pn >= pl) {
      tp = t0 * Math.pow(pn / ps, KAPPA);
    } else {
      // LCL'yi geçerken önce LCL'ye kuru, sonra doymuş
      let pc = p;
      let tc = p >= pl ? tl : tp;
      if (p > pl) pc = pl;
      // doymuş adyabatta pc'den pn'ye küçük adımlarla (RK2)
      let pp = pc;
      while (pp > pn + 1e-9) {
        const dp = Math.min(1, pp - pn);
        const k1 = moistLapse(tc, pp);
        const k2 = moistLapse(tc - k1 * dp * 0.5, pp - dp * 0.5);
        tc -= k2 * dp;
        pp -= dp;
      }
      tp = tc;
    }
    const e = envAt(pn);
    if (!e) break;
    const wp = pn >= pl ? w0 : mixing(esat(tp - 273.15), pn);
    const b = tv(tp, wp) - tv(e.tk, e.w);
    if (Math.abs(pn - 500) < step / 2) tParcel500 = tp;
    if (lfc == null) {
      if (b > 0 && pn < pl) {
        lfc = pn;
      } else if (b < 0) {
        const bm = prevB == null ? b : (b + prevB) / 2;
        cinAcc += RD * Math.min(0, bm) * Math.log(prevP / pn);
      }
    }
    prevB = b;
    prevP = pn;
    p = pn;
  }
  const e500 = envAt(500);
  const li = e500 && tParcel500 != null ? Math.round((e500.tk - tParcel500) * 10) / 10 : null;
  return {
    cin: lfc == null ? null : Math.round(-cinAcc),
    li,
    lcl: Math.round(pl),
    lfc: lfc == null ? null : Math.round(lfc),
  };
}

export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300];

// CIN sınıfı (Terimler): 0 engel yok · < 50 zayıf · 50–200 orta · > 200 güçlü
export function cinClass(v) {
  if (!(v > 0)) return 0;
  if (v < 50) return 1;
  if (v <= 200) return 2;
  return 3;
}

// LI sınıfı: > 0 kararlı · 0…−3 zayıf · −3…−6 orta · −6…−9 kuvvetli · < −9 aşırı
export function liClass(v) {
  if (v > 0) return 0;
  if (v > -3) return 1;
  if (v > -6) return 2;
  if (v > -9) return 3;
  return 4;
}
