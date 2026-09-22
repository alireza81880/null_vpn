package com.nullvpn.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.TrafficStats;
import android.net.VpnService;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import io.nekohasekai.libbox.BridgeOptions;
import io.nekohasekai.libbox.BridgeSession;
import io.nekohasekai.libbox.CommandClient;
import io.nekohasekai.libbox.CommandClientHandler;
import io.nekohasekai.libbox.CommandClientOptions;
import io.nekohasekai.libbox.CommandServer;
import io.nekohasekai.libbox.CommandServerHandler;
import io.nekohasekai.libbox.ConnectionEvents;
import io.nekohasekai.libbox.ConnectionOwner;
import io.nekohasekai.libbox.DnsQuery;
import io.nekohasekai.libbox.InterfaceUpdateListener;
import io.nekohasekai.libbox.Libbox;
import io.nekohasekai.libbox.LocalDNSTransport;
import io.nekohasekai.libbox.LogEntry;
import io.nekohasekai.libbox.LogIterator;
import io.nekohasekai.libbox.NeighborUpdateListener;
import io.nekohasekai.libbox.NetworkInterfaceIterator;
import io.nekohasekai.libbox.OutboundGroupItemIterator;
import io.nekohasekai.libbox.OutboundGroupIterator;
import io.nekohasekai.libbox.OverrideOptions;
import io.nekohasekai.libbox.PlatformInterface;
import io.nekohasekai.libbox.PlatformUser;
import io.nekohasekai.libbox.RoutePrefix;
import io.nekohasekai.libbox.RoutePrefixIterator;
import io.nekohasekai.libbox.SetupOptions;
import io.nekohasekai.libbox.ShellSession;
import io.nekohasekai.libbox.StatusMessage;
import io.nekohasekai.libbox.StringIterator;
import io.nekohasekai.libbox.SystemProxyStatus;
import io.nekohasekai.libbox.TunOptions;
import io.nekohasekai.libbox.WIFIState;

/**
 * NullVpnService
 * 
 * Production Android VpnService implementation integrating the sing-box (libbox) core.
 * Implements PlatformInterface and CommandServerHandler to provide real full-tunnel routing,
 * socket protection against VPN loops, TUN configuration callback, and foreground lifecycle.
 */
public class NullVpnService extends VpnService implements PlatformInterface, CommandServerHandler {

    private static final String TAG = "NullVpnService";
    public static final String ACTION_START = "com.nullvpn.app.START_VPN";
    public static final String ACTION_STOP = "com.nullvpn.app.STOP_VPN";
    public static final String EXTRA_CONFIG = "com.nullvpn.app.EXTRA_CONFIG";
    private static final String CHANNEL_ID = "null_vpn_channel";
    private static final int NOTIFICATION_ID = 9527;

    private static volatile String currentStatus = "disconnected";
    private static volatile VpnEventListener eventListener = null;
    private static volatile NullVpnService activeInstance = null;

    // Diagnostic internal circular buffer and persistent session logs for lifecycle and failure tracking
    public static class DiagnosticLog {
        private static final int MAX_ENTRIES = 100;
        private static final ArrayDeque<String> currentEntries = new ArrayDeque<>(MAX_ENTRIES);
        private static final ArrayDeque<String> lastEntries = new ArrayDeque<>(MAX_ENTRIES);
        private static final Object lock = new Object();
        private static File logDir = null;
        private static boolean initialized = false;

        public static void init(File filesDir) {
            synchronized (lock) {
                if (initialized) return;
                logDir = filesDir;
                try {
                    File currentFile = new File(logDir, "current_session.log");
                    File lastFile = new File(logDir, "last_session.log");
                    if (currentFile.exists()) {
                        if (lastFile.exists()) {
                            lastFile.delete();
                        }
                        currentFile.renameTo(lastFile);
                        loadEntriesFromFile(lastFile, lastEntries);
                    }
                    initialized = true;
                    record("PROCESS_START", "Process initialized (PID=" + Process.myPid() + ")");
                } catch (Throwable t) {
                    Log.w(TAG, "Failed to initialize diagnostic files: " + t.getMessage());
                }
            }
        }

        private static void loadEntriesFromFile(File file, ArrayDeque<String> target) {
            if (!file.exists()) return;
            try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (target.size() >= MAX_ENTRIES) {
                        target.pollFirst();
                    }
                    target.addLast(line);
                }
            } catch (Throwable ignored) {}
        }

        public static void record(String tag, String message) {
            String safeMessage = scrubSecrets(message);
            String ts = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
            String line = "[" + ts + "] [" + tag + "] " + safeMessage;
            Log.i(TAG, line);

            synchronized (lock) {
                if (currentEntries.size() >= MAX_ENTRIES) {
                    currentEntries.pollFirst();
                }
                currentEntries.addLast(line);

                if (logDir != null) {
                    try {
                        File currentFile = new File(logDir, "current_session.log");
                        try (FileWriter fw = new FileWriter(currentFile, true)) {
                            fw.write(line + "\n");
                        }
                    } catch (Throwable ignored) {}
                }
            }
        }

        private static String scrubSecrets(String msg) {
            if (msg == null) return "";
            return msg.replaceAll("([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "[REDACTED-UUID]")
                      .replaceAll("(?i)(private_key|password|pre_shared_key|public_key)[\"':= ]+([A-Za-z0-9+/=_-]{20,})", "$1=[REDACTED]");
        }

        public static List<String> getCurrentEntries() {
            synchronized (lock) {
                return new ArrayList<>(currentEntries);
            }
        }

        public static List<String> getLastEntries() {
            synchronized (lock) {
                return new ArrayList<>(lastEntries);
            }
        }

        public static void clear() {
            synchronized (lock) {
                currentEntries.clear();
                lastEntries.clear();
                if (logDir != null) {
                    try {
                        new File(logDir, "current_session.log").delete();
                        new File(logDir, "last_session.log").delete();
                    } catch (Throwable ignored) {}
                }
            }
        }
    }

    private final AtomicBoolean isStopping = new AtomicBoolean(false);
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private final AtomicBoolean isProbing = new AtomicBoolean(false);

    private ParcelFileDescriptor tunInterface = null;
    private CommandServer commandServer = null;
    private CommandClient commandClient = null;
    private Handler telemetryHandler = null;
    private Runnable telemetryRunnable = null;
    private ExecutorService probeExecutor = null;
    private volatile int lastPingLatency = 0;

    private int uptimeSeconds = 0;
    private volatile long coreDownlinkSpeed = 0L;
    private volatile long coreUplinkSpeed = 0L;
    private volatile long coreDownlinkTotal = 0L;
    private volatile long coreUplinkTotal = 0L;

    private String currentServerHost = "1.1.1.1";
    private int currentServerPort = 53;

    public interface VpnEventListener {
        void onStateChange(String status, String message);
        void onTelemetry(long downloadSpeed, long uploadSpeed, long totalReceived, long totalSent, int latencyPing, int uptimeSeconds, int lastHandshake);
    }

    public static void setListener(VpnEventListener listener) {
        eventListener = listener;
    }

    public static String getCurrentStatus() {
        return currentStatus;
    }

    /**
     * Validates that the configuration JSON meets sing-box core requirements.
     * Throws IllegalArgumentException if configuration is malformed or missing critical parameters.
     */
    public static void validateConfig(String configJson) throws IllegalArgumentException {
        if (configJson == null || configJson.trim().isEmpty()) {
            throw new IllegalArgumentException("sing-box configuration payload is null or empty");
        }

        try {
            JSONObject root = new JSONObject(configJson);

            // Verify outbounds
            if (!root.has("outbounds")) {
                throw new IllegalArgumentException("sing-box configuration must contain an 'outbounds' array");
            }

            JSONArray outbounds = root.getJSONArray("outbounds");
            if (outbounds.length() == 0) {
                throw new IllegalArgumentException("sing-box configuration contains an empty 'outbounds' array");
            }

            // Inspect the primary proxy: check endpoints first (WireGuard v1.14.1), then outbounds
            JSONObject primaryProxy = null;
            String type = "";
            boolean isEndpoint = false;

            if (root.has("endpoints")) {
                JSONArray endpoints = root.optJSONArray("endpoints");
                if (endpoints != null && endpoints.length() > 0) {
                    for (int i = 0; i < endpoints.length(); i++) {
                        JSONObject ep = endpoints.getJSONObject(i);
                        String epTag = ep.optString("tag", "");
                        if ("proxy-out".equals(epTag)) {
                            primaryProxy = ep;
                            type = ep.optString("type", "");
                            isEndpoint = true;
                            break;
                        }
                    }
                    if (primaryProxy == null) {
                        JSONObject ep0 = endpoints.getJSONObject(0);
                        if ("wireguard".equalsIgnoreCase(ep0.optString("type", ""))) {
                            primaryProxy = ep0;
                            type = "wireguard";
                            isEndpoint = true;
                        }
                    }
                }
            }

            if (primaryProxy == null) {
                for (int i = 0; i < outbounds.length(); i++) {
                    JSONObject o = outbounds.getJSONObject(i);
                    String tag = o.optString("tag", "");
                    if ("proxy-out".equals(tag)) {
                        primaryProxy = o;
                        type = o.optString("type", "");
                        break;
                    }
                }
                if (primaryProxy == null) {
                    primaryProxy = outbounds.getJSONObject(0);
                    type = primaryProxy.optString("type", "");
                }
            }

            if (type.isEmpty()) {
                throw new IllegalArgumentException("Primary outbound/endpoint is missing a protocol 'type'");
            }

            if ("wireguard".equalsIgnoreCase(type)) {
                String privateKey = primaryProxy.optString("private_key", "");
                if (privateKey.isEmpty()) {
                    throw new IllegalArgumentException("WireGuard configuration missing required 'private_key'");
                }

                JSONArray peers = primaryProxy.optJSONArray("peers");
                if (isEndpoint || (peers != null && peers.length() > 0)) {
                    if (peers == null || peers.length() == 0) {
                        throw new IllegalArgumentException("WireGuard endpoint missing required 'peers' array");
                    }
                    JSONObject peer0 = peers.getJSONObject(0);
                    String peerAddr = peer0.optString("address", peer0.optString("server", ""));
                    String peerPubKey = peer0.optString("public_key", "");
                    if (peerAddr.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard peer missing 'address' / 'server'");
                    }
                    if (peerPubKey.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard peer missing required 'public_key'");
                    }
                } else {
                    String server = primaryProxy.optString("server", "");
                    String peerPublicKey = primaryProxy.optString("peer_public_key", "");
                    if (server.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard outbound missing 'server' address");
                    }
                    if (peerPublicKey.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard outbound missing required 'peer_public_key'");
                    }
                }
            } else if ("vless".equalsIgnoreCase(type)) {
                String server = primaryProxy.optString("server", "");
                String uuid = primaryProxy.optString("uuid", "");
                if (server.isEmpty()) {
                    throw new IllegalArgumentException("VLESS outbound missing 'server' address");
                }
                if (uuid.isEmpty()) {
                    throw new IllegalArgumentException("VLESS outbound missing 'uuid'");
                }
            } else if ("trojan".equalsIgnoreCase(type)) {
                String server = primaryProxy.optString("server", "");
                String password = primaryProxy.optString("password", "");
                if (server.isEmpty()) {
                    throw new IllegalArgumentException("Trojan outbound missing 'server' address");
                }
                if (password.isEmpty()) {
                    throw new IllegalArgumentException("Trojan outbound missing 'password'");
                }
            }

        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Malformed sing-box JSON configuration: " + e.getMessage(), e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeInstance = this;
        DiagnosticLog.init(getFilesDir());
        DiagnosticLog.record("SERVICE_START", "NullVpnService onCreate (PID=" + Process.myPid() + ")");

        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            DiagnosticLog.record("UNCAUGHT_EXCEPTION", "Crash in " + thread.getName() + ": " + throwable.getMessage());
            Log.e(TAG, "Uncaught exception in " + thread.getName(), throwable);
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });

        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            DiagnosticLog.record("SERVICE_START", "onStartCommand with null intent (restarted by system)");
            return START_STICKY;
        }

        String action = intent.getAction();
        DiagnosticLog.record("SERVICE_START", "onStartCommand action=" + action + ", startId=" + startId);

        if (ACTION_START.equals(action)) {
            String config = intent.getStringExtra(EXTRA_CONFIG);
            startVpn(config);
        } else if (ACTION_STOP.equals(action)) {
            stopVpn("explicit UI disconnect");
        } else {
            DiagnosticLog.record("STOP_REQUEST_SOURCE", "unknown action: " + action);
        }

        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        DiagnosticLog.record("STOP_REQUEST_SOURCE", "onTaskRemoved: Activity task swiped away, VPN remains running");
        Log.i(TAG, "onTaskRemoved: Task removed, VPN foreground service continuing");
        super.onTaskRemoved(rootIntent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Null VPN Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Maintains encrypted tunnel and real-time network statistics");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Null VPN — Connected")
            .setContentText(text != null ? text : "Tunnel active: sing-box core")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void promoteToForeground(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, 0);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Throwable t) {
            Log.w(TAG, "startForeground fallback: " + t.getMessage());
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Throwable ignored) {}
        }
    }

    private synchronized void startVpn(String configJson) {
        isStopping.set(false);
        isRunning.set(true);
        DiagnosticLog.record("CORE_START", "Starting sing-box core with payload length: " + (configJson != null ? configJson.length() : 0));
        currentStatus = "connecting";
        if (eventListener != null) {
            eventListener.onStateChange("connecting", null);
        }

        // Start Foreground Service immediately with proper type
        promoteToForeground(buildNotification("Initializing sing-box core..."));

        try {
            // Step 1: Validate config payload
            validateConfig(configJson);

            // Extract remote endpoint for latency telemetry
            try {
                JSONObject root = new JSONObject(configJson);
                JSONArray endpoints = root.optJSONArray("endpoints");
                if (endpoints != null && endpoints.length() > 0) {
                    for (int i = 0; i < endpoints.length(); i++) {
                        JSONObject ep = endpoints.getJSONObject(i);
                        JSONArray peers = ep.optJSONArray("peers");
                        if (peers != null && peers.length() > 0) {
                            JSONObject p = peers.getJSONObject(0);
                            String addr = p.optString("address", p.optString("server", ""));
                            int port = p.optInt("port", p.optInt("server_port", 51820));
                            if (!addr.isEmpty()) {
                                currentServerHost = addr;
                                currentServerPort = port;
                                break;
                            }
                        }
                    }
                }
                if ("1.1.1.1".equals(currentServerHost)) {
                    JSONArray outbounds = root.optJSONArray("outbounds");
                    if (outbounds != null && outbounds.length() > 0) {
                        for (int i = 0; i < outbounds.length(); i++) {
                            JSONObject o = outbounds.getJSONObject(i);
                            if ("proxy-out".equals(o.optString("tag", "")) || i == 0) {
                                String server = o.optString("server", "");
                                if (!server.isEmpty()) {
                                    currentServerHost = server;
                                    currentServerPort = o.optInt("server_port", 443);
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}

            // Step 2: Clean up previous tunnel if any
            if (commandServer != null) {
                try {
                    commandServer.closeService();
                } catch (Exception ignored) {}
                try {
                    commandServer.close();
                } catch (Exception ignored) {}
                commandServer = null;
            }

            if (tunInterface != null) {
                try {
                    tunInterface.close();
                } catch (Exception ignored) {}
                tunInterface = null;
            }

            // Step 3: Initialize libbox environment directories
            SetupOptions setupOptions = new SetupOptions();
            setupOptions.setBasePath(getFilesDir().getPath());
            setupOptions.setWorkingPath(getFilesDir().getPath());
            setupOptions.setTempPath(getCacheDir().getPath());
            setupOptions.setFixAndroidStack(true);

            Libbox.setup(setupOptions);
            Log.i(TAG, "Libbox.setup completed successfully");

            // Step 4: Create and start CommandServer
            commandServer = new CommandServer(this, this);
            commandServer.start();
            Log.i(TAG, "Libbox CommandServer started");

            // Step 5: Start the core service via CommandServer with JSON config and PlatformInterface
            commandServer.startOrReloadService(configJson, new OverrideOptions());
            DiagnosticLog.record("CORE_START", "sing-box core service started successfully via CommandServer");

            currentStatus = "core_running";
            DiagnosticLog.record("STATE_CHANGE", "Tunnel state transitioned to core_running");
            if (eventListener != null) {
                eventListener.onStateChange("core_running", "sing-box core initialized");
            }

            // Step 6: Connect CommandClient for real-time telemetry from core
            try {
                CommandClientOptions clientOpts = new CommandClientOptions();
                clientOpts.addCommand(Libbox.CommandStatus);
                clientOpts.addCommand(Libbox.CommandLog);
                clientOpts.setStatusInterval(1000000000L); // 1 sec interval

                commandClient = new CommandClient(new CommandClientHandler() {
                    @Override
                    public void connected() {
                        Log.i(TAG, "CommandClient connected to sing-box core");
                    }

                    @Override
                    public void disconnected(String message) {
                        Log.d(TAG, "CommandClient disconnected: " + message);
                    }

                    @Override
                    public void clearLogs() {}

                    @Override
                    public void initializeClashMode(StringIterator modeList, String currentMode) {}

                    @Override
                    public void setDefaultLogLevel(int level) {}

                    @Override
                    public void updateClashMode(String newMode) {}

                    @Override
                    public void writeConnectionEvents(ConnectionEvents events) {}

                    @Override
                    public void writeDNSQuery(DnsQuery query) {}

                    @Override
                    public void writeGroups(OutboundGroupIterator iterator) {}

                    @Override
                    public void writeLogs(LogIterator messageList) {
                        if (messageList != null) {
                            while (messageList.hasNext()) {
                                LogEntry entry = messageList.next();
                                if (entry != null) {
                                    String msg = entry.getMessage();
                                    if (msg != null && (msg.contains("ERROR") || msg.contains("failed") || msg.contains("FATAL"))) {
                                        DiagnosticLog.record("OUTBOUND_ERROR", msg);
                                    }
                                }
                            }
                        }
                    }

                    @Override
                    public void writeOutbounds(OutboundGroupItemIterator iterator) {}

                    @Override
                    public void writeStatus(StatusMessage status) {
                        if (status != null && !isStopping.get()) {
                            coreDownlinkSpeed = status.getDownlink();
                            coreUplinkSpeed = status.getUplink();
                            coreDownlinkTotal = status.getDownlinkTotal();
                            coreUplinkTotal = status.getUplinkTotal();

                            if (("core_running".equals(currentStatus) || "tunnel_verified".equals(currentStatus)) &&
                                (coreDownlinkTotal > 0 || status.getConnectionsOut() > 0)) {
                                currentStatus = "connected";
                                DiagnosticLog.record("STATE_CHANGE", "Tunnel verified and passing traffic (connected)");
                                if (eventListener != null) {
                                    eventListener.onStateChange("connected", "Tunnel active and passing traffic");
                                }
                            }
                        }
                    }
                }, clientOpts);
                commandClient.connect();
            } catch (Throwable t) {
                Log.w(TAG, "CommandClient setup note: " + t.getMessage());
            }

            uptimeSeconds = 0;
            coreDownlinkSpeed = 0L;
            coreUplinkSpeed = 0L;
            coreDownlinkTotal = 0L;
            coreUplinkTotal = 0L;

            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification("sing-box tunnel secured"));
            }

            startTelemetryLoop();
            Log.i(TAG, "NullVpnService running in production mode");

        } catch (Throwable t) {
            String errorMsg = t.getMessage() != null ? t.getMessage() : t.toString();
            Log.e(TAG, "Failed to start sing-box core: " + errorMsg, t);
            DiagnosticLog.record("CORE_ERROR", "Failed to start sing-box core: " + errorMsg);
            currentStatus = "error";
            if (eventListener != null) {
                eventListener.onStateChange("error", errorMsg);
            }
            stopVpn("startVpn failure");
        }
    }

    private void stopVpn(String source) {
        DiagnosticLog.record("STOP_REQUEST_SOURCE", source);
        if (!isRunning.get() || !isStopping.compareAndSet(false, true)) {
            Log.i(TAG, "stopVpn ignored: already stopping or not running (source: " + source + ")");
            return;
        }

        Log.i(TAG, "Stopping NullVpnService (source: " + source + ", was " + currentStatus + ")");
        DiagnosticLog.record("CORE_STOP", "Initiating shutdown from " + source + " (was " + currentStatus + ")");

        currentStatus = "disconnecting";
        if (eventListener != null) {
            eventListener.onStateChange("disconnecting", "Shutting down tunnel");
        }

        stopTelemetryLoop();

        if (commandClient != null) {
            try {
                commandClient.disconnect();
            } catch (Throwable ignored) {}
            commandClient = null;
        }

        if (commandServer != null) {
            CommandServer cs = commandServer;
            commandServer = null;
            if (!"serviceStop callback".equals(source)) {
                try {
                    cs.closeService();
                } catch (Exception e) {
                    DiagnosticLog.record("CORE_ERROR", "Error in commandServer.closeService: " + e.getMessage());
                }
            }
            try {
                cs.close();
            } catch (Exception e) {
                DiagnosticLog.record("CORE_ERROR", "Error in commandServer.close: " + e.getMessage());
            }
        }

        if (tunInterface != null) {
            ParcelFileDescriptor tun = tunInterface;
            tunInterface = null;
            try {
                tun.close();
            } catch (Exception e) {
                DiagnosticLog.record("CORE_ERROR", "Error closing TUN interface: " + e.getMessage());
            }
        }

        currentStatus = "disconnected";
        isRunning.set(false);

        if (eventListener != null) {
            eventListener.onStateChange("disconnected", null);
        }

        DiagnosticLog.record("CORE_STOP", "Core stopped cleanly from " + source);

        try {
            stopForeground(true);
        } catch (Exception ignored) {}
        stopSelf();
    }

    // ==========================================
    // PlatformInterface Implementation (sing-box v1.10.7)
    // ==========================================

    @Override
    public boolean usePlatformAutoDetectInterfaceControl() {
        return true;
    }

    @Override
    public void autoDetectInterfaceControl(int fd) throws Exception {
        // Protect upstream sockets created by sing-box to prevent VPN loops
        boolean success = protect(fd);
        if (!success) {
            Log.w(TAG, "autoDetectInterfaceControl: VpnService.protect(fd=" + fd + ") failed");
        } else {
            Log.d(TAG, "autoDetectInterfaceControl: VpnService.protect(fd=" + fd + ") succeeded");
        }
    }

    @Override
    public int openTun(TunOptions options) throws Exception {
        Log.i(TAG, "sing-box requested openTun with MTU=" + options.getMTU() + ", autoRoute=" + options.getAutoRoute());

        Builder builder = new Builder();
        builder.setSession("Null VPN");

        int mtu = options.getMTU();
        builder.setMtu(mtu > 0 ? mtu : 1500);

        // Configure IPv4 addresses
        RoutePrefixIterator inet4 = options.getInet4Address();
        boolean hasIpv4 = false;
        while (inet4 != null && inet4.hasNext()) {
            RoutePrefix prefix = inet4.next();
            builder.addAddress(prefix.address(), prefix.prefix());
            hasIpv4 = true;
            Log.d(TAG, "openTun: addAddress IPv4 " + prefix.address() + "/" + prefix.prefix());
        }
        if (!hasIpv4) {
            builder.addAddress("172.19.0.1", 30);
        }

        // Configure IPv6 addresses
        boolean hasIpv6 = false;
        RoutePrefixIterator inet6 = options.getInet6Address();
        while (inet6 != null && inet6.hasNext()) {
            RoutePrefix prefix = inet6.next();
            try {
                builder.addAddress(prefix.address(), prefix.prefix());
                hasIpv6 = true;
                Log.d(TAG, "openTun: addAddress IPv6 " + prefix.address() + "/" + prefix.prefix());
            } catch (Exception e) {
                Log.w(TAG, "openTun: IPv6 address rejected by kernel: " + e.getMessage());
            }
        }

        // Configure Routing: Default routes or specific routes
        if (options.getAutoRoute()) {
            builder.addRoute("0.0.0.0", 0);
            if (hasIpv6) {
                try {
                    builder.addRoute("::", 0);
                } catch (Exception e) {
                    Log.w(TAG, "openTun: IPv6 default route rejected: " + e.getMessage());
                }
            }
        } else {
            RoutePrefixIterator routes4 = options.getInet4RouteAddress();
            boolean hasRoute4 = false;
            while (routes4 != null && routes4.hasNext()) {
                RoutePrefix prefix = routes4.next();
                builder.addRoute(prefix.address(), prefix.prefix());
                hasRoute4 = true;
            }
            if (!hasRoute4) {
                builder.addRoute("0.0.0.0", 0);
            }

            RoutePrefixIterator routes6 = options.getInet6RouteAddress();
            while (routes6 != null && routes6.hasNext()) {
                RoutePrefix prefix = routes6.next();
                try {
                    builder.addRoute(prefix.address(), prefix.prefix());
                } catch (Exception ignored) {}
            }
        } 

        // Configure DNS servers
        boolean hasDns = false;
        try {
            StringIterator dnsServers = options.getDNSServerAddress();
            while (dnsServers != null && dnsServers.hasNext()) {
                String dns = dnsServers.next();
                if (dns != null && !dns.trim().isEmpty()) {
                    try {
                        builder.addDnsServer(dns.trim());
                        hasDns = true;
                        Log.d(TAG, "openTun: addDnsServer from options: " + dns.trim());
                    } catch (Exception e) {
                        Log.w(TAG, "openTun: Failed to add DNS server " + dns + ": " + e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "openTun: getDNSServerAddress: " + e.getMessage());
        }
        if (!hasDns) {
            builder.addDnsServer("172.19.0.1");
            builder.addDnsServer("1.1.1.1");
            builder.addDnsServer("8.8.8.8");
        }

        // Configure Package Exclusions: Exclude Null VPN itself to prevent routing loops!
        StringIterator excludePackages = options.getExcludePackage();
        while (excludePackages != null && excludePackages.hasNext()) {
            String pkg = excludePackages.next();
            try {
                builder.addDisallowedApplication(pkg);
            } catch (Exception ignored) {}
        }
        try {
            builder.addDisallowedApplication(getPackageName());
        } catch (Exception e) {
            Log.w(TAG, "openTun: Failed to disallow own package: " + e.getMessage());
        }

        builder.setBlocking(false);

        ParcelFileDescriptor pfd = builder.establish();
        if (pfd == null) {
            throw new IllegalStateException("VpnService.Builder.establish() returned null - system denied TUN interface creation");
        }

        this.tunInterface = pfd;
        int fd = pfd.getFd();
        Log.i(TAG, "openTun: TUN established successfully with fd=" + fd);
        DiagnosticLog.record("TUN_OPEN", "TUN established successfully with fd=" + fd + " MTU=" + mtu);

        if ("core_running".equals(currentStatus) || "connecting".equals(currentStatus)) {
            currentStatus = "tunnel_verified";
            DiagnosticLog.record("STATE_CHANGE", "Tunnel state transitioned to tunnel_verified");
            if (eventListener != null) {
                eventListener.onStateChange("tunnel_verified", "TUN interface established");
            }
        }
        return fd;
    }

    public void writeLog(String message) {
        Log.d(TAG, "sing-box: " + message);
    }

    @Override
    public boolean useProcFS() {
        return false;
    }

    @Override
    public ConnectionOwner findConnectionOwner(int ipProtocol, String sourceAddress, int sourcePort, String destinationAddress, int destinationPort) throws Exception {
        return null;
    }

    public String packageNameByUid(int uid) {
        try {
            String[] packages = getPackageManager().getPackagesForUid(uid);
            if (packages != null && packages.length > 0) {
                return packages[0];
            }
        } catch (Exception ignored) {}
        return "";
    }

    public int uidByPackageName(String packageName) {
        try {
            return getPackageManager().getPackageUid(packageName, 0);
        } catch (Exception e) {
            return -1;
        }
    }

    public boolean usePlatformDefaultInterfaceMonitor() {
        return false;
    }

    @Override
    public void startDefaultInterfaceMonitor(InterfaceUpdateListener listener) throws Exception {}

    @Override
    public void closeDefaultInterfaceMonitor(InterfaceUpdateListener listener) throws Exception {}

    public boolean usePlatformInterfaceGetter() {
        return false;
    }

    @Override
    public NetworkInterfaceIterator getInterfaces() throws Exception {
        return null;
    }

    @Override
    public boolean underNetworkExtension() {
        return false;
    }

    @Override
    public boolean includeAllNetworks() {
        return false;
    }

    @Override
    public WIFIState readWIFIState() {
        return null;
    }

    @Override
    public void clearDNSCache() {}

    @Override
    public void sendNotification(io.nekohasekai.libbox.Notification notification) throws Exception {
        if (notification != null) {
            Log.i(TAG, "libbox notification: " + notification.getTitle() + " - " + notification.getBody());
        }
    }

    @Override
    public void cancelNotification(String tag, int id) throws Exception {}

    @Override
    public void checkPlatformShell() throws Exception {}

    @Override
    public void closeNeighborMonitor(NeighborUpdateListener listener) throws Exception {}

    @Override
    public BridgeSession createBridge(BridgeOptions options) throws Exception {
        return null;
    }

    @Override
    public LocalDNSTransport localDNSTransport() {
        return null;
    }

    @Override
    public String lookupSFTPServer() throws Exception {
        return null;
    }

    @Override
    public PlatformUser lookupUser(String user) throws Exception {
        return null;
    }

    @Override
    public ShellSession openShellSession(PlatformUser user, String command, StringIterator env, String workDir, int cols, int rows) throws Exception {
        return null;
    }

    @Override
    public String readSystemSSHHostKey() throws Exception {
        return null;
    }

    @Override
    public void registerMyInterface(String name) {}

    @Override
    public void startNeighborMonitor(NeighborUpdateListener listener) throws Exception {}

    @Override
    public String tailscaleHostname() {
        return "";
    }

    @Override
    public boolean usePlatformBridge() {
        return false;
    }

    @Override
    public boolean usePlatformShell() {
        return false;
    }

    // ==========================================
    // CommandServerHandler Implementation (sing-box-lx v1.14.1-lx.8)
    // ==========================================

    @Override
    public void serviceReload() throws Exception {
        Log.i(TAG, "CommandServerHandler: serviceReload requested");
    }

    @Override
    public void serviceStop() throws Exception {
        Log.i(TAG, "CommandServerHandler: serviceStop requested by core");
        DiagnosticLog.record("STOP_REQUEST_SOURCE", "serviceStop callback from core");
        new Thread(() -> {
            stopVpn("serviceStop callback");
        }, "NullVpn-core-stop").start();
    }

    @Override
    public SystemProxyStatus getSystemProxyStatus() throws Exception {
        return null;
    }

    @Override
    public void setSystemProxyEnabled(boolean isEnabled) throws Exception {}

    @Override
    public void writeDebugMessage(String message) {
        Log.d(TAG, "libbox debug: " + message);
    }

    @Override
    public void triggerNativeCrash() throws Exception {}

    @Override
    public int connectSSHAgent() throws Exception {
        return -1;
    }

    // ==========================================
    // Telemetry and Health Checks (Safe Concurrency)
    // ==========================================

    private synchronized void startTelemetryLoop() {
        stopTelemetryLoop();
        probeExecutor = Executors.newSingleThreadExecutor();
        telemetryHandler = new Handler(Looper.getMainLooper());
        telemetryRunnable = new Runnable() {
            private int tickCount = 0;

            @Override
            public void run() {
                if (isStopping.get()) {
                    return;
                }

                uptimeSeconds++;
                tickCount++;

                final long finalRxSpeed = coreDownlinkSpeed;
                final long finalTxSpeed = coreUplinkSpeed;
                final long totalRxBytes = coreDownlinkTotal;
                final long totalTxBytes = coreUplinkTotal;

                // Concurrency control: run probe once every 5 seconds, maximum ONE ping probe active at any given time
                if (tickCount % 5 == 0 && !isStopping.get() && isProbing.compareAndSet(false, true)) {
                    final ExecutorService exec = probeExecutor;
                    if (exec != null && !exec.isShutdown()) {
                        try {
                            exec.execute(() -> {
                                try {
                                    if (isStopping.get()) {
                                        return;
                                    }
                                    long pingResult = pingServer(currentServerHost, currentServerPort);
                                    lastPingLatency = pingResult > 0 ? (int) pingResult : 0;
                                } finally {
                                    isProbing.set(false);
                                }
                            });
                        } catch (Exception e) {
                            isProbing.set(false);
                        }
                    } else {
                        isProbing.set(false);
                    }
                }

                if (eventListener != null && !isStopping.get() &&
                    ("connected".equals(currentStatus) || "tunnel_verified".equals(currentStatus) || "core_running".equals(currentStatus))) {
                    eventListener.onTelemetry(
                        finalRxSpeed,
                        finalTxSpeed,
                        totalRxBytes,
                        totalTxBytes,
                        lastPingLatency,
                        uptimeSeconds,
                        1
                    );
                }

                if (telemetryHandler != null && !isStopping.get()) {
                    telemetryHandler.postDelayed(this, 1000);
                }
            }
        };
        telemetryHandler.postDelayed(telemetryRunnable, 1000);
    }

    private synchronized void stopTelemetryLoop() {
        if (telemetryHandler != null && telemetryRunnable != null) {
            telemetryHandler.removeCallbacks(telemetryRunnable);
            telemetryHandler = null;
            telemetryRunnable = null;
        }
        if (probeExecutor != null) {
            try {
                probeExecutor.shutdownNow();
            } catch (Exception ignored) {}
            probeExecutor = null;
        }
        isProbing.set(false);
    }

    @Override
    public void onDestroy() {
        DiagnosticLog.record("SERVICE_DESTROYED", "onDestroy called");
        stopVpn("onDestroy");
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRevoke() {
        DiagnosticLog.record("STOP_REQUEST_SOURCE", "onRevoke: VPN permission revoked");
        stopVpn("onRevoke");
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.onRevoke();
    }

    public static boolean runNetworkDiagnostics() {
        NullVpnService service = activeInstance;
        if (service != null && service.isStopping.get()) {
            return false;
        }
        Socket testSocket = null;
        try {
            long startTime = System.currentTimeMillis();
            testSocket = new Socket();
            if (service != null && !service.isStopping.get()) {
                try {
                    service.protect(testSocket);
                } catch (Throwable ignored) {}
            }
            testSocket.connect(new InetSocketAddress("1.1.1.1", 53), 1500);
            long latency = System.currentTimeMillis() - startTime;
            Log.i(TAG, "NetworkDiagnostics SUCCESS: Routed packet to 1.1.1.1:53 in " + latency + "ms");
            testSocket.close();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "NetworkDiagnostics FAILED to route packet through VPN: " + e.getMessage());
            if (testSocket != null) {
                try {
                    testSocket.close();
                } catch (Exception ignored) {}
            }
            return false;
        }
    }

    public static long pingServer(String host, int port) {
        NullVpnService service = activeInstance;
        if (service != null && service.isStopping.get()) {
            return -1L;
        }
        Socket testSocket = null;
        try {
            // If port is 51820 (WireGuard UDP) or non-TCP, probe standard DNS/HTTPS port instead
            String targetHost = (host != null && !host.trim().isEmpty() && port != 51820) ? host.trim() : "1.1.1.1";
            int targetPort = (port > 0 && port <= 65535 && port != 51820) ? port : 53;
            long startTime = System.currentTimeMillis();
            testSocket = new Socket();
            if (service != null && !service.isStopping.get()) {
                try {
                    service.protect(testSocket);
                } catch (Throwable ignored) {}
            }
            testSocket.connect(new InetSocketAddress(targetHost, targetPort), 1200);
            long latency = System.currentTimeMillis() - startTime;
            testSocket.close();
            return latency;
        } catch (Exception e) {
            if (testSocket != null) {
                try {
                    testSocket.close();
                } catch (Exception ignored) {}
            }
            return -1L;
        }
    }
}
