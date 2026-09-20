import type { ParseResult, ParsedTunnel, SubscriptionParseError } from '../types/vpn';
import { parseVlessUri } from './VlessParser';
import { parseWireGuardConfig } from './WireguardParser';

/**
 * Parses Trojan URI links: trojan://password@host:port?query#name
 */
function parseTrojanUri(rawUri: string): ParseResult {
  try {
    const uri = new URL(rawUri);
    const password = uri.username;
    const host = uri.hostname;
    const port = parseInt(uri.port || '443', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `Trojan-${host}`;

    if (!password) {
      return { success: false, error: 'Trojan URI missing password credentials' };
    }
    if (!host) {
      return { success: false, error: 'Trojan URI missing remote host address' };
    }

    const params = uri.searchParams;
    const type = params.get('type') || 'tcp';
    const security = params.get('security') || 'tls';
    const sni = params.get('sni') || host;

    const tunnel: ParsedTunnel = {
      name,
      protocol: 'trojan',
      endpoint: `${host}:${port}`,
      host,
      port,
      uuidOrPassword: password,
      security,
      sni,
      type,
      rawConfig: rawUri.trim(),
    };

    return {
      success: true,
      tunnel,
    };
  } catch (err: any) {
    return { success: false, error: `Invalid Trojan URI: ${err?.message || 'Malformed structure'}` };
  }
}

/**
 * Parses VMess URI links: vmess://base64-json
 */
function parseVmessUri(rawUri: string): ParseResult {
  try {
    const base64Str = rawUri.replace(/^vmess:\/\//i, '');
    const jsonStr = atob(base64Str.trim());
    const obj = JSON.parse(jsonStr);

    const host = obj.add || obj.host || '';
    const port = parseInt(obj.port || '443', 10);
    const name = obj.ps ? String(obj.ps).trim() : `VMess-${host || 'server'}`;

    if (!obj.id || typeof obj.id !== 'string' || !obj.id.trim()) {
      return { success: false, error: 'VMess configuration missing required user ID (UUID)' };
    }
    if (!host) {
      return { success: false, error: 'VMess configuration missing remote server address' };
    }

    const tunnel: ParsedTunnel = {
      name,
      protocol: 'vmess',
      endpoint: `${host}:${port}`,
      host,
      port,
      uuidOrPassword: obj.id.trim(),
      security: obj.tls === 'tls' ? 'tls' : 'none',
      sni: obj.sni || obj.host || host,
      type: obj.net || 'tcp',
      path: obj.path,
      wsHost: obj.host,
      rawConfig: rawUri.trim(),
    };

    return {
      success: true,
      tunnel,
    };
  } catch (err: any) {
    return { success: false, error: `Invalid VMess URI: ${err?.message || 'Failed to decode base64 JSON'}` };
  }
}

/**
 * Parses Shadowsocks URI links: ss://...
 */
function parseShadowsocksUri(rawUri: string): ParseResult {
  try {
    const uri = new URL(rawUri);
    const host = uri.hostname;
    const port = parseInt(uri.port || '8388', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `SS-${host}`;

    const tunnel: ParsedTunnel = {
      name,
      protocol: 'shadowsocks',
      endpoint: `${host}:${port}`,
      host,
      port,
      uuidOrPassword: uri.username,
      rawConfig: rawUri.trim(),
    };

    return {
      success: true,
      tunnel,
    };
  } catch {
    // Attempt base64 decode for legacy format ss://base64#name
    try {
      const withoutPrefix = rawUri.replace(/^ss:\/\//i, '');
      const hashIdx = withoutPrefix.indexOf('#');
      const b64 = hashIdx !== -1 ? withoutPrefix.slice(0, hashIdx) : withoutPrefix;
      const name = hashIdx !== -1 ? decodeURIComponent(withoutPrefix.slice(hashIdx + 1)) : 'Shadowsocks';
      const decoded = atob(b64);
      const atIdx = decoded.indexOf('@');
      if (atIdx !== -1) {
        const hostPort = decoded.slice(atIdx + 1);
        const [host, portStr] = hostPort.split(':');
        const port = parseInt(portStr || '8388', 10);
        const tunnel: ParsedTunnel = {
          name,
          protocol: 'shadowsocks',
          endpoint: `${host}:${port}`,
          host,
          port,
          rawConfig: rawUri.trim(),
        };
        return {
          success: true,
          tunnel,
        };
      }
    } catch {}
    return { success: false, error: 'Failed to parse Shadowsocks configuration link' };
  }
}

/**
 * UriParserFactory:
 * Unified router for detecting and parsing supported VPN configuration formats:
 * - WireGuard INI (.conf)
 * - VLESS URI (vless://)
 * - Trojan URI (trojan://)
 * - VMess URI (vmess://)
 * - Shadowsocks URI (ss://)
 */
export class UriParserFactory {
  public static parse(rawText: string): ParseResult {
    const text = rawText.trim();
    if (!text) {
      return { success: false, error: 'Input is empty. Please provide a config or URI.' };
    }

    // 1. Detect WireGuard INI config
    if (
      text.includes('[Interface]') ||
      text.includes('[interface]') ||
      text.includes('[Peer]') ||
      text.includes('[peer]')
    ) {
      return parseWireGuardConfig(text);
    }

    // 2. Detect VLESS URI
    if (text.toLowerCase().startsWith('vless://')) {
      return parseVlessUri(text);
    }

    // 3. Detect Trojan URI
    if (text.toLowerCase().startsWith('trojan://')) {
      return parseTrojanUri(text);
    }

    // 4. Detect VMess URI
    if (text.toLowerCase().startsWith('vmess://')) {
      return parseVmessUri(text);
    }

    // 5. Detect Shadowsocks URI
    if (text.toLowerCase().startsWith('ss://')) {
      return parseShadowsocksUri(text);
    }

    // 6. Fallback: Generic WireGuard keyword detection
    if (text.includes('PrivateKey') || text.includes('Endpoint')) {
      return parseWireGuardConfig(text);
    }

    // 7. Detect other unsupported protocols specifically
    const schemeMatch = text.match(/^([a-zA-Z0-9+.-]+):\/\//);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      return {
        success: false,
        error: `Unsupported protocol "${scheme}://". Supported: WireGuard (.conf), vless://, trojan://, vmess://, ss://`,
      };
    }

    return {
      success: false,
      error: 'Unrecognized format. Supported: WireGuard (.conf), vless://, trojan://, vmess://, ss://',
    };
  }

  /**
   * Parses multiple lines of proxy share links or raw configurations.
   * Tolerates comments, whitespace, and preserves individual line errors.
   */
  public static parseMultiNodeWithReport(rawText: string): {
    nodes: ParsedTunnel[];
    errors: SubscriptionParseError[];
  } {
    const text = rawText.trim();
    if (!text) {
      return { nodes: [], errors: [] };
    }

    const lines = text.split(/\r?\n+/);
    const nodes: ParsedTunnel[] = [];
    const errors: SubscriptionParseError[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Skip empty lines and non-config comments
      if (
        !trimmed ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('//') ||
        trimmed.toLowerCase().startsWith('rem ')
      ) {
        return;
      }

      const result = UriParserFactory.parse(trimmed);
      if (result.success && result.tunnel) {
        nodes.push(result.tunnel);
      } else {
        errors.push({
          line: index + 1,
          raw: trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed,
          error: result.error || 'Failed to parse line configuration',
        });
      }
    });

    return { nodes, errors };
  }

  /**
   * Convenience batch parser returning array of ParsedTunnel
   */
  public static parseMultiNode(rawText: string): ParsedTunnel[] {
    const { nodes } = this.parseMultiNodeWithReport(rawText);
    return nodes;
  }
}
