/**
 * App Update Service (src/utils/appUpdateService.ts)
 * 
 * In-App update service for Null VPN.
 * - Checks GitHub Releases API for new versions
 * - Performs semantic version comparison
 * - Extracts changelogs and APK release assets
 * - Integrates native Android DownloadManager and FileProvider installer
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorSingbox } from '../plugins/SingboxPlugin';

export const CURRENT_APP_VERSION = '1.0.0';
export const GITHUB_REPO = 'alireza81880/null_vpn';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  body: string;
  publishedAt: string;
  apkUrl: string | null;
  apkSize?: number;
  htmlUrl: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  status: string;
}

/**
 * Compare two semver strings: a and b
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/i, '').trim();
  const cleanB = b.replace(/^v/i, '').trim();

  const partsA = cleanA.split('.').map((p) => parseInt(p, 10) || 0);
  const partsB = cleanB.split('.').map((p) => parseInt(p, 10) || 0);

  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const valA = partsA[i] || 0;
    const valB = partsB[i] || 0;
    if (valA > valB) return 1;
    if (valA < valB) return -1;
  }
  return 0;
}

/**
 * Checks GitHub latest releases for an update
 */
export async function checkForAppUpdates(): Promise<UpdateInfo> {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub Releases HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const tagName = data.tag_name || data.name || '';
    const cleanLatest = tagName.replace(/^v/i, '').trim();

    const hasUpdate = compareVersions(cleanLatest, CURRENT_APP_VERSION) > 0;

    let apkUrl: string | null = null;
    let apkSize = 0;

    if (Array.isArray(data.assets)) {
      const apkAsset = data.assets.find(
        (asset: { name?: string; browser_download_url?: string; size?: number }) =>
          asset.name && asset.name.toLowerCase().endsWith('.apk')
      );
      if (apkAsset) {
        apkUrl = apkAsset.browser_download_url;
        apkSize = apkAsset.size || 0;
      }
    }

    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: cleanLatest || CURRENT_APP_VERSION,
      releaseName: data.name || tagName || 'Latest Release',
      body: data.body || 'No release notes provided.',
      publishedAt: data.published_at || new Date().toISOString(),
      apkUrl,
      apkSize,
      htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[AppUpdateService] Failed to check for updates:', msg);
    return {
      hasUpdate: false,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: CURRENT_APP_VERSION,
      releaseName: 'Offline or Unreachable',
      body: `Could not connect to update server: ${msg}`,
      publishedAt: '',
      apkUrl: null,
      htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
    };
  }
}

/**
 * Initiates download and installation of the updated APK
 */
export async function startApkUpdate(
  apkUrl: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; error?: string }> {
  if (!apkUrl) {
    return { success: false, error: 'No APK download URL available' };
  }

  // Native Android Pathway
  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Check install permission
      const permResult = await CapacitorSingbox.canRequestPackageInstalls();
      if (!permResult.canInstall) {
        await CapacitorSingbox.openInstallPermissionSettings();
      }

      // 2. Enqueue download
      const fileName = `null-vpn-update-${Date.now()}.apk`;
      const downloadResult = await CapacitorSingbox.downloadAndInstallApk({
        url: apkUrl,
        fileName,
      });

      if (!downloadResult.success) {
        return { success: false, error: 'Failed to start download manager' };
      }

      const downloadId = downloadResult.downloadId;

      // 3. Poll progress
      if (onProgress && downloadId > 0) {
        const pollInterval = setInterval(async () => {
          try {
            const prog = await CapacitorSingbox.getDownloadProgress({ downloadId });
            const total = prog.totalBytes > 0 ? prog.totalBytes : 0;
            const downloaded = prog.downloadedBytes > 0 ? prog.downloadedBytes : 0;
            const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

            onProgress({
              downloadedBytes: downloaded,
              totalBytes: total,
              percent,
              status: prog.isCompleted
                ? 'Ready to install'
                : prog.isFailed
                ? 'Download failed'
                : 'Downloading update...',
            });

            if (prog.isCompleted || prog.isFailed) {
              clearInterval(pollInterval);
            }
          } catch {
            clearInterval(pollInterval);
          }
        }, 600);
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // Web / Desktop Fallback: Open release download in browser
  window.open(apkUrl, '_blank');
  return { success: true };
}
