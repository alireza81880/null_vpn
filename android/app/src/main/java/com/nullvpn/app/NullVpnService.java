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
import android.util.Base64;
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
import java.util.concurrent.atomic.AtomicLong;

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

        public static String scrubSecrets(String msg) {
            if (msg == null) return "";
            return msg.replaceAll("([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "[REDACTED-UUID]")
                      .replaceAll("(?i)(private_key|password|pre_shared_key|public_key|token|auth_token|secret)[\"':= ]+([A-Za-z0-9+/=_-]{16,})", "$1=[REDACTED]")
                      .replaceAll("(?i)(https?://[^\\s?#]+\\?[^\\s]+)", "[REDACTED-URL-WITH-PARAMS]");
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

    // Single-threaded FIFO executor to strictly serialize all VPN lifecycle operations (start, stop, error cleanup)
    private final ExecutorService vpnLifecycleExecutor = Executors.newSingleThreadExecutor();

    // Generation counter to detect, supersede, and discard stale startup/shutdown attempts
    private final AtomicLong sessionGeneration = new AtomicLong(0);

    // Lock guarding native CommandServer, CommandClient, and TUN descriptor creation/destruction
    private final Object nativeResourceLock = new Object();

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

        // 1. Pre-flight native validation via sing-box Go engine (libbox.aar)
        try {
            Libbox.checkConfig(configJson);
        } catch (Throwable t) {
            if (t instanceof UnsatisfiedLinkError || t instanceof NoClassDefFoundError) {
                DiagnosticLog.record("CONFIG_VALIDATION_WARNING", "Libbox.checkConfig unavailable in environment: " + t.getMessage());
                Log.w(TAG, "Libbox.checkConfig unavailable in current runtime: " + t.getMessage());
            } else {
                DiagnosticLog.record("CONFIG_VALIDATION_ERROR", "Native Libbox.checkConfig rejected configuration: " + t.getMessage());
                throw new IllegalArgumentException("Native sing-box validation failed: " + t.getMessage(), t);
            }
        }

        // 2. High-level structural and semantic validation
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

            // Track all registered tags across endpoints and outbounds to prevent duplicate tags
            java.util.HashSet<String> allTags = new java.util.HashSet<>();

            if (root.has("endpoints")) {
                JSONArray endpoints = root.optJSONArray("endpoints");
                if (endpoints != null) {
                    for (int i = 0; i < endpoints.length(); i++) {
                        JSONObject ep = endpoints.getJSONObject(i);
                        String epTag = ep.optString("tag", "");
                        if (!epTag.isEmpty()) {
                            if (!allTags.add(epTag)) {
                                throw new IllegalArgumentException("Duplicate tag across endpoints/outbounds: " + epTag);
                            }
                        }
                    }
                }
            }

            for (int i = 0; i < outbounds.length(); i++) {
                JSONObject o = outbounds.getJSONObject(i);
                String oTag = o.optString("tag", "");
                if (!oTag.isEmpty()) {
                    if (!allTags.add(oTag)) {
                        throw new IllegalArgumentException("Duplicate tag across endpoints/outbounds: " + oTag);
                    }
                }
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
                String privateKey = primaryProxy.optString("private_key", "").trim();
                if (privateKey.isEmpty()) {
                    throw new IllegalArgumentException("WireGuard configuration missing required 'private_key'");
                }
                if (!isValidBase64Key(privateKey, 32)) {
                    throw new IllegalArgumentException("WireGuard private_key must be a valid 32-byte Base64 key");
                }

                JSONArray peers = primaryProxy.optJSONArray("peers");
                if (isEndpoint || (peers != null && peers.length() > 0)) {
                    if (peers == null || peers.length() == 0) {
                        throw new IllegalArgumentException("WireGuard endpoint missing required 'peers' array");
                    }
                    JSONObject peer0 = peers.getJSONObject(0);
                    String peerAddr = peer0.optString("address", peer0.optString("server", ""));
                    String peerPubKey = peer0.optString("public_key", "").trim();
                    if (peerAddr.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard peer missing 'address' / 'server'");
                    }
                    if (peerPubKey.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard peer missing required 'public_key'");
                    }
                    if (!isValidBase64Key(peerPubKey, 32)) {
                        throw new IllegalArgumentException("WireGuard peer public_key must be a valid 32-byte Base64 key");
                    }
                    String peerPsk = peer0.optString("pre_shared_key", "").trim();
                    if (!peerPsk.isEmpty() && !isValidBase64Key(peerPsk, 32)) {
                        throw new IllegalArgumentException("WireGuard peer pre_shared_key must be a valid 32-byte Base64 key");
                    }
                } else {
                    String server = primaryProxy.optString("server", "");
                    String peerPublicKey = primaryProxy.optString("peer_public_key", "").trim();
                    if (server.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard outbound missing 'server' address");
                    }
                    if (peerPublicKey.isEmpty()) {
                        throw new IllegalArgumentException("WireGuard outbound missing required 'peer_public_key'");
                    }
                    if (!isValidBase64Key(peerPublicKey, 32)) {
                        throw new IllegalArgumentException("WireGuard outbound peer_public_key must be a valid 32-byte Base64 key");
                    }
                    String outboundPsk = primaryProxy.optString("pre_shared_key", "").trim();
                    if (!outboundPsk.isEmpty() && !isValidBase64Key(outboundPsk, 32)) {
                        throw new IllegalArgumentException("WireGuard outbound pre_shared_key must be a valid 32-byte Base64 key");
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
            } else if ("vmess".equalsIgnoreCase(type)) {
                String server = primaryProxy.optString("server", "");
                String uuid = primaryProxy.optString("uuid", "");
                if (server.isEmpty()) {
                    throw new IllegalArgumentException("VMess outbound missing 'server' address");
                }
                if (uuid.isEmpty()) {
                    throw new IllegalArgumentException("VMess outbound missing 'uuid'");
                }
            } else if ("shadowsocks".equalsIgnoreCase(type)) {
                String server = primaryProxy.optString("server", "");
                String password = primaryProxy.optString("password", "");
                if (server.isEmpty()) {
                    throw new IllegalArgumentException("Shadowsocks outbound missing 'server' address");
                }
                if (password.isEmpty()) {
                    throw new IllegalArgumentException("Shadowsocks outbound missing 'password'");
                }
            }

            // Verify DNS detour references if present
            if (root.has("dns")) {
                JSONObject dns = root.optJSONObject("dns");
                if (dns != null && dns.has("servers")) {
                    JSONArray dnsServers = dns.optJSONArray("servers");
                    if (dnsServers != null) {
                        for (int i = 0; i < dnsServers.length(); i++) {
                            JSONObject srv = dnsServers.getJSONObject(i);
                            String detour = srv.optString("detour", "");
                            if (!detour.isEmpty() && !allTags.contains(detour)) {
                                throw new IllegalArgumentException("DNS server detours to unknown outbound/endpoint tag: " + detour);
                            }
                        }
                    }
                }
            }

            // Verify Route rule destinations if present
            if (root.has("route")) {
                JSONObject route = root.optJSONObject("route");
                if (route != null) {
                    String finalOutbound = route.optString("final", "");
                    if (!finalOutbound.isEmpty() && !allTags.contains(finalOutbound)) {
                        throw new IllegalArgumentException("Route final destination references unknown outbound/endpoint tag: " + finalOutbound);
                    }
                    if (route.has("rules")) {
                        JSONArray rules = route.optJSONArray("rules");
                        if (rules != null) {
                            for (int i = 0; i < rules.length(); i++) {
                                JSONObject rule = rules.getJSONObject(i);
                                String outbound = rule.optString("outbound", "");
                                if (!outbound.isEmpty() && !allTags.contains(outbound)) {
                                    throw new IllegalArgumentException("Route rule references unknown outbound/endpoint tag: " + outbound);
                                }
                            }
                        }
                    }
                }
            }

        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Malformed sing-box JSON configuration: " + e.getMessage(), e);
        }
    }

    private static boolean isValidBase64Key(String key, int expectedBytes) {
        if (key == null) return false;
        String trimmed = key.trim();
        if (trimmed.length() >= 2 && ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
            trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
        }
        if (trimmed.isEmpty()) return false;
        try {
            String normalized = trimmed.replace('-', '+').replace('_', '/');
            int padLen = (4 - (normalized.length() % 4)) % 4;
            StringBuilder sb = new StringBuilder(normalized);
            for (int i = 0; i < padLen; i++) sb.append('=');
            byte[] decoded = Base64.decode(sb.toString(), Base64.DEFAULT);
            return decoded != null && decoded.length == expectedBytes;
        } catch (Throwable t) {
            return false;
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
            DiagnosticLog.record("SERVICE_START", "onStartCommand with null intent (restarted by system - terminating)");
            stopSelf();
            return START_NOT_STICKY;
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

        return START_NOT_STICKY;
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

    private void notifyStateChange(String status, String message) {
        currentStatus = status;
        final VpnEventListener listener = eventListener;
        if (listener != null) {
            try {
                listener.onStateChange(status, message);
            } catch (Throwable t) {
                Log.w(TAG, "Error in eventListener.onStateChange: " + t.getMessage());
            }
        }
    }

    private void startVpn(final String configJson) {
        final long sessionId = sessionGeneration.incrementAndGet();
        isStopping.set(false);
        isRunning.set(true);
        DiagnosticLog.record("CONFIG_RECEIVED", "session #" + sessionId + " received (payload length: " + (configJson != null ? configJson.length() : 0) + ")");
        DiagnosticLog.record("CORE_START", "Queueing startVpn session #" + sessionId);
        notifyStateChange("connecting", null);

        // Satisfy Android 5-second startForeground contract immediately on the main thread
        promoteToForeground(buildNotification("Initializing sing-box core..."));
        DiagnosticLog.record("FOREGROUND_STARTED", "session #" + sessionId + " foreground service active");

        vpnLifecycleExecutor.execute(() -> {
            executeStartVpn(configJson, sessionId);
        });
    }

    private void executeStartVpn(String configJson, long sessionId) {
        // Check if session was superseded or cancelled before worker execution started
        if (sessionGeneration.get() != sessionId || isStopping.get()) {
            DiagnosticLog.record("CORE_START", "startVpn session #" + sessionId + " superseded before startup began");
            return;
        }

        DiagnosticLog.record("CORE_START", "Executing sing-box core startup for session #" + sessionId);

        try {
            // Step 1: Validate config payload
            validateConfig(configJson);

            // Extract remote endpoint for latency telemetry
            extractServerEndpoint(configJson);

            // Step 2: Clean up previous tunnel and native instances cleanly under lock
            synchronized (nativeResourceLock) {
                cleanupNativeResourcesInternal(false);
            }

            // Check if superseded or cancelled during cleanup
            if (sessionGeneration.get() != sessionId || isStopping.get()) {
                DiagnosticLog.record("CORE_START", "startVpn session #" + sessionId + " cancelled after resource cleanup");
                synchronized (nativeResourceLock) {
                    cleanupNativeResourcesInternal(false);
                }
                return;
            }

            // Step 3: Initialize libbox environment directories
            DiagnosticLog.record("LIBBOX_SETUP_START", "session #" + sessionId + " starting Libbox.setup");
            SetupOptions setupOptions = new SetupOptions();
            setupOptions.setBasePath(getFilesDir().getPath());
            setupOptions.setWorkingPath(getFilesDir().getPath());
            setupOptions.setTempPath(getCacheDir().getPath());
            setupOptions.setFixAndroidStack(true);

            Libbox.setup(setupOptions);
            DiagnosticLog.record("LIBBOX_SETUP_SUCCESS", "session #" + sessionId + " Libbox.setup finished successfully");
            Log.i(TAG, "Libbox.setup completed successfully");

            // Check if cancelled before starting CommandServer
            if (sessionGeneration.get() != sessionId || isStopping.get()) {
                DiagnosticLog.record("CORE_START", "startVpn session #" + sessionId + " cancelled before CommandServer start");
                return;
            }

            // Step 4: Create and start CommandServer under lock
            CommandServer cs;
            synchronized (nativeResourceLock) {
                if (sessionGeneration.get() != sessionId || isStopping.get()) {
                    return;
                }
                DiagnosticLog.record("COMMAND_SERVER_START", "session #" + sessionId + " creating and starting CommandServer");
                cs = new CommandServer(this, this);
                cs.start();
                this.commandServer = cs;
            }
            DiagnosticLog.record("COMMAND_SERVER_READY", "session #" + sessionId + " CommandServer ready");
            Log.i(TAG, "Libbox CommandServer started");

            // Step 5: Start the core service via CommandServer with JSON config and PlatformInterface
            // Note: startOrReloadService will synchronously trigger openTun(TunOptions)
            DiagnosticLog.record("CORE_START_REQUEST", "session #" + sessionId + " invoking startOrReloadService");
            cs.startOrReloadService(configJson, new OverrideOptions());
            DiagnosticLog.record("CORE_START_SUCCESS", "sing-box core service started successfully via CommandServer (session #" + sessionId + ")");

            // Check if cancelled after startOrReloadService
            if (sessionGeneration.get() != sessionId || isStopping.get()) {
                DiagnosticLog.record("CORE_START", "startVpn session #" + sessionId + " cancelled after core start; rolling back");
                synchronized (nativeResourceLock) {
                    cleanupNativeResourcesInternal(false);
                }
                return;
            }

            DiagnosticLog.record("STATE_CHANGE", "Tunnel state transitioned to core_running");
            notifyStateChange("core_running", "sing-box core initialized");

            // Step 6: Connect CommandClient for real-time telemetry from core
            synchronized (nativeResourceLock) {
                if (sessionGeneration.get() != sessionId || isStopping.get()) {
                    cleanupNativeResourcesInternal(false);
                    return;
                }
                setupCommandClient(sessionId);
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
            Log.i(TAG, "NullVpnService running in production mode (session #" + sessionId + ")");

        } catch (Throwable t) {
            String errorMsg = t.getMessage() != null ? t.getMessage() : t.toString();
            String sanitizedError = DiagnosticLog.scrubSecrets(errorMsg);
            Log.e(TAG, "Failed to start sing-box core for session #" + sessionId + ": " + sanitizedError, t);
            DiagnosticLog.record("CORE_ERROR", "Failed to start sing-box core: " + sanitizedError);

            synchronized (nativeResourceLock) {
                cleanupNativeResourcesInternal(false);
            }

            // Only report error if this session wasn't already superseded by a new request or intentional stop
            if (sessionGeneration.get() == sessionId) {
                isRunning.set(false);
                isStopping.set(false);
                notifyStateChange("error", sanitizedError);
                try {
                    stopForeground(true);
                } catch (Exception ignored) {}
                stopSelf();
            }
        }
    }

    private void stopVpn(final String source) {
        final long stopSessionId = sessionGeneration.incrementAndGet();
        DiagnosticLog.record("DISCONNECT_REQUEST", "session #" + stopSessionId + " requested from " + source);
        DiagnosticLog.record("STOP_REQUEST_SOURCE", "stopVpn requested from " + source + " for session #" + stopSessionId);

        // Idempotency: if already disconnected, not running, and all native handles are null, no-op early
        if (!isRunning.get() && "disconnected".equals(currentStatus) && commandServer == null && tunInterface == null) {
            Log.i(TAG, "stopVpn ignored: already disconnected and idle (source: " + source + ")");
            return;
        }

        isStopping.set(true);
        notifyStateChange("disconnecting", "Shutting down tunnel");
        stopTelemetryLoop();

        vpnLifecycleExecutor.execute(() -> {
            executeStopVpn(source, stopSessionId);
        });
    }

    private void executeStopVpn(String source, long stopSessionId) {
        DiagnosticLog.record("CORE_STOP_REQUEST", "session #" + stopSessionId + " executing shutdown from " + source);
        DiagnosticLog.record("CORE_STOP", "Executing shutdown from " + source + " (was " + currentStatus + ", stopSession #" + stopSessionId + ")");

        stopTelemetryLoop();

        synchronized (nativeResourceLock) {
            boolean fromServiceStopCallback = "serviceStop callback".equals(source);
            cleanupNativeResourcesInternal(fromServiceStopCallback);
        }

        // Only transition to disconnected if a newer startup hasn't been queued in the meantime
        if (sessionGeneration.get() == stopSessionId) {
            isRunning.set(false);
            isStopping.set(false);
            notifyStateChange("disconnected", null);

            DiagnosticLog.record("CORE_STOP", "Core stopped cleanly from " + source);

            try {
                stopForeground(true);
            } catch (Exception ignored) {}
            stopSelf();
        } else {
            DiagnosticLog.record("CORE_STOP", "Stop completed but superseded by newer session #" + sessionGeneration.get());
        }
    }

    private void cleanupNativeResourcesInternal(boolean fromServiceStopCallback) {
        // 1. CommandClient
        if (commandClient != null) {
            DiagnosticLog.record("COMMAND_CLIENT_DISCONNECT", "Disconnecting CommandClient");
            try {
                commandClient.disconnect();
            } catch (Throwable t) {
                Log.w(TAG, "Error disconnecting CommandClient: " + t.getMessage());
            }
            commandClient = null;
        }

        // 2. CommandServer
        if (commandServer != null) {
            CommandServer cs = commandServer;
            commandServer = null;
            if (!fromServiceStopCallback) {
                DiagnosticLog.record("COMMAND_SERVER_CLOSE_SERVICE", "Closing CommandServer service");
                try {
                    cs.closeService();
                } catch (Exception e) {
                    DiagnosticLog.record("CORE_ERROR", "Error in commandServer.closeService: " + e.getMessage());
                }
            }
            DiagnosticLog.record("COMMAND_SERVER_CLOSE", "Closing CommandServer");
            try {
                cs.close();
            } catch (Exception e) {
                DiagnosticLog.record("CORE_ERROR", "Error in commandServer.close: " + e.getMessage());
            }
        }

        // 3. TUN Interface
        if (tunInterface != null) {
            ParcelFileDescriptor tun = tunInterface;
            tunInterface = null;
            DiagnosticLog.record("TUN_CLOSE", "Closing TUN interface");
            try {
                tun.close();
            } catch (Exception e) {
                DiagnosticLog.record("CORE_ERROR", "Error closing TUN interface: " + e.getMessage());
            }
        }
    }

    private void extractServerEndpoint(String configJson) {
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
                            return;
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
                                return;
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    private void setupCommandClient(final long sessionId) {
        try {
            CommandClientOptions clientOpts = new CommandClientOptions();
            clientOpts.addCommand(Libbox.CommandStatus);
            clientOpts.addCommand(Libbox.CommandLog);
            clientOpts.setStatusInterval(1000000000L); // 1 sec interval

            commandClient = new CommandClient(new CommandClientHandler() {
                @Override
                public void connected() {
                    Log.i(TAG, "CommandClient connected to sing-box core (session #" + sessionId + ")");
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
                        try {
                            while (messageList.hasNext()) {
                                LogEntry entry = messageList.next();
                                if (entry != null) {
                                    String msg = entry.getMessage();
                                    if (msg != null && (msg.contains("ERROR") || msg.contains("failed") || msg.contains("FATAL"))) {
                                        DiagnosticLog.record("OUTBOUND_ERROR", msg);
                                    }
                                }
                            }
                        } catch (Throwable t) {
                            Log.w(TAG, "Safe handling: exception iterating native log messages: " + t.getMessage());
                        }
                    }
                }

                @Override
                public void writeOutbounds(OutboundGroupItemIterator iterator) {}

                @Override
                public void writeStatus(StatusMessage status) {
                    if (status != null && !isStopping.get() && sessionGeneration.get() == sessionId) {
                        coreDownlinkSpeed = status.getDownlink();
                        coreUplinkSpeed = status.getUplink();
                        coreDownlinkTotal = status.getDownlinkTotal();
                        coreUplinkTotal = status.getUplinkTotal();

                        if (("core_running".equals(currentStatus) || "tunnel_verified".equals(currentStatus)) &&
                            (coreDownlinkTotal > 0 || status.getConnectionsOut() > 0)) {
                            DiagnosticLog.record("STATE_CHANGE", "Tunnel verified and passing traffic (connected)");
                            notifyStateChange("connected", "Tunnel active and passing traffic");
                        }
                    }
                }
            }, clientOpts);
            commandClient.connect();
        } catch (Throwable t) {
            Log.w(TAG, "CommandClient setup note: " + t.getMessage());
        }
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

        synchronized (nativeResourceLock) {
            if (isStopping.get()) {
                throw new IllegalStateException("openTun aborted: service is stopping");
            }

            if (this.tunInterface != null) {
                try {
                    this.tunInterface.close();
                } catch (Exception ignored) {}
                this.tunInterface = null;
            }

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

            DiagnosticLog.record("TUN_ESTABLISH_START", "Requesting VpnService.Builder.establish() with MTU=" + mtu);
            ParcelFileDescriptor pfd = builder.establish();
            if (pfd == null) {
                DiagnosticLog.record("TUN_ESTABLISH_FAILURE", "VpnService.Builder.establish() returned null");
                throw new IllegalStateException("VpnService.Builder.establish() returned null - system denied TUN interface creation");
            }
            DiagnosticLog.record("TUN_ESTABLISH_SUCCESS", "VpnService.Builder.establish() returned valid PFD");

            if (isStopping.get()) {
                try {
                    pfd.close();
                } catch (Exception ignored) {}
                throw new IllegalStateException("openTun aborted: service was stopped while establishing TUN");
            }

            this.tunInterface = pfd;
            int fd = pfd.getFd();
            Log.i(TAG, "openTun: TUN established successfully with fd=" + fd);
            DiagnosticLog.record("TUN_OPEN", "TUN established successfully with fd=" + fd + " MTU=" + mtu);

            if ("core_running".equals(currentStatus) || "connecting".equals(currentStatus)) {
                DiagnosticLog.record("STATE_CHANGE", "Tunnel state transitioned to tunnel_verified");
                notifyStateChange("tunnel_verified", "TUN interface established");
            }
            return fd;
        }
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
        stopVpn("serviceStop callback");
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
        sessionGeneration.incrementAndGet();
        isStopping.set(true);
        stopTelemetryLoop();
        synchronized (nativeResourceLock) {
            cleanupNativeResourcesInternal(false);
        }
        notifyStateChange("disconnected", "Service destroyed");
        isRunning.set(false);
        isStopping.set(false);
        if (activeInstance == this) {
            activeInstance = null;
        }
        vpnLifecycleExecutor.shutdownNow();
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

    public static class DiagnosticProbeResult {
        public final boolean physicalInternet;
        public final boolean coreReachability;
        public final String tunnelReachability; // "true", "false", or "unknown"
        public final long latencyMs;
        public final String message;

        public DiagnosticProbeResult(boolean physicalInternet, boolean coreReachability, String tunnelReachability, long latencyMs, String message) {
            this.physicalInternet = physicalInternet;
            this.coreReachability = coreReachability;
            this.tunnelReachability = tunnelReachability;
            this.latencyMs = latencyMs;
            this.message = message;
        }
    }

    public static boolean runNetworkDiagnostics() {
        return runNetworkDiagnosticsProbe().coreReachability;
    }

    public static DiagnosticProbeResult runNetworkDiagnosticsProbe() {
        NullVpnService service = activeInstance;
        if (service != null && service.isStopping.get()) {
            return new DiagnosticProbeResult(false, false, "false", -1L, "VPN service is stopping");
        }

        // 1. Probe physical internet via socket explicitly protected from VPN routing
        boolean physicalInternet = false;
        long physicalLatency = -1L;
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
            physicalLatency = System.currentTimeMillis() - startTime;
            testSocket.close();
            physicalInternet = true;
            Log.i(TAG, "DiagnosticProbe physical probe SUCCESS in " + physicalLatency + "ms");
        } catch (Exception e) {
            Log.w(TAG, "DiagnosticProbe physical probe FAILED: " + e.getMessage());
            if (testSocket != null) {
                try {
                    testSocket.close();
                } catch (Exception ignored) {}
            }
        }

        // 2. Query sing-box core reachability and tunnel reachability via libbox CommandClient URLTestOutbound
        boolean coreReachability = false;
        String tunnelReachability = "unknown";
        long tunnelLatency = physicalLatency;
        String message = physicalInternet ? "Physical internet available; tunnel probe unproven" : "Physical internet unreachable";

        if (service != null && !service.isStopping.get()) {
            CommandClient client = service.commandClient;
            if (client != null) {
                coreReachability = true;
                try {
                    // Test outbound directly through sing-box routing engine (proxy-out WireGuard outbound)
                    // URLTestOutbound does NOT use service.protect(socket); sing-box routes it natively through proxy-out
                    URLTestOutboundResult res = client.urlTestOutbound("proxy-out", "http://cp.cloudflare.com/generate_204", 3000);
                    if (res != null) {
                        String err = res.getError();
                        int delay = res.getDelay();
                        if (err == null || err.trim().isEmpty()) {
                            tunnelReachability = "true";
                            tunnelLatency = delay > 0 ? delay : physicalLatency;
                            message = "Tunnel traffic verified via WireGuard outbound (" + tunnelLatency + "ms)";
                            Log.i(TAG, "DiagnosticProbe URLTestOutbound SUCCESS: delay=" + delay + "ms");
                        } else {
                            tunnelReachability = "false";
                            message = "Tunnel outbound probe returned error: " + err;
                            Log.w(TAG, "DiagnosticProbe URLTestOutbound FAILED: " + err);
                        }
                    } else {
                        tunnelReachability = "unknown";
                        message = "Tunnel outbound probe returned null result";
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "DiagnosticProbe URLTestOutbound exception: " + t.getMessage());
                    // Active probe failed; mark as false or unknown without promoting based on telemetry
                    tunnelReachability = "false";
                    message = "Tunnel outbound probe failed (" + t.getMessage() + ")";
                }
            } else {
                if (service.isRunning.get()) {
                    coreReachability = true;
                    tunnelReachability = "unknown";
                    message = "Core running; command client not yet initialized";
                }
            }
        }

        return new DiagnosticProbeResult(
            physicalInternet,
            coreReachability,
            tunnelReachability,
            tunnelLatency >= 0 ? tunnelLatency : physicalLatency,
            message
        );
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
