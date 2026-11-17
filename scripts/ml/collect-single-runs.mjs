#!/usr/bin/env node
// Open-Meteo Single Runs toplayıcı (17 Kas 2026) — ML yol haritası.
// Her model × istasyon × ay için o aydaki BÜTÜN run'ların 0–191 saatlik tahminini indirir.
// Previous Runs yalnız 0–5, 24–29 … saatlik bantları veriyor; Single Runs aradaki uzaklıkları da tamamlar.
//
// Anahtar şart (OPEN_METEO_API_KEY ortam değişkeni; customer- sunucuları). Ek paket gerekmez (Node 18+).
//
//   node scripts/ml/collect-single-runs.mjs --probe     # 1. adım: model adları ve run saatleri (~40 çağrı)
//   node scripts/ml/collect-single-runs.mjs --plan      # kaç istek, kaç çağrı
//   node scripts/ml/collect-single-runs.mjs             # toplama (kaldığı yerden devam eder)
//   Seçenekler: --concurrency 6  --to 2026-10  --models ecmwf_ifs  --stations LTAC,M17190  --total 4800000
//
// Çıktı: ml-data/single/<model>/<istasyon>/<YYYY-MM>.json.gz
//   { model, api_model, station, lat, lon, elev, vars, scale, hours, runs: { "2026-06-01T00:00": "<base64 Int16LE>" | null } }
//   Her run: vars.length × hours değer, değişken sırasıyla art arda; değer = round(gerçek × scale), eksik = -32768.
//   Saat 0 = run başlangıcı (UTC).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "ml-data");
const SINGLE = path.join(OUT, "single");
const PROBE = path.join(SINGLE, "probe.json");
const KEY_USAGE = path.join(OUT, "key-usage.json");

// Canlıda kullandığımız model kimliği → Single Runs'ta denenecek adlar (ilk çalışan kullanılır)
const CANDIDATES = {
  gfs_seamless: ["gfs_seamless", "gfs_global", "gfs025"],
  icon_seamless: ["icon_seamless", "icon_global"],
  ukmo_seamless: ["ukmo_seamless", "ukmo_global_deterministic_10km"],
  meteofrance_seamless: ["meteofrance_seamless", "meteofrance_arpege_world"],
  gem_seamless: ["gem_seamless", "gem_global"],
  jma_gsm: ["jma_gsm", "jma_seamless"],
  ecmwf_aifs025_single: ["ecmwf_aifs025_single", "ecmwf_aifs025"],
  ecmwf_ifs: ["ecmwf_ifs", "ecmwf_ifs025"],
};
const START = { ecmwf_ifs: "2024-03-14" }; // diğerleri 2026-04-02 (Open-Meteo belgesi)
const DEFAULT_START = "2026-04-02";
const HOURS_TRY = ["00", "06", "12", "18"];

// 9 değişken (≤ 10) ve 8 gün (≤ 14) → her istek ağırlık 1
const VARS = ["temperature_2m", "wind_speed_10m", "wind_gusts_10m", "precipitation", "snowfall", "showers", "cloud_cover", "visibility", "cape"];
const SCALE = [10, 10, 10, 100, 100, 100, 1, 0.1, 1];
const DAYS = 8, HOURS = DAYS * 24, NA = -32768;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const KEY = (process.env.OPEN_METEO_API_KEY || "").trim();
const CONC = Number(opt("concurrency", 6));
const TOTAL_CAP = Number(opt("total", 4800000));
const TO = opt("to", "2026-10");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!KEY && !flag("plan")) { console.error("OPEN_METEO_API_KEY tanımlı değil; Single Runs yalnız anahtarla toplanır."); process.exit(1); }

const stations = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ml/stations.json"), "utf8"))
  .filter((s) => !opt("stations") || opt("stations").split(",").includes(s.id));
const models = opt("models") ? opt("models").split(",") : Object.keys(CANDIDATES);

// ---------- sayaç ----------
function keyUsage() { try { return JSON.parse(fs.readFileSync(KEY_USAGE, "utf8")).total || 0; } catch { return 0; } }
let usage = keyUsage();
function spend(w) {
  if (usage + w > TOTAL_CAP) return false;
  usage = Math.round((usage + w) * 100) / 100;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(KEY_USAGE, JSON.stringify({ total: usage, updated: new Date().toISOString() }));
  return true;
}

const url = (s, apiModel, run) =>
  `https://customer-single-runs-api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}` +
  `&hourly=${VARS.join(",")}&models=${apiModel}&run=${run}&forecast_days=${DAYS}&timezone=GMT&apikey=${encodeURIComponent(KEY)}`;

async function get(u) {
  for (let a = 1; ; a++) {
    let res;
    try { res = await fetch(u); } catch (e) { if (a <= 5) { await sleep(a * 5e3); continue; } throw e; }
    if (res.ok) return { ok: true, data: await res.json() };
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && a <= 6) { await sleep(a * 15e3); continue; }
    return { ok: false, status: res.status, reason: body.slice(0, 200) };
  }
}

function encode(h) {
  const buf = new Int16Array(VARS.length * HOURS).fill(NA);
  VARS.forEach((v, k) => {
    const arr = h[v] || [];
    for (let i = 0; i < Math.min(arr.length, HOURS); i++)
      if (arr[i] != null) buf[k * HOURS + i] = Math.max(-32767, Math.min(32767, Math.round(arr[i] * SCALE[k])));
  });
  return Buffer.from(buf.buffer).toString("base64");
}

// ---------- --probe ----------
if (flag("probe")) {
  const s = stations.find((x) => x.id === "LTAC") || stations[0];
  const day = "2026-06-01";
  const result = {};
  for (const m of models) {
    result[m] = null;
    for (const cand of CANDIDATES[m]) {
      if (!spend(1)) break;
      const r = await get(url(s, cand, `${day}T00:00`));
      const n = r.ok ? (r.data.hourly?.temperature_2m || []).filter((v) => v != null).length : 0;
      console.log(`${m} → ${cand}: ${r.ok ? `${n} dolu saat, ızgara ${r.data.latitude},${r.data.longitude} rakım ${r.data.elevation}` : `HTTP ${r.status} ${r.reason}`}`);
      if (r.ok && n > 0) {
        const hours = ["00"];
        for (const hh of HOURS_TRY.slice(1)) {
          if (!spend(1)) break;
          const q = await get(url(s, cand, `${day}T${hh}:00`));
          const k = q.ok ? (q.data.hourly?.temperature_2m || []).filter((v) => v != null).length : 0;
          if (k > 0) hours.push(hh);
        }
        result[m] = { api: cand, hours, filled: n, grid: [r.data.latitude, r.data.longitude, r.data.elevation] };
        console.log(`   run saatleri: ${hours.join(", ")}`);
        break;
      }
    }
  }
  fs.mkdirSync(SINGLE, { recursive: true });
  fs.writeFileSync(PROBE, JSON.stringify(result, null, 1));
  console.log(`\nKaydedildi: ml-data/single/probe.json. Anahtarla toplam harcanan: ${Math.round(usage)}`);
  process.exit(0);
}

// ---------- plan ----------
let probe = null;
try { probe = JSON.parse(fs.readFileSync(PROBE, "utf8")); } catch {}
if (!probe && !flag("plan")) { console.error("Önce --probe çalıştırın."); process.exit(1); }

function monthsBetween(start, to) {
  const out = [];
  let [y, m] = start.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const first = key === start.slice(0, 7) ? Number(start.slice(8, 10)) : 1;
    out.push({ key, days: Array.from({ length: nd - first + 1 }, (_, i) => `${key}-${String(first + i).padStart(2, "0")}`) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

const jobs = [];
for (const m of models) {
  const p = probe ? probe[m] : { api: m, hours: HOURS_TRY };
  if (!p) { console.log(`${m}: Single Runs'ta bulunamadı, atlanıyor.`); continue; }
  for (const s of stations) for (const mo of monthsBetween(START[m] || DEFAULT_START, TO)) {
    const file = path.join(SINGLE, m, s.id, `${mo.key}.json.gz`);
    jobs.push({ m, api: p.api, hours: p.hours, s, mo, file, n: mo.days.length * p.hours.length });
  }
}
const todo = jobs.filter((j) => !fs.existsSync(j.file));
const totalReq = todo.reduce((a, j) => a + j.n, 0);
console.log(`${stations.length} istasyon × ${models.length} model, ${TO}'e kadar: ${jobs.length} dosya; kalan ${todo.length} dosya ≈ ${totalReq.toLocaleString("tr-TR")} istek (ağırlık 1).`);
console.log(`Anahtarla toplam harcanan: ${Math.round(usage).toLocaleString("tr-TR")} / ${TOTAL_CAP.toLocaleString("tr-TR")}`);
if (flag("plan")) process.exit(0);

// ---------- toplama ----------
let done = 0, failedRuns = 0, stop = false;
const t0 = Date.now();
async function runJob(j) {
  const runs = {};
  for (const day of j.mo.days) for (const hh of j.hours) {
    if (stop) return false;
    if (!spend(1)) { stop = true; console.log(`\nToplam tavanına (${TOTAL_CAP}) ulaşıldı; durduruldu.`); return false; }
    const run = `${day}T${hh}:00`;
    const r = await get(url(j.s, j.api, run));
    if (r.ok) runs[run] = encode(r.data.hourly || {});
    else { runs[run] = null; failedRuns++; if (r.status === 401 || r.status === 403) { stop = true; console.log(`Anahtar reddedildi (HTTP ${r.status}).`); return false; } }
  }
  fs.mkdirSync(path.dirname(j.file), { recursive: true });
  const meta = { model: j.m, api_model: j.api, station: j.s.id, lat: j.s.lat, lon: j.s.lon, elev: j.s.elev, vars: VARS, scale: SCALE, hours: HOURS, runs };
  fs.writeFileSync(j.file + ".tmp", zlib.gzipSync(JSON.stringify(meta)));
  fs.renameSync(j.file + ".tmp", j.file); // yarım dosya kalmasın
  done++;
  const ok = Object.values(runs).filter(Boolean).length;
  const min = (Date.now() - t0) / 60000;
  console.log(`✓ ${j.m} ${j.s.id} ${j.mo.key} (${ok}/${Object.keys(runs).length} run) · ${done}/${todo.length} dosya · ${Math.round(usage)} çağrı · ${min.toFixed(0)} dk`);
  return true;
}
let idx = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (!stop && idx < todo.length) { const j = todo[idx++]; await runJob(j); }
}));
console.log(`Bitti: ${done} dosya, ${failedRuns} eksik run. Anahtarla toplam harcanan: ${Math.round(usage)}.`);
