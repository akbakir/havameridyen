// /api/v1 uçları için CORS (sunucu madde 2b / 5, Ekim 2026): yalnız Capacitor uygulaması ve yerel geliştirme.
// Android: https://localhost, iOS: capacitor://localhost. Tarayıcıdaki web sitesi aynı kökten çağırdığı için CORS gerekmez.

export const ALLOWED_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

export function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Vary", "Origin");
}
