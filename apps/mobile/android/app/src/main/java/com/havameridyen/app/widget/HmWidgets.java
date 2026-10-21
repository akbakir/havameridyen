package com.havameridyen.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import com.havameridyen.app.MainActivity;
import com.havameridyen.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * havameridyen ana ekran widget'ları (widget1, 21 Ekim 2026).
 *
 * Veri: /api/v1/forecast, varsayılan 5 model (ECMWF, GFS, ICON, UKMO, ARPEGE), 5 gün. Gösterilen her şey sunucunun
 * consensus alanından gelir (ortanca + uyum, lib/consensus.js); burada hesap yapılmaz, yalnız ekrana yerleştirilir.
 * Konum: uygulamada son bakılan (HmWidgetPlugin.setPlace yazar); yoksa İzmit.
 * Yanıtın küçük bir özeti cihazda saklanır; ağ yokken widget saat ilerledikçe bu özetten çizilir.
 */
public final class HmWidgets {
    private HmWidgets() {}

    static final String PREFS = "hm_widget";
    private static final String K_NAME = "place_name";
    private static final String K_LAT = "place_lat";
    private static final String K_LON = "place_lon";
    private static final String K_DATA = "data";
    private static final String API =
        "https://havameridyen.com/api/v1/forecast?lat=%s&lon=%s&days=5&models=ecmwf_ifs,gfs_seamless,icon_seamless,ukmo_seamless,meteofrance_seamless";
    private static final long STALE_MS = 30L * 60L * 1000L; // 30 dk'dan yeni veri varsa yeniden çekilmez
    private static final int KEEP_HOURS = 96;

    static final int KIND_K = 0, KIND_G1 = 1, KIND_G2 = 2, KIND_I = 3;
    private static final int[] LAYOUT = {
        R.layout.hm_widget_kucuk, R.layout.hm_widget_saat, R.layout.hm_widget_gun, R.layout.hm_widget_ince
    };
    private static final Class<?>[] PROVIDER = {KucukWidget.class, SaatWidget.class, GunWidget.class, InceWidget.class};

    private static final int[] H_T = {R.id.w_h0_t, R.id.w_h1_t, R.id.w_h2_t, R.id.w_h3_t, R.id.w_h4_t};
    private static final int[] H_I = {R.id.w_h0_i, R.id.w_h1_i, R.id.w_h2_i, R.id.w_h3_i, R.id.w_h4_i};
    private static final int[] H_V = {R.id.w_h0_v, R.id.w_h1_v, R.id.w_h2_v, R.id.w_h3_v, R.id.w_h4_v};
    private static final int[] D_N = {R.id.w_d0_n, R.id.w_d1_n, R.id.w_d2_n, R.id.w_d3_n};
    private static final int[] D_I = {R.id.w_d0_i, R.id.w_d1_i, R.id.w_d2_i, R.id.w_d3_i};
    private static final int[] D_MAX = {R.id.w_d0_max, R.id.w_d1_max, R.id.w_d2_max, R.id.w_d3_max};
    private static final int[] D_MIN = {R.id.w_d0_min, R.id.w_d1_min, R.id.w_d2_min, R.id.w_d3_min};
    private static final int[] D_BAR = {R.id.w_d0_bar, R.id.w_d1_bar, R.id.w_d2_bar, R.id.w_d3_bar};
    private static final int[] D_BARC = {R.id.w_d0_barc, R.id.w_d1_barc, R.id.w_d2_barc, R.id.w_d3_barc};
    private static final String[] WEEKDAY = {"Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"};

    // Uyum renkleri: uygulamadaki Sayfa 1 çubuğu (views/P1.jsx AG_COL)
    private static final int COL_OK = 0xFFDDE0DB, COL_PARTIAL = 0xFFF0C98A, COL_SPLIT = 0xFFD98E2B;

    private static final Object LOCK = new Object();

    // ---- konum -------------------------------------------------------------------------------------------------

    /** Uygulamanın bildirdiği konumu kaydeder; konum değiştiyse true (önbellek de geçersiz olur). */
    public static boolean savePlace(Context ctx, String name, double lat, double lon) {
        SharedPreferences p = prefs(ctx);
        String key = String.format(Locale.US, "%.2f,%.2f", lat, lon);
        String old = String.format(Locale.US, "%.2f,%.2f", Double.longBitsToDouble(p.getLong(K_LAT, Double.doubleToLongBits(40.77))),
            Double.longBitsToDouble(p.getLong(K_LON, Double.doubleToLongBits(29.94))));
        boolean changed = !key.equals(old) || !p.contains(K_LAT);
        SharedPreferences.Editor e = p.edit()
            .putString(K_NAME, name == null || name.isEmpty() ? "Konum" : name)
            .putLong(K_LAT, Double.doubleToLongBits(lat))
            .putLong(K_LON, Double.doubleToLongBits(lon));
        if (changed) e.remove(K_DATA);
        e.apply();
        return changed;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String placeName(Context ctx) {
        return prefs(ctx).getString(K_NAME, "İzmit");
    }

    // ---- veri --------------------------------------------------------------------------------------------------

    /** Önbellek eskiyse sunucudan yeni veri çeker. Ağ iş parçacığında çağrılmalı. Yeni veri geldiyse true. */
    public static boolean refreshIfStale(Context ctx) {
        synchronized (LOCK) {
            JSONObject d = cached(ctx);
            if (d != null && System.currentTimeMillis() - d.optLong("fetched", 0) < STALE_MS) return false;
            return fetch(ctx);
        }
    }

    /** Sunucudan veri çekip özetini saklar. Ağ iş parçacığında çağrılmalı. */
    public static boolean fetch(Context ctx) {
        SharedPreferences p = prefs(ctx);
        double lat = Double.longBitsToDouble(p.getLong(K_LAT, Double.doubleToLongBits(40.77)));
        double lon = Double.longBitsToDouble(p.getLong(K_LON, Double.doubleToLongBits(29.94)));
        HttpURLConnection c = null;
        try {
            URL url = new URL(String.format(Locale.US, API, String.format(Locale.US, "%.2f", lat), String.format(Locale.US, "%.2f", lon)));
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(12000);
            c.setRequestProperty("Accept", "application/json");
            if (c.getResponseCode() != 200) return false;
            JSONObject r;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                r = new JSONObject(new String(b.toByteArray(), StandardCharsets.UTF_8));
            }
            JSONObject s = summarize(r);
            p.edit().putString(K_DATA, s.toString()).apply();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // Yanıtın widget'ın kullandığı kısmı: saat, ortanca sıcaklık ve ortak durum; günlük min/maks ve günün durumu.
    private static JSONObject summarize(JSONObject r) throws Exception {
        JSONArray time = r.getJSONArray("time");
        JSONObject cons = r.getJSONObject("consensus");
        JSONArray hourly = cons.getJSONArray("hourly");
        JSONArray daily = cons.getJSONArray("daily");
        JSONArray h = new JSONArray();
        int n = Math.min(Math.min(time.length(), hourly.length()), KEEP_HOURS);
        for (int i = 0; i < n; i++) {
            JSONObject x = hourly.getJSONObject(i);
            JSONObject o = new JSONObject();
            o.put("t", time.getString(i));
            o.put("temp", val(x.optJSONObject("temp")));
            putCond(o, x.optJSONObject("cond"));
            h.put(o);
        }
        JSONArray d = new JSONArray();
        for (int i = 0; i < daily.length(); i++) {
            JSONObject x = daily.getJSONObject(i);
            JSONObject o = new JSONObject();
            o.put("date", x.getString("date"));
            o.put("max", val(x.optJSONObject("temp_max")));
            o.put("min", val(x.optJSONObject("temp_min")));
            putCond(o, x.optJSONObject("cond"));
            d.put(o);
        }
        JSONObject s = new JSONObject();
        s.put("tz", r.optString("timezone", "Europe/Istanbul"));
        s.put("fetched", System.currentTimeMillis());
        s.put("h", h);
        s.put("d", d);
        return s;
    }

    private static Object val(JSONObject p) {
        if (p == null || p.isNull("v")) return JSONObject.NULL;
        return p.optDouble("v");
    }

    private static void putCond(JSONObject o, JSONObject c) throws Exception {
        if (c == null) return;
        o.put("ic", c.optString("ic", ""));
        o.put("wet", c.optBoolean("wet", false));
        o.put("text", c.optString("text", ""));
        o.put("level", c.optString("level", "na"));
    }

    private static JSONObject cached(Context ctx) {
        String s = prefs(ctx).getString(K_DATA, null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- çizim -------------------------------------------------------------------------------------------------

    /** Ana ekrandaki bütün havameridyen widget'larını önbellekteki veriyle yeniden çizer. */
    public static void renderAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        JSONObject d = cached(ctx);
        for (int k = 0; k < PROVIDER.length; k++) {
            int[] ids = m.getAppWidgetIds(new ComponentName(ctx, PROVIDER[k]));
            if (ids == null || ids.length == 0) continue;
            m.updateAppWidget(ids, build(ctx, k, d));
        }
    }

    /** Ağdan yeni veri çekip (gerekirse) yeniden çizer; arka planda çalışır. */
    public static void refreshAsync(Context ctx, final boolean force) {
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            boolean got = force ? fetch(app) : refreshIfStale(app);
            if (got) renderAll(app);
        }, "hm-widget").start();
    }

    private static RemoteViews build(Context ctx, int kind, JSONObject d) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUT[kind]);
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.w_root,
            PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        String place = placeName(ctx);
        if (kind != KIND_I) v.setTextViewText(R.id.w_place, place);

        JSONArray h = d == null ? null : d.optJSONArray("h");
        int i = h == null ? -1 : nowIndex(h, d.optString("tz", "Europe/Istanbul"));
        if (i < 0) {
            // Veri yok ya da süresi geçmiş: yer tutucu
            v.setInt(R.id.w_root, "setBackgroundResource", R.drawable.wsky_nodata);
            v.setImageViewResource(R.id.w_icon, R.drawable.wx_cloud);
            v.setTextViewText(R.id.w_temp, "—");
            v.setTextViewText(R.id.w_cond, d == null ? "Veri bekleniyor" : "Veri eski");
            if (kind == KIND_K || kind == KIND_G2) v.setTextViewText(R.id.w_time, "");
            if (kind == KIND_K || kind == KIND_G1) v.setTextViewText(R.id.w_minmax, "");
            if (kind == KIND_I) v.setTextViewText(R.id.w_minmax, place);
            if (kind != KIND_G2) v.setViewVisibility(R.id.w_dot, View.GONE);
            if (kind == KIND_K || kind == KIND_I) v.setTextViewText(R.id.w_agree, "");
            if (kind == KIND_G1) for (int k = 0; k < 5; k++) hideSlot(v, k);
            if (kind == KIND_G2) for (int k = 0; k < 4; k++) hideDay(v, k);
            return v;
        }

        JSONObject now = h.optJSONObject(i);
        int hour = hourOf(now.optString("t"));
        Look look = look(now, hour);
        v.setInt(R.id.w_root, "setBackgroundResource", look.sky);
        v.setImageViewResource(R.id.w_icon, look.icon);
        v.setTextViewText(R.id.w_temp, deg(now));
        v.setTextViewText(R.id.w_cond, now.optString("text", ""));
        String hh = now.optString("t").length() >= 16 ? now.optString("t").substring(11, 16) : "";
        if (kind == KIND_K || kind == KIND_G2) v.setTextViewText(R.id.w_time, hh);

        JSONArray days = d.optJSONArray("d");
        JSONObject today = dayOf(days, now.optString("t"));
        String mm = today == null ? "" : deg(today, "max") + " / " + deg(today, "min");
        if (kind == KIND_K || kind == KIND_G1) v.setTextViewText(R.id.w_minmax, mm);
        if (kind == KIND_I) v.setTextViewText(R.id.w_minmax, mm.isEmpty() ? place : mm + " · " + place); // dar ekranda konum kısalır, sıcaklık kalır

        String level = now.optString("level", "na");
        if (kind != KIND_G2) {
            int col = levelColor(level);
            v.setViewVisibility(R.id.w_dot, col == 0 ? View.GONE : View.VISIBLE);
            if (col != 0) v.setInt(R.id.w_dot, "setColorFilter", col);
        }
        if (kind == KIND_K || kind == KIND_I) v.setTextViewText(R.id.w_agree, levelText(level));

        if (kind == KIND_G1) {
            for (int k = 0; k < 5; k++) {
                int j = i + 1 + 3 * k;
                JSONObject s = j < h.length() ? h.optJSONObject(j) : null;
                if (s == null) {
                    hideSlot(v, k);
                    continue;
                }
                int sh = hourOf(s.optString("t"));
                v.setViewVisibility(H_T[k], View.VISIBLE);
                v.setViewVisibility(H_I[k], View.VISIBLE);
                v.setViewVisibility(H_V[k], View.VISIBLE);
                v.setTextViewText(H_T[k], String.format(Locale.US, "%02d", sh));
                v.setImageViewResource(H_I[k], look(s, sh).icon);
                v.setTextViewText(H_V[k], deg(s));
            }
        }

        if (kind == KIND_G2) {
            int d0 = dayIndex(days, now.optString("t"));
            for (int k = 0; k < 4; k++) {
                JSONObject x = days == null || d0 < 0 || d0 + k >= days.length() ? null : days.optJSONObject(d0 + k);
                if (x == null || x.isNull("max")) {
                    hideDay(v, k);
                    continue;
                }
                v.setViewVisibility(D_N[k], View.VISIBLE);
                v.setViewVisibility(D_I[k], View.VISIBLE);
                v.setViewVisibility(D_MAX[k], View.VISIBLE);
                v.setViewVisibility(D_MIN[k], View.VISIBLE);
                v.setTextViewText(D_N[k], k == 0 ? "Bugün" : weekday(x.optString("date")));
                v.setImageViewResource(D_I[k], x.has("ic") ? look(x, 12).icon : R.drawable.wx_cloud);
                v.setTextViewText(D_MAX[k], deg(x, "max"));
                v.setTextViewText(D_MIN[k], deg(x, "min"));
                int col = levelColor(x.optString("level", "na"));
                v.setViewVisibility(D_BAR[k], col == 0 ? View.INVISIBLE : View.VISIBLE);
                if (col != 0) v.setInt(D_BARC[k], "setColorFilter", col); // çubuk koyu yatağın (D_BAR) içinde
            }
        }
        return v;
    }

    private static void hideSlot(RemoteViews v, int k) {
        v.setViewVisibility(H_T[k], View.INVISIBLE);
        v.setViewVisibility(H_I[k], View.INVISIBLE);
        v.setViewVisibility(H_V[k], View.INVISIBLE);
    }

    private static void hideDay(RemoteViews v, int k) {
        v.setViewVisibility(D_N[k], View.INVISIBLE);
        v.setViewVisibility(D_I[k], View.INVISIBLE);
        v.setViewVisibility(D_MAX[k], View.INVISIBLE);
        v.setViewVisibility(D_MIN[k], View.INVISIBLE);
        v.setViewVisibility(D_BAR[k], View.INVISIBLE);
    }

    // Şimdiki saatin sırası (yanıtın saat dilimiyle, "YYYY-MM-DDTHH:00"); veri bitmişse -1
    private static int nowIndex(JSONArray h, String tz) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH':00'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone(tz));
        String now = f.format(new Date());
        int best = -1;
        for (int i = 0; i < h.length(); i++) {
            String t = h.optJSONObject(i).optString("t");
            if (t.compareTo(now) <= 0) best = i;
            else break;
        }
        if (best < 0 && h.length() > 0) best = 0; // veri gelecekte başlıyorsa ilk saat
        if (best == h.length() - 1 && !h.optJSONObject(best).optString("t").startsWith(now.substring(0, 13))) return -1;
        return best;
    }

    private static int hourOf(String t) {
        try {
            return Integer.parseInt(t.substring(11, 13));
        } catch (Exception e) {
            return 12;
        }
    }

    private static int dayIndex(JSONArray days, String t) {
        if (days == null || t.length() < 10) return -1;
        String k = t.substring(0, 10);
        for (int i = 0; i < days.length(); i++) if (k.equals(days.optJSONObject(i).optString("date"))) return i;
        return -1;
    }

    private static JSONObject dayOf(JSONArray days, String t) {
        int i = dayIndex(days, t);
        return i < 0 ? null : days.optJSONObject(i);
    }

    private static String weekday(String date) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            c.setTime(f.parse(date));
            return WEEKDAY[c.get(Calendar.DAY_OF_WEEK) - 1];
        } catch (Exception e) {
            return "";
        }
    }

    private static String deg(JSONObject o) {
        return deg(o, "temp");
    }

    private static String deg(JSONObject o, String key) {
        if (o == null || o.isNull(key) || !o.has(key)) return "—";
        return Math.round(o.optDouble(key)) + "°";
    }

    private static int levelColor(String l) {
        switch (l) {
            case "ok": return COL_OK;
            case "partial": return COL_PARTIAL;
            case "split": return COL_SPLIT;
            default: return 0;
        }
    }

    private static String levelText(String l) {
        switch (l) {
            case "ok": return "hemfikir";
            case "partial": return "kısmen";
            case "split": return "ayrışıyor";
            default: return "";
        }
    }

    // ---- ikon ve gökyüzü: uygulamadaki condView ile aynı kural (src/icons.jsx) ---------------------------------

    private static final class Look {
        final int icon, sky;

        Look(int icon, int sky) {
            this.icon = icon;
            this.sky = sky;
        }
    }

    private static Look look(JSONObject c, int h) {
        String ic = c.optString("ic", "");
        if (ic.isEmpty()) return new Look(R.drawable.wx_cloud, R.drawable.wsky_nodata);
        if (c.optBoolean("wet", false)) {
            int icon;
            switch (ic) {
                case "shower": icon = R.drawable.wx_rain_heavy; break;
                case "storm": icon = R.drawable.wx_storm; break;
                case "snow": icon = R.drawable.wx_snow; break;
                case "snowshower": icon = R.drawable.wx_snow_heavy; break;
                case "snowstorm": icon = R.drawable.wx_snow_storm; break;
                default: icon = R.drawable.wx_rain;
            }
            return new Look(icon, ic.startsWith("snow") ? R.drawable.wsky_snow : R.drawable.wsky_rain);
        }
        String base = ic.endsWith("N") ? ic.substring(0, ic.length() - 1) : ic;
        int k;
        switch (base) {
            case "clear": k = 0; break;
            case "few": k = 1; break;
            case "part": k = 2; break;
            case "over": k = 4; break;
            default: k = 3;
        }
        String ph = h >= 8 && h <= 17 ? "day" : (h == 6 || h == 7) ? "dawn" : (h == 18 || h == 19) ? "dusk" : "night";
        boolean night = ph.equals("night");
        int icon = k == 0 ? (night ? R.drawable.wx_moon : R.drawable.wx_sun)
            : k <= 2 ? (night ? R.drawable.wx_moon_cloud : R.drawable.wx_sun_cloud)
            : k == 3 ? R.drawable.wx_cloud : R.drawable.wx_overcast;
        int sky;
        if (k == 4) sky = R.drawable.wsky_overcast;
        else if (k <= 1) sky = ph.equals("day") ? R.drawable.wsky_day_clear : ph.equals("dawn") ? R.drawable.wsky_dawn_clear
            : ph.equals("dusk") ? R.drawable.wsky_dusk_clear : R.drawable.wsky_night_clear;
        else sky = ph.equals("day") ? R.drawable.wsky_day_cloud : ph.equals("dawn") ? R.drawable.wsky_dawn_cloud
            : ph.equals("dusk") ? R.drawable.wsky_dusk_cloud : R.drawable.wsky_night_cloud;
        return new Look(icon, sky);
    }
}
