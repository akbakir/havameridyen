package com.havameridyen.app.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
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

    static final int KIND_K = 0, KIND_G1 = 1, KIND_G2 = 2, KIND_I = 3, KIND_GS = 4;
    private static final int[] LAYOUT = {
        R.layout.hm_widget_kucuk, R.layout.hm_widget_saat, R.layout.hm_widget_gun, R.layout.hm_widget_ince,
        R.layout.hm_widget_birlesik
    };
    private static final Class<?>[] PROVIDER = {KucukWidget.class, SaatWidget.class, GunWidget.class, InceWidget.class, BirlesikWidget.class};

    private static final int[] H_T = {R.id.w_h0_t, R.id.w_h1_t, R.id.w_h2_t, R.id.w_h3_t, R.id.w_h4_t};
    private static final int[] H_I = {R.id.w_h0_i, R.id.w_h1_i, R.id.w_h2_i, R.id.w_h3_i, R.id.w_h4_i};
    private static final int[] H_V = {R.id.w_h0_v, R.id.w_h1_v, R.id.w_h2_v, R.id.w_h3_v, R.id.w_h4_v};
    private static final int[] H_P = {R.id.w_h0_p, R.id.w_h1_p, R.id.w_h2_p, R.id.w_h3_p, R.id.w_h4_p};
    private static final int[] D_N = {R.id.w_d0_n, R.id.w_d1_n, R.id.w_d2_n, R.id.w_d3_n};
    private static final int[] D_I = {R.id.w_d0_i, R.id.w_d1_i, R.id.w_d2_i, R.id.w_d3_i};
    private static final int[] D_MAX = {R.id.w_d0_max, R.id.w_d1_max, R.id.w_d2_max, R.id.w_d3_max};
    private static final int[] D_MIN = {R.id.w_d0_min, R.id.w_d1_min, R.id.w_d2_min, R.id.w_d3_min};
    private static final int[] D_BAR = {R.id.w_d0_bar, R.id.w_d1_bar, R.id.w_d2_bar, R.id.w_d3_bar};
    private static final int[] D_BARC = {R.id.w_d0_barc, R.id.w_d1_barc, R.id.w_d2_barc, R.id.w_d3_barc};
    private static final int[] D_P = {R.id.w_d0_p, R.id.w_d1_p, R.id.w_d2_p, R.id.w_d3_p};
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
            o.put("mm", val(x.optJSONObject("precip_total")));
            putCond(o, x.optJSONObject("cond"));
            d.put(o);
        }
        // 3 saatlik dilimler (widget5; sunucu consensus.slots3 — sunucu eskiyse yok, o zaman saatlik dilimlere dönülür)
        JSONArray sl = cons.optJSONArray("slots3");
        JSONArray sd = new JSONArray();
        for (int i = 0; sl != null && i < sl.length() && i < KEEP_HOURS / 3; i++) {
            JSONObject x = sl.getJSONObject(i);
            JSONObject o = new JSONObject();
            o.put("t", x.optString("start"));
            o.put("mm", val(x.optJSONObject("precip")));
            putCond(o, x.optJSONObject("cond"));
            sd.put(o);
        }
        JSONObject s = new JSONObject();
        s.put("tz", r.optString("timezone", "Europe/Istanbul"));
        s.put("fetched", System.currentTimeMillis());
        s.put("h", h);
        s.put("d", d);
        if (sd.length() > 0) s.put("s", sd);
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
        boolean any = false;
        for (int k = 0; k < PROVIDER.length; k++) {
            int[] ids = m.getAppWidgetIds(new ComponentName(ctx, PROVIDER[k]));
            if (ids == null || ids.length == 0) continue;
            any = true;
            m.updateAppWidget(ids, build(ctx, k, d));
        }
        if (any) scheduleTick(ctx);
        else cancelTick(ctx);
    }

    // ---- saat başı yeniden çizim (widget3 sonrası, 25 Ekim) -----------------------------------------------------
    // Android'in saatlik widget güncellemesi (updatePeriodMillis) pil için gecikebiliyor; "şimdi" saati bir saate
    // kadar geride kalıyordu (21 Ekim 17:37'de 16:00). Her çizimden sonra bir sonraki saat başına (+30 sn) alarm
    // kurulur; tam zamanlı alarm izni gerekmesin diye 5 dakikalık pencereli (setWindow). Widget kalmayınca iptal.

    static final String ACTION_TICK = "com.havameridyen.app.widget.TICK";

    private static PendingIntent tickIntent(Context ctx) {
        Intent i = new Intent(ctx, KucukWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleTick(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar c = Calendar.getInstance();
        c.add(Calendar.HOUR_OF_DAY, 1);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 30);
        c.set(Calendar.MILLISECOND, 0);
        am.setWindow(AlarmManager.RTC, c.getTimeInMillis(), 5L * 60L * 1000L, tickIntent(ctx));
    }

    private static void cancelTick(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(tickIntent(ctx));
    }

    /** Ağdan yeni veri çekip (gerekirse) yeniden çizer; arka planda çalışır. */
    public static void refreshAsync(Context ctx, final boolean force) {
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            boolean got = force ? fetch(app) : refreshIfStale(app);
            if (got) renderAll(app);
        }, "hm-widget").start();
    }

    // Hangi düzende hangi görünüm var (yanlış kimlik widget'ı "yüklenemedi" yapar):
    //   K: yer, saat, en/en düşük, nokta, uyum yazısı · G1: yer, saat, saat dilimleri (uyum noktası yok, G2 gibi; widget7) · G2: yer, saat, günler
    //   İ: en/en düşük, sağda yer, saat, uyum çubuğu · GS: yer, saat, günler, saat dilimleri (widget6)
    private static boolean hasPlace(int k) { return true; }
    private static boolean hasTime(int k) { return true; }
    private static boolean hasMinmax(int k) { return k == KIND_K || k == KIND_I; }
    private static boolean hasDot(int k) { return k == KIND_K; }
    private static boolean hasAgree(int k) { return k == KIND_K; }
    private static boolean hasNowBar(int k) { return k == KIND_I; }
    private static boolean hasHours(int k) { return k == KIND_G1 || k == KIND_GS; }
    private static boolean hasDays(int k) { return k == KIND_G2 || k == KIND_GS; }
    private static boolean hasNowRain(int k) { return k == KIND_K || k == KIND_I; } // K: bugünün toplamı · İ: içinde bulunulan 3 saatlik dilim

    private static RemoteViews build(Context ctx, int kind, JSONObject d) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUT[kind]);
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.w_root,
            PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        String place = placeName(ctx);
        if (hasPlace(kind)) v.setTextViewText(R.id.w_place, place);

        JSONArray h = d == null ? null : d.optJSONArray("h");
        int i = h == null ? -1 : nowIndex(h, d.optString("tz", "Europe/Istanbul"));
        if (i < 0) {
            // Veri yok ya da süresi geçmiş: yer tutucu
            v.setInt(R.id.w_root, "setBackgroundResource", R.drawable.wsky_nodata);
            v.setImageViewResource(R.id.w_icon, R.drawable.wx_cloud);
            v.setTextViewText(R.id.w_temp, "—");
            v.setTextViewText(R.id.w_cond, d == null ? "Veri bekleniyor" : "Veri eski");
            if (hasTime(kind)) v.setTextViewText(R.id.w_time, "");
            if (hasMinmax(kind)) v.setTextViewText(R.id.w_minmax, "");
            if (hasDot(kind)) v.setViewVisibility(R.id.w_dot, View.GONE);
            if (hasNowBar(kind)) v.setViewVisibility(R.id.w_bar, View.INVISIBLE);
            if (hasAgree(kind)) v.setTextViewText(R.id.w_agree, "");
            if (hasNowRain(kind)) v.setTextViewText(R.id.w_p, "");
            if (hasHours(kind)) for (int k = 0; k < 5; k++) hideSlot(v, k);
            if (hasDays(kind)) for (int k = 0; k < 4; k++) hideDay(v, k);
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
        if (hasTime(kind)) v.setTextViewText(R.id.w_time, hh);

        JSONArray days = d.optJSONArray("d");
        JSONObject today = dayOf(days, now.optString("t"));
        // maks kırmızı, min mavi, arkalarında koyu hale (Ali Kemal, 25 Ekim; düzende shadow*)
        if (hasMinmax(kind)) v.setTextViewText(R.id.w_minmax, minmaxText(today, null));

        String level = now.optString("level", "na");
        if (hasDot(kind)) {
            int col = levelColor(level);
            v.setViewVisibility(R.id.w_dot, col == 0 ? View.GONE : View.VISIBLE);
            if (col != 0) v.setInt(R.id.w_dot, "setColorFilter", col);
        }
        if (hasAgree(kind)) v.setTextViewText(R.id.w_agree, levelText(level));
        if (hasNowBar(kind)) {
            // İ: şimdiki saatin uyumu, günlerdeki gibi koyu yatağın içinde renkli çubuk
            int col = levelColor(level);
            v.setViewVisibility(R.id.w_bar, col == 0 ? View.INVISIBLE : View.VISIBLE);
            if (col != 0) v.setInt(R.id.w_barc, "setColorFilter", col);
        }

        JSONArray slots = d.optJSONArray("s");
        int s0 = slots == null ? -1 : slotIndex(slots, now.optString("t"));
        if (hasNowRain(kind)) {
            String p = "";
            if (kind == KIND_K && today != null && today.optBoolean("wet", false)) p = mm(today, "bugün ");
            if (kind == KIND_I && s0 >= 0) {
                JSONObject cur = slots.optJSONObject(s0);
                if (cur != null && cur.optBoolean("wet", false)) p = mm(cur, "3 sa ");
            }
            v.setTextViewText(R.id.w_p, p);
        }

        if (hasHours(kind)) {
            for (int k = 0; k < 5; k++) {
                JSONObject s;
                if (s0 >= 0) {
                    // 3 saatlik dilim (00, 03 … 21): ikon dilimin ortak durumu, sıcaklık dilim başının ortancası,
                    // yağışlıysa altında modellerin 3 saatlik toplamlarının ortancası
                    s = s0 + k < slots.length() ? slots.optJSONObject(s0 + k) : null;
                } else {
                    int j = i + 1 + 3 * k; // eski sunucu yanıtı: saatlik dilimler
                    s = j < h.length() ? h.optJSONObject(j) : null;
                }
                if (s == null) {
                    hideSlot(v, k);
                    continue;
                }
                int sh = hourOf(s.optString("t"));
                JSONObject hs = s0 >= 0 ? hourAt(h, s.optString("t")) : s;
                v.setViewVisibility(H_T[k], View.VISIBLE);
                v.setViewVisibility(H_I[k], View.VISIBLE);
                v.setViewVisibility(H_V[k], View.VISIBLE);
                v.setViewVisibility(H_P[k], View.VISIBLE);
                v.setTextViewText(H_T[k], String.format(Locale.US, "%02d", sh));
                v.setImageViewResource(H_I[k], look(s, s0 >= 0 ? sh + 1 : sh).icon);
                v.setTextViewText(H_V[k], hs == null ? "—" : deg(hs));
                v.setTextViewText(H_P[k], s0 >= 0 && s.optBoolean("wet", false) ? mm(s, "") : "");
            }
        }

        if (hasDays(kind)) {
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
                v.setViewVisibility(D_P[k], View.VISIBLE);
                v.setTextViewText(D_P[k], x.optBoolean("wet", false) ? mm(x, "") : "");
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
        v.setViewVisibility(H_P[k], View.INVISIBLE);
    }

    private static void hideDay(RemoteViews v, int k) {
        v.setViewVisibility(D_N[k], View.INVISIBLE);
        v.setViewVisibility(D_I[k], View.INVISIBLE);
        v.setViewVisibility(D_MAX[k], View.INVISIBLE);
        v.setViewVisibility(D_MIN[k], View.INVISIBLE);
        v.setViewVisibility(D_BAR[k], View.INVISIBLE);
        v.setViewVisibility(D_P[k], View.INVISIBLE);
    }

    private static final int COL_MAX = 0xFFFF8A75, COL_MIN = 0xFF8CC4FF; // values/hm_widget.xml hm_w_max / hm_w_min

    private static CharSequence minmaxText(JSONObject day, String suffix) {
        SpannableStringBuilder b = new SpannableStringBuilder();
        if (day != null) {
            int a = b.length();
            b.append(deg(day, "max"));
            b.setSpan(new ForegroundColorSpan(COL_MAX), a, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            b.append(" / ");
            a = b.length();
            b.append(deg(day, "min"));
            b.setSpan(new ForegroundColorSpan(COL_MIN), a, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        if (suffix != null) b.append(b.length() > 0 ? " · " : "").append(suffix);
        return b;
    }

    // İçinde bulunulan 3 saatlik dilim: başlangıcı "şimdi"den küçük ya da eşit son dilim
    private static int slotIndex(JSONArray sl, String now) {
        int best = -1;
        for (int i = 0; i < sl.length(); i++) {
            if (sl.optJSONObject(i).optString("t").compareTo(now) <= 0) best = i;
            else break;
        }
        return best;
    }

    private static JSONObject hourAt(JSONArray h, String t) {
        for (int i = 0; i < h.length(); i++) if (t.equals(h.optJSONObject(i).optString("t"))) return h.optJSONObject(i);
        return null;
    }

    // Yağış miktarı: 10 mm altı tek ondalık ("0,7 mm"), üstü tam sayı ("28 mm"); 0,05 altı yazılmaz
    private static String mm(JSONObject o, String prefix) {
        if (o == null || o.isNull("mm") || !o.has("mm")) return "";
        double x = o.optDouble("mm");
        if (Double.isNaN(x) || x < 0.05) return "";
        String n = x < 9.95 ? String.format(Locale.US, "%.1f", x).replace('.', ',') : String.valueOf(Math.round(x));
        return prefix + n + " mm";
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
