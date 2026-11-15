#!/usr/bin/env node
// Open-Meteo Previous Runs toplayıcı (15 Kas 2026) — ML yol haritası, adım 1.
// Her istasyon × model × ay için 1–7 gün önceki tahminleri indirir; kaldığı yerden devam eder.
//
// Kullanım (depo kökünden, Node 18+; ek paket gerekmez):
//   node scripts/ml/collect-previous-runs.mjs --plan                # yalnız hesap: kaç çağrı, kaç gün
//   node scripts/ml/collect-previous-runs.mjs --check-ifs           # canlı IFS = arşiv IFS mi? (~10 çağrı)
//   node scripts/ml/collect-previous-runs.mjs                       # 1. grup (sıcaklık + rüzgâr)
//   node scripts/ml/collect-previous-runs.mjs --group hava          # 2. grup (yağış, kar, bulut, görüş, CAPE)
//   Seçenekler: --daily 6000  --from 2024-01  --to 2026-10  --stations LTAC,LTCE  --models ecmwf_ifs
//
// Bütçe (15 Kas sayaç verisi): günlük sınır 10.000; sitenin en yüksek günü ~2.900 (13 Kas);
// %10 pay (1.000) bırakılınca toplayıcıya günde ~6.000 ağırlıklı çağrı kalır. Aylık: site ≤ ~87 bin +
// toplayıcı ≤ 180 bin < 270 bin (300 binin %90'ı). Saatlik (5.000) ve dakikalık (600) sınırlar için de pay bırakılır.
// Harcama ml-data/ledger.json'da 24 saatlik kayan pencereyle tutulur; günlük bütçe dolunca betik durur,
// ertesi gün aynı komutla kaldığı yerden devam eder.
//
// Çıktı: ml-data/prev/<grup>/<model>/<istasyon>/<YYYY-MM>.json.gz (git dışında). Saatler UTC (gözlemlerle eşleşsin).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "ml-data");
const LEDGER = path.join(OUT, "ledger.json");

const MODELS = [
  "ecmwf_ifs", "gfs_seamless", "icon_seamless", "ukmo_seamless",
  "meteofrance_seamless", "gem_seamless", "jma_gsm", "ecmwf_aifs025_single",
];
const GROUPS = {
  // Sıcaklık + rüzgâr (ilk hedef; gözlemi bol): 3 değişken × 8 öncü = 24 → ağırlık 2,4
  "sicaklik-ruzgar": ["temperature_2m", "wind_speed_10m", "wind_gusts_10m"],
  // Hava durumu + yağış: sitenin hadise kuralları bu değişkenlerden üretilir. 6 × 8 = 48 → ağırlık 4,8
  hava: ["precipitation", "snowfall", "showers", "cloud_cover", "visibility", "cape"],
};
const LEADS = [1, 2, 3, 4, 5, 6, 7]; // previous_dayN; temel değişken (öncü 0) da istenir

// ---------- argümanlar ----------
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const GROUP = opt("group", "sicaklik-ruzgar");
const DAILY = Number(opt("daily", 6000));
const HOURLY_CAP = Number(opt("hourly", 4000));
const MINUTE_CAP = Number(opt("minute", 450));
const today = new Date();
const lastFull = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)); // geçen ay
const FROM = opt("from", "2024-01");
const TO = opt("to", `${lastFull.getUTCFullYear()}-${String(lastFull.getUTCMonth() + 1).padStart(2, "0")}`);
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ml/stations.json"), "utf8"))
  .filter((s) => !opt("stations") || opt("stations").split(",").includes(s.id));
const models = opt("models") ? opt("models").split(",") : MODELS;
if (!GROUPS[GROUP]) { console.error(`Bilinmeyen grup: ${GROUP} (${Object.keys(GROUPS).join(", ")})`); process.exit(1); }

const varsOf = (base) => base.flatMap((v) => [v, ...LEADS.map((n) => `${v}_previous_day${n}`)]);
const VARS = varsOf(GROUPS[GROUP]);

// Open-Meteo ağırlığı (Paket A sayacıyla aynı): max(1, değişken/10) × max(1, gün/14) × model × konum
const weight = (nVars, nDays) => Math.max(1, nVars / 10) * Math.max(1, nDays / 14);

function months(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({ key: `${y}-${String(m).padStart(2, "0")}`, start, end: `${start.slice(0, 8)}${days}`, days });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ---------- bütçe defteri ----------
function loadLedger() { try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch { return []; } }
function saveLedger(l) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l)); }
const spentSince = (l, ms) => { const t = Date.now() - ms; return l.filter((e) => e.t >= t).reduce((a, e) => a + e.w, 0); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function spend(ledger, w) {
  for (;;) {
    if (spentSince(ledger, 864e5) + w > DAILY) return false;
    if (spentSince(ledger, 36e5) + w > HOURLY_CAP) { process.stdout.write("  saatlik pay dolu, 5 dk bekleniyor…\n"); await sleep(300e3); continue; }
    if (spentSince(ledger, 60e3) + w > MINUTE_CAP) { await sleep(15e3); continue; }
    ledger.push({ t: Date.now(), w: Math.round(w * 100) / 100 });
    // 48 saatten eski kayıtları at
    const cut = Date.now() - 2 * 864e5;
    while (ledger.length && ledger[0].t < cut) ledger.shift();
    saveLedger(ledger);
    return true;
  }
}

async function getJSON(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    if (res.status === 429 && attempt <= 5) { console.log(`  429 (sınır), ${attempt * 60} sn bekleniyor`); await sleep(attempt * 60e3); continue; }
    if (res.status >= 500 && attempt <= 3) { await sleep(attempt * 10e3); continue; }
    const err = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`); err.status = res.status; throw err;
  }
}

const prevUrl = (s, model, start, end, vars) =>
  `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}` +
  `&hourly=${vars.join(",")}&models=${model}&start_date=${start}&end_date=${end}&timezone=GMT`;

// ---------- --plan ----------
const MONTHS = months(FROM, TO);
const jobs = [];
for (const model of models) for (const s of stations) for (const mo of MONTHS) {
  const file = path.join(OUT, "prev", GROUP, model, s.id, `${mo.key}.json.gz`);
  jobs.push({ model, s, mo, file, w: weight(VARS.length, mo.days) });
}
const todo = jobs.filter((j) => !fs.existsSync(j.file) && !fs.existsSync(j.file + ".err"));
const total = todo.reduce((a, j) => a + j.w, 0);
console.log(`Grup ${GROUP}: ${GROUPS[GROUP].join(", ")} × öncü 0–7 (${VARS.length} değişken)`);
console.log(`${stations.length} istasyon × ${models.length} model × ${MONTHS.length} ay (${FROM} … ${TO}) = ${jobs.length} istek`);
console.log(`Kalan: ${todo.length} istek ≈ ${Math.round(total).toLocaleString("tr-TR")} ağırlıklı çağrı ≈ ${Math.ceil(total / DAILY)} gün (günde ${DAILY})`);

if (flag("plan")) process.exit(0);

// ---------- --check-ifs ----------
// Canlı uç (api.open-meteo.com, ecmwf_ifs) ile Previous Runs'ın temel değişkeni (öncü 0) son 2 günde aynı mı?
// Aynıysa arşiv ile canlı aynı IFS ürünü; farklıysa eğitim verisi canlıdan farklı çözünürlükte olabilir.
if (flag("check-ifs")) {
  const ledger = loadLedger();
  const pick = stations.filter((s) => ["LTAC", "LTBA", "LTCF", "LTAI", "LTCE"].includes(s.id));
  for (const s of pick) {
    if (!(await spend(ledger, 2))) { console.log("Günlük bütçe dolu."); break; }
    const q = `latitude=${s.lat}&longitude=${s.lon}&hourly=temperature_2m,wind_speed_10m&models=ecmwf_ifs&past_days=2&forecast_days=1&timezone=GMT`;
    const live = await getJSON(`https://api.open-meteo.com/v1/forecast?${q}`);
    const prev = await getJSON(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}`);
    const a = live.hourly, b = prev.hourly;
    let n = 0, same = 0, maxd = 0;
    a.time.forEach((t, i) => {
      const j = b.time.indexOf(t);
      if (j < 0 || a.temperature_2m[i] == null || b.temperature_2m[j] == null) return;
      n++; const d = Math.abs(a.temperature_2m[i] - b.temperature_2m[j]); if (d < 0.05) same++; maxd = Math.max(maxd, d);
    });
    console.log(`${s.name.padEnd(18)} ızgara canlı ${live.latitude},${live.longitude} rakım ${live.elevation} | arşiv ${prev.latitude},${prev.longitude} rakım ${prev.elevation} | ${same}/${n} saat aynı, en büyük fark ${maxd.toFixed(1)}°`);
  }
  console.log("Not: geçmiş saatlerde canlı uç da en son koşuyu gösterir; birebir eşleşme beklenir. Izgara noktası/rakım farklıysa çözünürlük farklıdır.");
  process.exit(0);
}

// ---------- toplama ----------
const ledger = loadLedger();
console.log(`Son 24 saatte harcanan: ${Math.round(spentSince(ledger, 864e5))} / ${DAILY}`);
let done = 0, failed = 0, spentNow = 0;
for (const j of todo) {
  if (!(await spend(ledger, j.w))) {
    console.log(`\nGünlük bütçe doldu (${DAILY}). Bugün ${done} istek, ~${Math.round(spentNow)} çağrı. Yarın aynı komutla devam edin.`);
    break;
  }
  spentNow += j.w;
  try {
    const data = await getJSON(prevUrl(j.s, j.model, j.mo.start, j.mo.end, VARS));
    fs.mkdirSync(path.dirname(j.file), { recursive: true });
    const h = data.hourly || {};
    const nonNull = (h[GROUPS[GROUP][0]] || []).filter((v) => v != null).length;
    const slim = { lat: data.latitude, lon: data.longitude, elev: data.elevation, model: j.model, station: j.s.id, hourly: h };
    fs.writeFileSync(j.file, zlib.gzipSync(JSON.stringify(slim)));
    done++;
    process.stdout.write(`✓ ${j.model} ${j.s.id} ${j.mo.key} (${nonNull} dolu saat)\n`);
  } catch (e) {
    failed++;
    fs.mkdirSync(path.dirname(j.file), { recursive: true });
    // 400 (model o tarihte yok vb.) kalıcı hata: işaretlenir, tekrar denenmez. Diğerleri sonraki çalıştırmada yeniden denenir.
    if (e.status === 400) fs.writeFileSync(j.file + ".err", String(e.message));
    console.log(`✗ ${j.model} ${j.s.id} ${j.mo.key}: ${e.message}`);
  }
}
const left = jobs.filter((j) => !fs.existsSync(j.file) && !fs.existsSync(j.file + ".err"));
console.log(`Bitti: ${done} başarılı, ${failed} hatalı. Kalan ${left.length} istek ≈ ${Math.round(left.reduce((a, j) => a + j.w, 0))} çağrı.`);
