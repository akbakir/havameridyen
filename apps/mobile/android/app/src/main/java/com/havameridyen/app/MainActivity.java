package com.havameridyen.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.havameridyen.app.widget.HmWidgetPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(HmWidgetPlugin.class); // widget köprüsü (src/widget.js)
        super.onCreate(savedInstanceState);
    }
}
