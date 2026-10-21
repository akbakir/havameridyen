package com.havameridyen.app.widget;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Uygulamadan widget'a köprü (src/widget.js). Uygulamada konum değişince setPlace çağrılır; konum gerçekten
 * değiştiyse widget'lar yeni konumun verisini çekip yeniden çizilir.
 */
@CapacitorPlugin(name = "HmWidget")
public class HmWidgetPlugin extends Plugin {
    @PluginMethod
    public void setPlace(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lon = call.getDouble("lon");
        if (lat == null || lon == null) {
            call.reject("lat ve lon gerekli");
            return;
        }
        Context ctx = getContext().getApplicationContext();
        boolean changed = HmWidgets.savePlace(ctx, call.getString("name", ""), lat, lon);
        HmWidgets.renderAll(ctx);
        HmWidgets.refreshAsync(ctx, changed);
        call.resolve();
    }
}
