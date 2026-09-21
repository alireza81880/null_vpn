package com.nullvpn.app;

import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * SingboxPlugin
 * 
 * Capacitor Custom Native Android Plugin bridging the frontend React
 * application to Android's native VpnService tunnel pipeline.
 */
@CapacitorPlugin(name = "SingboxPlugin")
public class SingboxPlugin extends Plugin {

    private static final String TAG = "SingboxPlugin";
    private String cachedConfig = null;

    @Override
    public void load() {
        super.load();

        // Forward native service lifecycle and telemetry events directly to web layer
        NullVpnService.setListener(new NullVpnService.VpnEventListener() {
            @Override
            public void onStateChange(String status, String message) {
                JSObject payload = new JSObject();
                payload.put("status", status);
                if (message != null) {
                    payload.put("message", message);
                }
                payload.put("timestamp", System.currentTimeMillis());
                notifyListeners("onStateChange", payload);
            }

            @Override
            public void onTelemetry(long downloadSpeed, long uploadSpeed, long totalReceived, long totalSent, int latencyPing, int uptimeSeconds, int lastHandshake) {
                JSObject telemetry = new JSObject();
                telemetry.put("downloadSpeed", downloadSpeed);
                telemetry.put("uploadSpeed", uploadSpeed);
                telemetry.put("totalReceived", totalReceived);
                telemetry.put("totalSent", totalSent);
                telemetry.put("latencyPing", latencyPing);
                telemetry.put("uptimeSeconds", uptimeSeconds);
                telemetry.put("lastHandshake", lastHandshake);
                notifyListeners("onTelemetry", telemetry);
            }
        });
    }

    @PluginMethod
    public void startEngine(PluginCall call) {
        String config = call.getString("config");
        if (config == null || config.trim().isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "Invalid or missing tunnel configuration");
            call.resolve(ret);
            return;
        }

        // Validate sing-box configuration schema before launching OS service
        try {
            NullVpnService.validateConfig(config);
        } catch (IllegalArgumentException e) {
            Log.e(TAG, "sing-box configuration validation failed: " + e.getMessage());
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
            return;
        }

        this.cachedConfig = config;

        // Check if Android OS requires user consent for VpnService
        Intent vpnIntent = VpnService.prepare(getContext());
        if (vpnIntent != null) {
            // Prompt system VPN confirmation dialog
            startActivityForResult(call, vpnIntent, "vpnPrepareCallback");
        } else {
            // Permission already granted, immediately launch VPN service
            launchVpnService(call, this.cachedConfig);
        }
    }

    @ActivityCallback
    private void vpnPrepareCallback(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) {
            Log.i(TAG, "VPN permission successfully authorized by user");
            launchVpnService(call, this.cachedConfig);
        } else {
            Log.w(TAG, "VPN permission denied by user");
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "VPN permission was denied by the user");
            call.resolve(ret);
        }
    }

    private void launchVpnService(PluginCall call, String config) {
        try {
            Intent intent = new Intent(getContext(), NullVpnService.class);
            intent.setAction(NullVpnService.ACTION_START);
            intent.putExtra(NullVpnService.EXTRA_CONFIG, config);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("pid", android.os.Process.myPid());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch NullVpnService", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "Failed to launch VpnService");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopEngine(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), NullVpnService.class);
            intent.setAction(NullVpnService.ACTION_STOP);
            getContext().startService(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop NullVpnService", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "Failed to stop VpnService");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getEngineStatus(PluginCall call) {
        String status = NullVpnService.getCurrentStatus();
        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("timestamp", System.currentTimeMillis());
        call.resolve(ret);
    }

    @PluginMethod
    public void runDiagnostics(PluginCall call) {
        new Thread(() -> {
            boolean success = NullVpnService.runNetworkDiagnostics();
            String status = NullVpnService.getCurrentStatus();
            JSObject ret = new JSObject();
            ret.put("success", success);
            ret.put("active", "connected".equals(status));
            ret.put("ip", "1.1.1.1");
            ret.put("interfaceName", "tun0");
            ret.put("message", success ? "Traffic routing active via TUN interface" : "Traffic routing probe failed");
            ret.put("timestamp", System.currentTimeMillis());
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void getDiagnosticLogs(PluginCall call) {
        java.util.List<String> entries = NullVpnService.DiagnosticLog.getEntries();
        com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
        for (String entry : entries) {
            arr.put(entry);
        }
        JSObject ret = new JSObject();
        ret.put("logs", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void pingServer(PluginCall call) {
        String host = call.getString("host", "1.1.1.1");
        int port = call.getInt("port", 53);

        new Thread(() -> {
            long latency = NullVpnService.pingServer(host, port);
            JSObject ret = new JSObject();
            if (latency >= 0) {
                ret.put("success", true);
                ret.put("latencyMs", latency);
            } else {
                ret.put("success", false);
                ret.put("latencyMs", 999);
                ret.put("error", "Server unreachable or timed out");
            }
            call.resolve(ret);
        }).start();
    }
}
