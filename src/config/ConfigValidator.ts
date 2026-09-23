import type { SingBoxConfigObject } from '../types/singbox';

/**
 * Sanitizes and strips surrounding quotes and whitespace from potential keys.
 */
export function sanitizeWireGuardKey(key: unknown): string {
  if (typeof key !== 'string') return '';
  let cleaned = key.trim();
  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
     (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export interface WireguardKeyDiagnostics {
  present: boolean;
  base64Valid: boolean;
  decodedLength: number;
}

/**
 * Generates audit diagnostics for a WireGuard key without exposing secrets.
 */
export function getWireguardKeyDiagnostics(key: unknown, expectedBytes = 32): WireguardKeyDiagnostics {
  const cleaned = sanitizeWireGuardKey(key);
  if (!cleaned) {
    return {
      present: typeof key === 'string' && key.trim().length > 0,
      base64Valid: false,
      decodedLength: 0,
    };
  }

  const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  // Check for strict base64 character set
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    return {
      present: true,
      base64Valid: false,
      decodedLength: 0,
    };
  }

  try {
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);
    const decoded = atob(padded);
    return {
      present: true,
      base64Valid: true,
      decodedLength: decoded.length,
    };
  } catch {
    return {
      present: true,
      base64Valid: false,
      decodedLength: 0,
    };
  }
}

/**
 * Validates base64 string length when decoded.
 */
export function isValidBase64Key(key: unknown, expectedBytes = 32): boolean {
  const diag = getWireguardKeyDiagnostics(key, expectedBytes);
  return diag.present && diag.base64Valid && diag.decodedLength === expectedBytes;
}

/**
 * Validates a generated or imported Sing-Box configuration payload.
 * Ensures the payload strictly satisfies sing-box v1.14.1-lx.8 schema rules and contains
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

  // 1. Validate Tag Uniqueness across endpoints and outbounds
  const allTags = new Set<string>();

  if (Array.isArray(parsed.endpoints)) {
    for (let i = 0; i < parsed.endpoints.length; i++) {
      const ep = parsed.endpoints[i];
      if (ep && typeof ep === 'object' && typeof (ep as any).tag === 'string') {
        const tag = (ep as any).tag;
        if (allTags.has(tag)) {
          return { valid: false, error: `Duplicate tag found across endpoints/outbounds: "${tag}"` };
        }
        allTags.add(tag);
      }
    }
  }

  for (let i = 0; i < parsed.outbounds.length; i++) {
    const ob = parsed.outbounds[i];
    if (ob && typeof ob === 'object' && typeof ob.tag === 'string') {
      const tag = ob.tag;
      if (allTags.has(tag)) {
        return { valid: false, error: `Duplicate tag found across endpoints/outbounds: "${tag}"` };
      }
      allTags.add(tag);
    }
  }

  // 2. Validate Inbounds (TUN interface)
  if (parsed.inbounds !== undefined) {
    if (!Array.isArray(parsed.inbounds)) {
      return { valid: false, error: 'Configuration "inbounds" must be an array' };
    }
    const tunInbound = parsed.inbounds.find((inb: any) => inb && inb.type === 'tun') as Record<string, any> | undefined;
    if (tunInbound) {
      if (!tunInbound.tag || typeof tunInbound.tag !== 'string' || !tunInbound.tag.trim()) {
        return { valid: false, error: 'TUN inbound requires a valid tag' };
      }
      if (!tunInbound.interface_name || typeof tunInbound.interface_name !== 'string' || !tunInbound.interface_name.trim()) {
        return { valid: false, error: 'TUN inbound requires a valid interface_name' };
      }
      if (!Array.isArray(tunInbound.address) || tunInbound.address.length === 0) {
        return { valid: false, error: 'TUN inbound requires at least one address CIDR' };
      }
      if (tunInbound.stack && !['gvisor', 'system', 'mixed'].includes(tunInbound.stack)) {
        return { valid: false, error: `Invalid TUN stack: "${tunInbound.stack}". Must be gvisor, system, or mixed` };
      }
    }
  }

  // 3. Find primary proxy (endpoints first for WireGuard v1.14.1, then outbounds)
  let proxyItem: Record<string, any> | undefined = undefined;
  let isEndpoint = false;

  if (Array.isArray(parsed.endpoints) && parsed.endpoints.length > 0) {
    const ep =
      parsed.endpoints.find((e: any) => e.tag === 'proxy-out') ||
      parsed.endpoints.find((e: any) => e.type === 'wireguard') ||
      parsed.endpoints[0];
    if (ep && typeof ep === 'object' && ep.type) {
      proxyItem = ep as Record<string, any>;
      isEndpoint = true;
    }
  }

  if (!proxyItem) {
    proxyItem =
      parsed.outbounds.find((o) => o.tag === 'proxy-out') || parsed.outbounds[0];
  }

  if (!proxyItem || !proxyItem.type) {
    return { valid: false, error: 'Primary outbound/endpoint is missing a valid protocol type' };
  }

  const proxyOut = proxyItem;

  // 4. Validate Protocol Specifics
  if (proxyItem.type === 'wireguard') {
    if (!proxyItem.private_key || typeof proxyItem.private_key !== 'string' || !proxyItem.private_key.trim()) {
      return { valid: false, error: 'WireGuard configuration requires a non-empty private_key' };
    }
    if (!isValidBase64Key(proxyItem.private_key, 32)) {
      return { valid: false, error: 'WireGuard private_key must be a valid 32-byte base64 string' };
    }

    if (isEndpoint || (proxyItem.peers && Array.isArray(proxyItem.peers) && proxyItem.peers.length > 0)) {
      // Modern sing-box v1.14.1 endpoint structure
      const addrList = proxyItem.address || proxyItem.local_address;
      if (!addrList || !Array.isArray(addrList) || addrList.length === 0) {
        return { valid: false, error: 'WireGuard endpoint requires non-empty address prefixes' };
      }
      if (!Array.isArray(proxyItem.peers) || proxyItem.peers.length === 0) {
        return { valid: false, error: 'WireGuard endpoint requires at least one peer in peers array' };
      }
      for (let i = 0; i < proxyItem.peers.length; i++) {
        const peer = proxyItem.peers[i];
        const peerHost = peer.address || peer.server;
        if (!peerHost || typeof peerHost !== 'string' || !peerHost.trim()) {
          return { valid: false, error: `WireGuard peer[${i}] requires a valid address/server endpoint` };
        }
        const peerPort = peer.port ?? peer.server_port;
        if (typeof peerPort !== 'number' || peerPort <= 0 || peerPort > 65535) {
          return { valid: false, error: `WireGuard peer[${i}] requires a valid port (1-65535)` };
        }
        if (!peer.public_key || typeof peer.public_key !== 'string' || !peer.public_key.trim()) {
          return { valid: false, error: `WireGuard peer[${i}] requires a valid public_key` };
        }
        if (!isValidBase64Key(peer.public_key, 32)) {
          return { valid: false, error: `WireGuard peer[${i}] public_key must be a valid 32-byte base64 string` };
        }
        if (peer.pre_shared_key && !isValidBase64Key(peer.pre_shared_key, 32)) {
          return { valid: false, error: `WireGuard peer[${i}] pre_shared_key must be a valid 32-byte base64 string` };
        }
        if (!peer.allowed_ips || !Array.isArray(peer.allowed_ips) || peer.allowed_ips.length === 0) {
          return { valid: false, error: `WireGuard peer[${i}] requires non-empty allowed_ips` };
        }
        if (peer.reserved !== undefined && peer.reserved !== null) {
          if (
            !Array.isArray(peer.reserved) ||
            peer.reserved.length !== 3 ||
            !peer.reserved.every((b: any) => typeof b === 'number' && b >= 0 && b <= 255)
          ) {
            return { valid: false, error: `WireGuard peer[${i}] reserved field must contain exactly 3 bytes (0-255)` };
          }
        }
      }
    } else {
      // Legacy outbound format fallback
      if (!proxyItem.server || typeof proxyItem.server !== 'string' || !proxyItem.server.trim()) {
        return { valid: false, error: 'WireGuard outbound requires a valid server endpoint' };
      }
      if (!proxyItem.server_port || typeof proxyItem.server_port !== 'number' || proxyItem.server_port <= 0 || proxyItem.server_port > 65535) {
        return { valid: false, error: 'WireGuard outbound requires a valid server_port (1-65535)' };
      }
      if (!proxyItem.peer_public_key || typeof proxyItem.peer_public_key !== 'string' || !proxyItem.peer_public_key.trim()) {
        return { valid: false, error: 'WireGuard outbound requires a non-empty peer_public_key' };
      }
      if (!isValidBase64Key(proxyItem.peer_public_key, 32)) {
        return { valid: false, error: 'WireGuard outbound peer_public_key must be a valid 32-byte base64 string' };
      }
      if (proxyItem.pre_shared_key && !isValidBase64Key(proxyItem.pre_shared_key, 32)) {
        return { valid: false, error: 'WireGuard outbound pre_shared_key must be a valid 32-byte base64 string' };
      }
      if (!proxyItem.local_address || !Array.isArray(proxyItem.local_address) || proxyItem.local_address.length === 0) {
        return { valid: false, error: 'WireGuard outbound requires non-empty local_address prefixes' };
      }
    }
  } else if (proxyItem.type === 'vless') {
    if (!proxyOut.server || typeof proxyOut.server !== 'string' || !proxyOut.server.trim()) {
      return { valid: false, error: 'VLESS outbound requires a valid server address' };
    }
    if (!proxyOut.server_port || typeof proxyOut.server_port !== 'number' || proxyOut.server_port <= 0 || proxyOut.server_port > 65535) {
      return { valid: false, error: 'VLESS outbound requires a valid server_port (1-65535)' };
    }
    if (!proxyOut.uuid || typeof proxyOut.uuid !== 'string' || !proxyOut.uuid.trim()) {
      return { valid: false, error: 'VLESS outbound requires a valid UUID' };
    }

    // Reality validation according to sing-box v1.14.1 runtime requirements
    const tls = proxyOut.tls as Record<string, any> | undefined;
    if (tls?.reality?.enabled) {
      if (!tls.enabled) {
        return { valid: false, error: 'Reality requires TLS to be enabled (tls.enabled=true)' };
      }
      if (!tls.server_name || typeof tls.server_name !== 'string' || !tls.server_name.trim()) {
        return { valid: false, error: 'Reality requires a valid server_name (SNI)' };
      }
      if (!tls.utls || !tls.utls.enabled) {
        return { valid: false, error: 'uTLS is required by reality client in sing-box (tls.utls.enabled=true)' };
      }
      const pubKey = tls.reality.public_key;
      if (!pubKey || typeof pubKey !== 'string' || !pubKey.trim()) {
        return { valid: false, error: 'Reality requires a valid public_key (pbk)' };
      }
      if (!isValidBase64Key(pubKey, 32)) {
        return { valid: false, error: 'Invalid Reality public_key: expected 32-byte base64' };
      }

      // short_id is optional (up to 8 bytes / 16 hex chars)
      const shortId = tls.reality.short_id;
      if (shortId !== undefined && shortId !== null && shortId !== '') {
        if (typeof shortId !== 'string' || !/^[0-9a-fA-F]*$/.test(shortId) || shortId.length > 16) {
          return { valid: false, error: 'Invalid Reality short_id: must be hexadecimal and at most 16 characters' };
        }
      }
    }

    // XHTTP transport validation
    const transport = proxyOut.transport as Record<string, any> | undefined;
    if (transport?.type === 'xhttp') {
      if (proxyOut.flow === 'xtls-rprx-vision') {
        return { valid: false, error: 'XTLS Vision flow (xtls-rprx-vision) is incompatible with XHTTP transport' };
      }
      if (transport.mode && typeof transport.mode !== 'string') {
        return { valid: false, error: 'XHTTP transport mode must be a valid string' };
      }
      if (transport.path && typeof transport.path !== 'string') {
        return { valid: false, error: 'XHTTP transport path must be a string' };
      }
      if (transport.host && typeof transport.host !== 'string') {
        return { valid: false, error: 'XHTTP transport host must be a string' };
      }
      if (transport.headers && (typeof transport.headers !== 'object' || Array.isArray(transport.headers))) {
        return { valid: false, error: 'XHTTP transport headers must be an object key-value map' };
      }
    }
  } else if (proxyOut.type === 'trojan') {
    if (!proxyOut.server || typeof proxyOut.server !== 'string' || !proxyOut.server.trim()) {
      return { valid: false, error: 'Trojan outbound requires a valid server address' };
    }
    if (!proxyOut.server_port || typeof proxyOut.server_port !== 'number' || proxyOut.server_port <= 0 || proxyOut.server_port > 65535) {
      return { valid: false, error: 'Trojan outbound requires a valid server_port (1-65535)' };
    }
    if (!proxyOut.password || typeof proxyOut.password !== 'string' || !proxyOut.password.trim()) {
      return { valid: false, error: 'Trojan outbound requires a password' };
    }
    const tls = proxyOut.tls as Record<string, any> | undefined;
    if (!tls || !tls.enabled) {
      return { valid: false, error: 'Trojan outbound requires TLS to be enabled (tls.enabled=true)' };
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
  } else if ((proxyOut.type as string) === 'shadowsocks') {
    if (!proxyOut.server || typeof proxyOut.server !== 'string' || !proxyOut.server.trim()) {
      return { valid: false, error: 'Shadowsocks outbound requires a valid server address' };
    }
    if (!proxyOut.server_port || typeof proxyOut.server_port !== 'number' || proxyOut.server_port <= 0 || proxyOut.server_port > 65535) {
      return { valid: false, error: 'Shadowsocks outbound requires a valid server_port (1-65535)' };
    }
    if (!proxyOut.password || typeof proxyOut.password !== 'string' || !proxyOut.password.trim()) {
      return { valid: false, error: 'Shadowsocks outbound requires a password' };
    }
    if (!proxyOut.method || typeof proxyOut.method !== 'string' || !proxyOut.method.trim()) {
      return { valid: false, error: 'Shadowsocks outbound requires an encryption method' };
    }
  }

  // 5. Validate DNS detour references
  if (parsed.dns && typeof parsed.dns === 'object') {
    const dnsObj = parsed.dns as Record<string, any>;
    if (Array.isArray(dnsObj.servers)) {
      for (let i = 0; i < dnsObj.servers.length; i++) {
        const srv = dnsObj.servers[i];
        if (srv && typeof srv === 'object') {
          if (!srv.tag || typeof srv.tag !== 'string' || !srv.tag.trim()) {
            return { valid: false, error: `DNS server[${i}] is missing a valid tag` };
          }
          if (srv.detour && typeof srv.detour === 'string' && !allTags.has(srv.detour)) {
            return { valid: false, error: `DNS server "${srv.tag}" detours to unknown outbound/endpoint tag: "${srv.detour}"` };
          }
        }
      }
    }
  }

  // 6. Validate Route destinations
  if (parsed.route && typeof parsed.route === 'object') {
    const routeObj = parsed.route as Record<string, any>;
    if (routeObj.final && typeof routeObj.final === 'string') {
      if (!allTags.has(routeObj.final)) {
        return { valid: false, error: `Route final destination references unknown outbound/endpoint tag: "${routeObj.final}"` };
      }
    }
    if (Array.isArray(routeObj.rules)) {
      for (let i = 0; i < routeObj.rules.length; i++) {
        const rule = routeObj.rules[i];
        if (rule && typeof rule === 'object' && typeof rule.outbound === 'string') {
          if (!allTags.has(rule.outbound)) {
            return { valid: false, error: `Route rule[${i}] references unknown outbound/endpoint tag: "${rule.outbound}"` };
          }
        }
      }
    }
  }

  return { valid: true };
}
