package com.havameridyen.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Dört widget boyutunun ortak sağlayıcısı. Sistem her saat (updatePeriodMillis) ve widget eklenince onUpdate çağırır:
 * önce önbellekteki veriyle hemen çizilir, sonra veri 30 dakikadan eskiyse arka planda yenilenip yeniden çizilir.
 */
public abstract class HmWidgetBase extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        HmWidgets.renderAll(ctx);
        final PendingResult pending = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                if (HmWidgets.refreshIfStale(app)) HmWidgets.renderAll(app);
            } finally {
                pending.finish();
            }
        }, "hm-widget-update").start();
    }
}
