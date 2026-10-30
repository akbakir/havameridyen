// Biçim ve tarih yardımcıları (Prototip 9 ile aynı yazım kuralları).
// Saatler sunucudan TSİ olarak gelir ("YYYY-MM-DDTHH:mm"); yerel saate çevrilmez, "Z" eklenmez.

export const DAYN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const MON = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const KT = 0.539957;
const CMP = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"];

export const pad = (n) => String(n).padStart(2, "0");

// Ondalık virgül; "-0" gösterilmez
export function fmt(v, d = 0) {
  if (v == null || !isFinite(v)) return "—";
  const t = v.toFixed(d);
  return (/^-0(\.0+)?$/.test(t) ? t.slice(1) : t).replace(".", ",");
}
export const fmtS = (v, d = 0) => fmt(v, d).replace("-", "−");

export const dir16 = (d) => (d == null ? "—" : CMP[Math.round(d / 22.5) % 16]);
// Rüzgar yönü yazısı (31 Ekim, Ali Kemal: "yön verilmemiş ve hız varsa VRB"): hız var ama yön yoksa VRB (değişken
// yönlü). Yön yok sayılır: 3 knot altındaki sakin rüzgar ya da modellerin yönleri birbirini götürünce. kmh verilirse
// 3 kt altı da VRB (tek model değerinde).
export const windDir = (d, kmh) => {
  if (kmh == null) return "—";
  if (d == null || kmh * KT < 3) return "VRB";
  return CMP[Math.round(d / 22.5) % 16];
};

// "2026-10-17T14:00" → { y, m (0–11), d, w (0 = Pazar), h, key: "2026-10-17" }
export function parseT(t) {
  const [, y, m, d, h] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(t) || [];
  const w = new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay();
  return { y: +y, m: +m - 1, d: +d, w, h: +h, key: t.slice(0, 10) };
}

// Kart başlığı (29 Ekim, stil birliği; Günlük karttaki gibi): "PAZAR · 25 EKİM · 14:00"
export const heroTitle = (t) => {
  const p = parseT(t);
  return `${DAYN[p.w].toLocaleUpperCase("tr")} · ${p.d} ${MON[p.m].toLocaleUpperCase("tr")} · ${pad(p.h)}:00`;
};

export const whenText = (t) => {
  const p = parseT(t);
  return `${p.d} ${MON[p.m]} ${DAYN[p.w]} · ${pad(p.h)}:00 TSİ`;
};

// Şu anki TSİ saati "YYYY-MM-DDTHH" (cihazın saat diliminden bağımsız)
export function tsiNowHour() {
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 13);
}

// Türkçe iyelik eki ("5 modelin 4'ü")
export const tsuf = (n) => ({ 0: "ı", 1: "i", 2: "si", 3: "ü", 4: "ü", 5: "i", 6: "sı", 7: "si", 8: "i", 9: "u" })[n % 10] || "i";

export const speed = (kmh, unit) => (kmh == null ? null : unit === "kt" ? kmh * KT : kmh);
export const unitLabel = (unit) => (unit === "kt" ? "kt" : "km/s");
