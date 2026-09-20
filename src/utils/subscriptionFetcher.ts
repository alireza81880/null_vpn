import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { FetchSubscriptionResult } from '../types/vpn';

/**
 * Redacts sensitive tokens or path query components from subscription URLs for safe logging.
 */
function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.length > 1 ? '/...' : ''}`;
  } catch {
    return 'https://[redacted-host]/...';
  }
}

/**
 * Normalizes HTTP response headers to lower-case keys for consistent cross-platform access.
 */
function normalizeHeaders(rawHeaders: Record<string, any> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!rawHeaders) return normalized;

  Object.entries(rawHeaders).forEach(([k, v]) => {
    if (k && v !== undefined && v !== null) {
      normalized[k.toLowerCase()] = String(v);
    }
  });
  return normalized;
}

/**
 * Detects whether response payload is an HTML error page or interstitial challenge
 */
function isHtmlErrorResponse(content: string, status?: number): boolean {
  const trimmed = content.trim().toLowerCase();
  if (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<title>404') ||
    trimmed.includes('<title>502') ||
    trimmed.includes('<title>500') ||
    trimmed.includes('<title>just a moment') ||
    trimmed.includes('<title>cloudflare')
  ) {
    // If status is 4xx/5xx or HTML wrapper without proxy protocols, treat as error page
    if (status && (status >= 400 || status < 200)) {
      return true;
    }
    if (!trimmed.includes('vless://') && !trimmed.includes('vmess://') && !trimmed.includes('trojan://')) {
      return true;
    }
  }
  return false;
}

/**
 * Universal Subscription Network Fetcher.
 * Uses CapacitorHttp native bridge on mobile Android (bypassing CORS),
 * and standard Web/Electron Fetch with strict timeout and validation elsewhere.
 */
export async function fetchSubscription(
  url: string,
  options?: {
    timeoutMs?: number;
    userAgent?: string;
  }
): Promise<FetchSubscriptionResult> {
  const timeoutMs = options?.timeoutMs ?? 12000;
  const userAgent = options?.userAgent ?? 'NullVPN/1.0.0 (sing-box; +https://nullvpn.app)';
  const safeLogUrl = redactUrl(url);

  if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return {
      success: false,
      error: 'Invalid subscription URL. Must start with http:// or https://',
    };
  }

  try {
    // 1. Android Capacitor Native Engine
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          'User-Agent': userAgent,
          Accept: '*/*',
          'Cache-Control': 'no-cache',
        },
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });

      const status = response.status;
      const headers = normalizeHeaders(response.headers);
      const contentType = headers['content-type'] || 'text/plain';

      if (status < 200 || status >= 300) {
        return {
          success: false,
          status,
          contentType,
          headers,
          error: `Subscription server returned HTTP ${status} error`,
        };
      }

      let contentStr = '';
      if (typeof response.data === 'string') {
        contentStr = response.data;
      } else if (typeof response.data === 'object') {
        contentStr = JSON.stringify(response.data);
      } else if (response.data !== undefined && response.data !== null) {
        contentStr = String(response.data);
      }

      if (!contentStr.trim()) {
        return {
          success: false,
          status,
          contentType,
          headers,
          error: 'Subscription server returned empty response body',
        };
      }

      if (isHtmlErrorResponse(contentStr, status)) {
        return {
          success: false,
          status,
          contentType,
          headers,
          error: 'Subscription URL returned an HTML error page rather than proxy configurations',
        };
      }

      return {
        success: true,
        status,
        content: contentStr,
        contentType,
        headers,
      };
    }

    // 2. Web Browser & Electron Engine
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: '*/*',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = response.status;
      const headers: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });
      const contentType = headers['content-type'] || response.headers.get('content-type') || 'text/plain';

      if (!response.ok) {
        return {
          success: false,
          status,
          contentType,
          headers,
          error: `Subscription server returned HTTP ${status} (${response.statusText || 'Error'})`,
        };
      }

      const content = await response.text();

      if (!content.trim()) {
        return {
          success: false,
          status,
          contentType,
          headers,
          error: 'Subscription server returned empty content',
        };
      }

      if (isHtmlErrorResponse(content, status)) {
        return {
          success: false,
          status,
          contentType,
          headers,
          error: 'Subscription URL returned an HTML page rather than proxy configurations',
        };
      }

      return {
        success: true,
        status,
        content,
        contentType,
        headers,
      };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return {
          success: false,
          error: `Connection timed out after ${Math.round(timeoutMs / 1000)}s while fetching subscription from ${safeLogUrl}`,
        };
      }
      return {
        success: false,
        error: `Network error fetching subscription: ${fetchErr?.message || 'Connection failed (CORS or network issue)'}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to fetch subscription: ${err?.message || 'Unknown network failure'}`,
    };
  }
}
