// Open-Meteo kullanım özeti (8 Kas 2026, Ali Kemal): yalnız sahibine — /api/v1/usage?key=<USAGE_KEY>.
// Varsayılan küçük bir HTML sayfa; &format=json ile ham veri. Sayaç lib/usage.js'te (Upstash Redis).

import { timingSafeEqual } from "crypto";
import { usageSummary } from "../../../lib/usage";

function keyOk(given) {
  const want = process.env.USAGE_KEY || "";
  if (!want || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tr = (v) => Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

function html(s) {
  const max = Math.max(1, ...s.days.map((d) => d.calls));
  const bar = (v) => `<span class="b" style="width:${Math.round((v / max) * 100)}%"></span>`;
  const warn = (p) => (p >= 80 ? "red" : p >= 50 ? "amb" : "ok");
  const rows = s.days
    .map(
      (d) =>
        `<tr><td>${esc(d.date)}</td><td class="n">${tr(d.calls)}</td><td class="n">${tr(d.requests)}</td><td class="n">${tr((d.calls / s.limits.day) * 100)} %</td><td class="g">${bar(d.calls)}</td><td class="k">${esc(
          Object.entries(d.kinds)
            .map(([k, v]) => `${k} ${tr(v)}`)
            .join(" · ")
        )}</td></tr>`
    )
    .join("");
  const top = s.topToday.map((t) => `<li>${esc(t.place)} — ${t.requests} istek</li>`).join("") || "<li>henüz yok</li>";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Open-Meteo kullanımı</title><style>
body{font:14px/1.45 system-ui,Arial,sans-serif;margin:0;padding:16px;background:#F4F6F2;color:#1E3A3A}
h1{font-size:18px;margin:0 0 4px}.sub{color:#5a6b66;margin:0 0 14px;font-size:12px}
.cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}.card{background:#fff;border:1px solid #d9e0dc;border-radius:12px;padding:10px 14px;min-width:150px}
.card b{display:block;font-size:22px}.ok{color:#1F7A52}.amb{color:#B07413}.red{color:#B3261E}
table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;font-size:12.5px}
th,td{padding:6px 8px;border-bottom:1px solid #eef1ef;text-align:left;white-space:nowrap}th{background:#168BA0;color:#fff;font-weight:600}
.n{text-align:right;font-variant-numeric:tabular-nums}.g{width:30%}.b{display:block;height:8px;border-radius:4px;background:#168BA0}.k{color:#5a6b66;font-size:11px}
.wrap{overflow-x:auto}ul{margin:6px 0 0;padding-left:18px}</style></head><body>
<h1>Open-Meteo kullanımı</h1><p class="sub">Çağrı = Open-Meteo'nun ağırlıklı API çağrısı (değişken/10 × gün/14 × model). Ücretsiz katman: ${tr(s.limits.day)} / gün · ${tr(s.limits.month)} / ay. Günler TSİ.</p>
<div class="cards"><div class="card">Bugün<b class="${warn(s.today.pctOfDay)}">${tr(s.today.calls)}</b>günlük sınırın % ${tr(s.today.pctOfDay)}'i · ${tr(s.today.requests)} istek</div>
<div class="card">Bu ay (${esc(s.month.month)})<b class="${warn(s.month.pctOfMonth)}">${tr(s.month.calls)}</b>aylık sınırın % ${tr(s.month.pctOfMonth)}'i</div></div>
<div class="wrap"><table><thead><tr><th>Gün</th><th>Çağrı</th><th>İstek</th><th>Günlük sınır</th><th></th><th>Tür</th></tr></thead><tbody>${rows}</tbody></table></div>
<p><b>Bugün en çok istenen konumlar</b></p><ul>${top}</ul></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!keyOk(req.query.key)) return res.status(404).json({ error: "bulunamadı" });
  let s;
  try {
    s = await usageSummary(30);
  } catch (e) {
    return res.status(502).json({ error: "sayaç okunamadı" });
  }
  if (!s) return res.status(503).json({ error: "sayaç bağlı değil (KV_REST_API_URL / KV_REST_API_TOKEN yok)" });
  if (req.query.format === "json") return res.status(200).json(s);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html(s));
}
