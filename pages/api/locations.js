export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q
    )}&count=5&language=tr&format=json`;
    const r = await fetch(url);
    const raw = await r.json();

    const results = (raw.results || []).map((loc) => ({
      name: loc.name,
      admin1: loc.admin1 || null,
      country: loc.country,
      lat: loc.latitude,
      lon: loc.longitude,
    }));

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    res.status(200).json({ results });
  } catch (e) {
    res.status(502).json({ error: "Lokasyon araması başarısız" });
  }
}
