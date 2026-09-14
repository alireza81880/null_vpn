// electron/preload.ts
var import_electron = require("electron");
var vpnEngine = {
  /**
   * Dispatches command to spawn sing-box core with user configuration
   */
  start: (config) => {
    return import_electron.ipcRenderer.invoke("vpn:start", config);
  },
  /**
   * Dispatches command to gracefully kill active sing-box child process
   */
  stop: () => {
    return import_electron.ipcRenderer.invoke("vpn:stop");
  },
  /**
   * Queries active daemon status
   */
  getStatus: () => {
    return import_electron.ipcRenderer.invoke("vpn:getStatus");
  },
  /**
   * Subscribes to daemon connection state transitions (e.g. 'connecting', 'connected', 'error')
   * Returns a cleanup function that detaches the IPC listener.
   */
  onStatusChange: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    import_electron.ipcRenderer.on("vpn:status", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("vpn:status", listener);
    };
  },
  /**
   * Subscribes to 1-second real-time telemetry updates (RX/TX speeds, ping, uptime)
   * Returns a cleanup function that detaches the IPC listener.
   */
  onTelemetryUpdate: (callback) => {
    const listener = (_event, telemetry) => {
      callback(telemetry);
    };
    import_electron.ipcRenderer.on("vpn:telemetry", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("vpn:telemetry", listener);
    };
  }
};
import_electron.contextBridge.exposeInMainWorld("vpnEngine", vpnEngine);
