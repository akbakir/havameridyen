export function slugify(name) {
  const map = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
  return name
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] || ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function cityHref({ name, lat, lon, slug }) {
  const s = slug || slugify(name);
  return `/${s}?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`;
}

export const HOME_CITIES = [
  { name: "İstanbul", lat: 41.01, lon: 28.98 },
  { name: "Ankara", lat: 39.93, lon: 32.86 },
  { name: "İzmir", lat: 38.42, lon: 27.14 },
  { name: "Antalya", lat: 36.9, lon: 30.71 },
  { name: "Bursa", lat: 40.18, lon: 29.06 },
];

export const CITY_CHIPS = [
  { name: "İzmir", lat: 38.42, lon: 27.14 },
  { name: "İstanbul", lat: 41.01, lon: 28.98 },
  { name: "Ankara", lat: 39.93, lon: 32.86 },
  { name: "Antalya", lat: 36.9, lon: 30.71 },
];
