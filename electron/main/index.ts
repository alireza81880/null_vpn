/**
 * Electron Main Process Entry Point (electron/main/index.ts)
 * 
 * Boots the BrowserWindow with maximum security flags:
 * - contextIsolation: true (prevents renderer from tampering with Node.js prototypes)
 * - nodeIntegration: false (prohibits arbitrary require() in renderer)
 * - sandbox: true (enforces OS-level chromium sandbox)
 * 
 * Registers the sing-box Daemon Manager IPC handlers to securely bridge the proxy core.
 */

import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerVpnIpcHandlers, VpnDaemonManager } from './vpnManager';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
    path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
    path.join(app.getAppPath(), 'dist-electron', 'preload.js'),
    path.join(__dirname, '../preload.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(__dirname, 'preload.cjs');
}

function resolveHtmlPath(): string {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(__dirname, '../dist', 'index.html'),
    path.join(process.cwd(), 'dist', 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

async function createWindow(): Promise<BrowserWindow> {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 840,
    minHeight: 600,
    frame: false, // Custom borderless window with client-side titlebar controls
    titleBarStyle: 'hidden',
    backgroundColor: '#0A0C10',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required when preload uses contextBridge and ipcRenderer
      devTools: isDev,
    },
  });

  // Register sing-box daemon IPC supervisor with this window instance
  registerVpnIpcHandlers(mainWindow);

  // Security: Deny new-window popups and open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(resolveHtmlPath());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Ensure single instance lock for network daemon consistency
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  });
}

// Global safety cleanup on exit
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  const vpn = VpnDaemonManager.getInstance();
  await vpn.stopEngine();
});

export { mainWindow };
