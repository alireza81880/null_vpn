import type { SingBoxConfigObject } from '../types/singbox';

/**
 * Validates a generated or imported Sing-Box configuration payload.
 * Ensures the payload strictly satisfies sing-box v1.10.7 schema rules and contains
 * all mandatory cryptographic and routing parameters before native dispatch.
 */
export function validateSingBoxConfig(
  config: SingBoxConfigObject | string
): { valid: boolean; error?: string } {
  let parsed: SingBoxConfigObject;

  if (typeof config === 'string') {
    try {
      parsed = JSON.parse(config);
    } catch (e: any) {
      return {
        valid: false,
        error: `JSON syntax error in sing-box config: ${e?.message || 'Malformed JSON'}`,
      };
    }
  } else {
    parsed = config;
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'Configuration must be a valid JSON object' };
  }

  if (!Array.isArray(parsed.outbounds) || parsed.outbounds.length === 0) {
    return { valid: false, error: 'Configuration must contain at least one outbound' };
  }

  // Find the primary proxy outbound (first outbound or tagged proxy-out)
  const proxyOut =
    parsed.outbounds.find((o) => o.tag === 'proxy-out') || parsed.outbounds[0];

  if (!proxyOut || !proxyOut.type) {
    return { valid: false, error: 'Primary outbound is missing a valid protocol type' };
  }

  if (proxyOut.type === 'wireguard') {
    if (!proxyOut.server || typeof proxyOut.server !== 'string' || !proxyOut.server.trim()) {
      return { valid: false, error: 'WireGuard outbound requires a valid server endpoint' };
    }
    if (!proxyOut.server_port || typeof proxyOut.server_port !== 'number' || proxyOut.server_port <= 0 || proxyOut.server_port > 65535) {
      return { valid: false, error: 'WireGuard outbound requires a valid server_port (1-65535)' };
    }
    if (!proxyOut.private_key || typeof proxyOut.private_key !== 'string' || !proxyOut.private_key.trim()) {
      return { valid: false, error: 'WireGuard outbound requires a non-empty private_key' };
    }
    if (!proxyOut.peer_public_key || typeof proxyOut.peer_public_key !== 'string' || !proxyOut.peer_public_key.trim()) {
      return { valid: false, error: 'WireGuard outbound requires a non-empty peer_public_key' };
    }
    if (!proxyOut.local_address || !Array.isArray(proxyOut.local_address) || proxyOut.local_address.length === 0) {
      return { valid: false, error: 'WireGuard outbound requires non-empty local_address prefixes' };
    }
    if (proxyOut.peers && Array.isArray(proxyOut.peers)) {
      if (proxyOut.peers.length === 0) {
        return { valid: false, error: 'WireGuard peers array must contain at least one peer when specified' };
      }
      for (let i = 0; i < proxyOut.peers.length; i++) {
        const peer = proxyOut.peers[i];
        if (!peer.public_key || typeof peer.public_key !== 'string' || !peer.public_key.trim()) {
          return { valid: false, error: `WireGuard peer[${i}] requires a valid public_key` };
        }
        if (!peer.allowed_ips || !Array.isArray(peer.allowed_ips) || peer.allowed_ips.length === 0) {
          return { valid: false, error: `WireGuard peer[${i}] requires non-empty allowed_ips` };
        }
        if (peer.reserved && (!Array.isArray(peer.reserved) || peer.reserved.length !== 3)) {
          return { valid: false, error: `WireGuard peer[${i}] reserved field must contain exactly 3 bytes` };
        }
      }
    }
  } else if (proxyOut.type === 'vless') {
    if (!proxyOut.server) {
      return { valid: false, error: 'VLESS outbound requires a valid server address' };
    }
    if (!proxyOut.uuid || typeof proxyOut.uuid !== 'string' || !proxyOut.uuid.trim()) {
      return { valid: false, error: 'VLESS outbound requires a valid UUID' };
    }
  } else if (proxyOut.type === 'trojan') {
    if (!proxyOut.server) {
      return { valid: false, error: 'Trojan outbound requires a valid server address' };
    }
    if (!proxyOut.password || typeof proxyOut.password !== 'string' || !proxyOut.password.trim()) {
      return { valid: false, error: 'Trojan outbound requires a password' };
    }
  } else if ((proxyOut.type as string) === 'vmess') {
    if (!proxyOut.server || typeof proxyOut.server !== 'string' || !proxyOut.server.trim()) {
      return { valid: false, error: 'VMess outbound requires a valid server address' };
    }
    if (!proxyOut.server_port || typeof proxyOut.server_port !== 'number' || proxyOut.server_port <= 0 || proxyOut.server_port > 65535) {
      return { valid: false, error: 'VMess outbound requires a valid server_port (1-65535)' };
    }
    if (!proxyOut.uuid || typeof proxyOut.uuid !== 'string' || !proxyOut.uuid.trim()) {
      return { valid: false, error: 'VMess outbound requires a valid UUID' };
    }
    if (!proxyOut.security || typeof proxyOut.security !== 'string' || !proxyOut.security.trim()) {
      return { valid: false, error: 'VMess outbound requires a valid security encryption method' };
    }
  }

  return { valid: true };
}
