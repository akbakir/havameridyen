// Ana ekran widget'ına köprü (widget1). Widget uygulamada son bakılan konumu gösterir: konum değişince (ve uygulama
// her açıldığında) yerel HmWidget eklentisine bildirilir; eklenti gerekirse yeni veriyi çekip widget'ları yeniden
// çizer (android/app/src/main/java/com/havameridyen/app/widget). Tarayıcıda (npm run dev) hiçbir şey yapmaz.

import { Capacitor, registerPlugin } from "@capacitor/core";

const HmWidget = registerPlugin("HmWidget");
let last = "";

export function syncWidgetPlace(place) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
  if (Capacitor.getPlatform() !== "android") return;
  const key = `${place.name}|${place.lat}|${place.lon}`;
  if (key === last) return;
  last = key;
  HmWidget.setPlace({ name: place.name || "", lat: place.lat, lon: place.lon }).catch(() => {});
}
