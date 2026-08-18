import { slugify } from "./slugify";

export const FAV_KEY = "meridyen_favorites";

export function getFavorites() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

export function isFavorite(name) {
  return getFavorites().some((f) => f.name === name);
}

export function toggleFavorite({ name, lat, lon }) {
  let favs = getFavorites();
  if (isFavorite(name)) {
    favs = favs.filter((f) => f.name !== name);
  } else {
    favs.push({ name, lat, lon, slug: slugify(name) });
  }
  saveFavorites(favs);
  return favs;
}

export function removeFavorite(name) {
  saveFavorites(getFavorites().filter((f) => f.name !== name));
  return getFavorites();
}
