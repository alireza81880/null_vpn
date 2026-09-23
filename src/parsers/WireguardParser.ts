import type { ParseResult, ParsedTunnel, WireguardParams } from '../types/vpn';
import { sanitizeWireGuardKey, isValidBase64Key } from '../config/ConfigValidator';

/**
 * Pure parser for WireGuard INI configuration files (.conf).
 *
 * Normalizes parameters strictly for sing-box v1.10.7:
 * - [Interface]: Address, DNS, PrivateKey, MTU
 * - [Peer]: PublicKey, Endpoint, AllowedIPs, PersistentKeepalive
 */
export function parseWireGuardConfig(rawText: string): ParseResult {
  const lines = rawText.split(/\r?\n/);
  let currentSection = '';
  const iface: Record<string, string> = {};
  const peer: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).toLowerCase();
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const val = trimmed.slice(eqIdx + 1).trim();

      if (currentSection === 'interface') {
        if (key === 'address') {
          iface['address'] = iface['address'] ? `${iface['address']}, ${val}` : val;
        } else if (key === 'dns') {
          iface['dns'] = iface['dns'] ? `${iface['dns']}, ${val}` : val;
        } else {
          iface[key] = val;
        }
      } else if (currentSection === 'peer') {
        if (key === 'allowedips') {
          peer['allowedips'] = peer['allowedips'] ? `${peer['allowedips']}, ${val}` : val;
        } else {
          peer[key] = val;
        }
      }
    }
  }

  const endpoint = peer['endpoint'] || '';
  if (!endpoint) {
    return { success: false, error: 'WireGuard config missing [Peer] Endpoint parameter' };
  }

  const rawPrivateKey = iface['privatekey'] || '';
  const rawPublicKey = peer['publickey'] || '';

  const privateKey = sanitizeWireGuardKey(rawPrivateKey);
  const publicKey = sanitizeWireGuardKey(rawPublicKey);

  if (!privateKey) {
    return { success: false, error: 'WireGuard config missing [Interface] PrivateKey parameter' };
  }
  if (!isValidBase64Key(privateKey, 32)) {
    return { success: false, error: 'WireGuard [Interface] PrivateKey must be a valid 32-byte Base64 key' };
  }

  if (!publicKey) {
    return { success: false, error: 'WireGuard config missing [Peer] PublicKey parameter' };
  }
  if (!isValidBase64Key(publicKey, 32)) {
    return { success: false, error: 'WireGuard [Peer] PublicKey must be a valid 32-byte Base64 key' };
  }

  let host = endpoint;
  let port = 51820;

  if (endpoint.startsWith('[')) {
    const closingBracket = endpoint.indexOf(']');
    if (closingBracket !== -1) {
      host = endpoint.slice(1, closingBracket);
      const afterBracket = endpoint.slice(closingBracket + 1);
      if (afterBracket.startsWith(':')) {
        const parsedPort = parseInt(afterBracket.slice(1), 10);
        if (!isNaN(parsedPort)) port = parsedPort;
      }
    }
  } else if (endpoint.includes(':')) {
    const lastColon = endpoint.lastIndexOf(':');
    host = endpoint.slice(0, lastColon);
    const parsedPort = parseInt(endpoint.slice(lastColon + 1), 10);
    if (!isNaN(parsedPort)) port = parsedPort;
  }

  // Preserve PresharedKey if provided
  const rawPsk = peer['presharedkey'] || iface['presharedkey'] || '';
  const preSharedKey = rawPsk ? sanitizeWireGuardKey(rawPsk) : undefined;
  if (preSharedKey && !isValidBase64Key(preSharedKey, 32)) {
    return { success: false, error: 'WireGuard [Peer] PresharedKey must be a valid 32-byte Base64 key' };
  }

  // Preserve PersistentKeepalive if provided
  let persistentKeepalive: number | undefined;
  if (peer['persistentkeepalive']) {
    const parsedKa = parseInt(peer['persistentkeepalive'], 10);
    if (!isNaN(parsedKa)) {
      persistentKeepalive = parsedKa;
    }
  }

  // Preserve Reserved bytes if provided (e.g., WARP [0, 0, 0] or "1,2,3")
  let reserved: number[] | undefined;
  const rawReserved = peer['reserved'] || iface['reserved'];
  if (rawReserved) {
    const cleaned = rawReserved.replace(/[\[\]]/g, '');
    const parts = cleaned.split(',').map((p) => parseInt(p.trim(), 10));
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      reserved = parts;
    }
  }

  const wgParams: WireguardParams = {
    address: iface['address'],
    dns: iface['dns'],
    privateKey,
    publicKey,
    preSharedKey,
    allowedIPs: peer['allowedips'] || '0.0.0.0/0, ::/0',
    persistentKeepalive,
    reserved,
    mtu: iface['mtu'] ? parseInt(iface['mtu'], 10) : 1420,
  };

  const tunnel: ParsedTunnel = {
    name: `WG-${host.slice(0, 16)}`,
    protocol: 'wireguard',
    endpoint,
    host,
    port,
    wireguard: wgParams,
    rawConfig: rawText.trim(),
  };

  return {
    success: true,
    tunnel,
  };
}
