package com.havameridyen.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/**
 * Dört widget boyutunun ortak sağlayıcısı. Sistem her saat (updatePeriodMillis) ve widget eklenince onUpdate çağırır;
 * ayrıca HmWidgets her çizimden sonra saat başına bir alarm (ACTION_TICK) kurar. İkisinde de önce önbellekteki veriyle
 * hemen çizilir, sonra veri 30 dakikadan eskiyse arka planda yenilenip yeniden çizilir.
 */
public abstract class HmWidgetBase extends AppWidgetProvider {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (HmWidgets.ACTION_TICK.equals(intent.getAction())) {
            refresh(ctx); // saat başı: "şimdi" saati ilerlesin, veri eskiyse yenilensin
            return;
        }
        super.onReceive(ctx, intent);
    }

    @Override
    public void onDisabled(Context ctx) {
        HmWidgets.renderAll(ctx); // hiç widget kalmadıysa saat başı alarmı iptal olur
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        refresh(ctx);
    }

    private void refresh(Context ctx) {
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
