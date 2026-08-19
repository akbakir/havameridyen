import { getForecast, MODELS, defaultActiveModelIds } from "../../lib/forecast";

const VALID_PERIODS = new Set(["hourly", "3d", "7d", "16d"]);
const VALID_IDS = new Set(MODELS.map((m) => m.id));

function parseModelIds(modelsQuery) {
  if (!modelsQuery || typeof modelsQuery !== "string") return defaultActiveModelIds();
  const parsed = modelsQuery
    .split(",")
    .map((id) => id.trim())
    .filter((id) => VALID_IDS.has(id));
  return parsed.length ? parsed : defaultActiveModelIds();
}

export default async function handler(req, res) {
  const { lat, lon, period = "3d", name, models } = req.query;

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
    return res.status(400).json({ error: "lat ve lon parametreleri gerekli" });
  }
  if (!VALID_PERIODS.has(period)) {
    return res.status(400).json({ error: "geçersiz period (hourly|3d|7d|16d)" });
  }

  try {
    const forecast = await getForecast(latNum, lonNum, period, parseModelIds(models));
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).json({
      location: { name: name || null, lat: latNum, lon: lonNum },
      ...forecast,
    });
  } catch (e) {
    res.status(502).json({ error: "Hava tahmin verisi alınamadı" });
  }
}
