package com.nullvpn.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SingboxPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
