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
            NullVpnService.DiagnosticProbeResult probe = NullVpnService.runNetworkDiagnosticsProbe();
            String status = NullVpnService.getCurrentStatus();
            JSObject ret = new JSObject();
            ret.put("success", "true".equals(probe.tunnelReachability) || probe.coreReachability);
            ret.put("active", "connected".equals(status));
            ret.put("physicalInternet", probe.physicalInternet);
            ret.put("coreReachability", probe.coreReachability);
            ret.put("tunnelReachability", probe.tunnelReachability);
            ret.put("latencyMs", probe.latencyMs);
            ret.put("ip", "1.1.1.1");
            ret.put("interfaceName", "tun0");
            ret.put("message", probe.message);
            ret.put("timestamp", System.currentTimeMillis());
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void getDiagnosticLogs(PluginCall call) {
        java.util.List<String> current = NullVpnService.DiagnosticLog.getCurrentEntries();
        java.util.List<String> last = NullVpnService.DiagnosticLog.getLastEntries();

        com.getcapacitor.JSArray currentArr = new com.getcapacitor.JSArray();
        for (String entry : current) {
            currentArr.put(entry);
        }

        com.getcapacitor.JSArray lastArr = new com.getcapacitor.JSArray();
        for (String entry : last) {
            lastArr.put(entry);
        }

        JSObject ret = new JSObject();
        ret.put("currentSession", currentArr);
        ret.put("lastSession", lastArr);
        ret.put("logs", currentArr); // backwards-compatibility
        call.resolve(ret);
    }

    @PluginMethod
    public void clearDiagnosticLogs(PluginCall call) {
        NullVpnService.DiagnosticLog.clear();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        try {
            java.io.File file = new java.io.File(filePath);
            if (!file.exists()) {
                call.reject("APK file does not exist: " + filePath);
                return;
            }

            android.content.Context context = getContext();
            android.net.Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                file
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            context.startActivity(installIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to install APK: " + e.getMessage(), e);
            call.reject("Failed to trigger installer: " + e.getMessage());
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        boolean canInstall = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            canInstall = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("canInstall", canInstall);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "null-vpn-update.apk");

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            android.content.Context context = getContext();
            android.app.DownloadManager downloadManager = (android.app.DownloadManager) context.getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            if (downloadManager == null) {
                call.reject("DownloadManager service not available");
                return;
            }

            // Target destination inside external files dir
            java.io.File destFile = new java.io.File(context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS), fileName);
            if (destFile.exists()) {
                destFile.delete();
            }

            android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(android.net.Uri.parse(url));
            request.setTitle("Null VPN Update");
            request.setDescription("Downloading latest release...");
            request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationUri(android.net.Uri.fromFile(destFile));
            request.setMimeType("application/vnd.android.package-archive");

            long downloadId = downloadManager.enqueue(request);

            // Register BroadcastReceiver for automatic installation trigger
            android.content.BroadcastReceiver onComplete = new android.content.BroadcastReceiver() {
                @Override
                public void onReceive(android.content.Context c, Intent intent) {
                    long id = intent.getLongExtra(android.app.DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try {
                            context.unregisterReceiver(this);
                        } catch (Exception ignored) {}

                        android.app.DownloadManager.Query query = new android.app.DownloadManager.Query();
                        query.setFilterById(downloadId);
                        android.database.Cursor cursor = downloadManager.query(query);
                        if (cursor != null && cursor.moveToFirst()) {
                            int statusIndex = cursor.getColumnIndex(android.app.DownloadManager.COLUMN_STATUS);
                            if (statusIndex >= 0 && cursor.getInt(statusIndex) == android.app.DownloadManager.STATUS_SUCCESSFUL) {
                                try {
                                    android.net.Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
                                        context,
                                        context.getPackageName() + ".fileprovider",
                                        destFile
                                    );
                                    Intent installIntent = new Intent(Intent.ACTION_VIEW);
                                    installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                                    installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    context.startActivity(installIntent);
                                } catch (Exception e) {
                                    Log.e(TAG, "Install trigger failed after download", e);
                                }
                            }
                            cursor.close();
                        }
                    }
                }
            };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(onComplete, new android.content.IntentFilter(android.app.DownloadManager.ACTION_DOWNLOAD_COMPLETE), android.content.Context.RECEIVER_NOT_EXPORTED);
            } else {
                context.registerReceiver(onComplete, new android.content.IntentFilter(android.app.DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("downloadId", downloadId);
            ret.put("filePath", destFile.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to enqueue APK download: " + e.getMessage(), e);
            call.reject("Failed to enqueue download: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getDownloadProgress(PluginCall call) {
        long downloadId = call.getLong("downloadId", -1L);
        if (downloadId == -1L) {
            call.reject("downloadId is required");
            return;
        }

        try {
            android.app.DownloadManager downloadManager = (android.app.DownloadManager) getContext().getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            if (downloadManager == null) {
                call.reject("DownloadManager not available");
                return;
            }

            android.app.DownloadManager.Query query = new android.app.DownloadManager.Query();
            query.setFilterById(downloadId);
            android.database.Cursor cursor = downloadManager.query(query);

            JSObject ret = new JSObject();
            if (cursor != null && cursor.moveToFirst()) {
                int bytesDownloadedIdx = cursor.getColumnIndex(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                int bytesTotalIdx = cursor.getColumnIndex(android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                int statusIdx = cursor.getColumnIndex(android.app.DownloadManager.COLUMN_STATUS);

                long downloaded = bytesDownloadedIdx >= 0 ? cursor.getLong(bytesDownloadedIdx) : 0;
                long total = bytesTotalIdx >= 0 ? cursor.getLong(bytesTotalIdx) : 0;
                int status = statusIdx >= 0 ? cursor.getInt(statusIdx) : 0;

                ret.put("downloadedBytes", downloaded);
                ret.put("totalBytes", total);
                ret.put("status", status);
                ret.put("isCompleted", status == android.app.DownloadManager.STATUS_SUCCESSFUL);
                ret.put("isFailed", status == android.app.DownloadManager.STATUS_FAILED);
                cursor.close();
            } else {
                ret.put("status", -1);
                ret.put("isCompleted", false);
                ret.put("isFailed", true);
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to query download progress: " + e.getMessage());
        }
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
