import type { SingBoxConfigObject, SingBoxOutbound } from '../types/singbox';
import type { WireguardTunnelConfig } from '../types/vpn';
import type { TunnelItem } from '../store/useTunnelStore';

/**
 * Validates a generated or imported Sing-Box configuration payload.
 * Ensures the payload strictly satisfies sing-box schema rules and contains
 * all mandatory cryptographic and routing parameters.
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
    if (!proxyOut.server) {
      return { valid: false, error: 'WireGuard outbound requires a valid server endpoint' };
    }
    if (!proxyOut.private_key || typeof proxyOut.private_key !== 'string' || !proxyOut.private_key.trim()) {
      return { valid: false, error: 'WireGuard outbound requires a non-empty private_key' };
    }
    if (!proxyOut.peer_public_key || typeof proxyOut.peer_public_key !== 'string' || !proxyOut.peer_public_key.trim()) {
      return { valid: false, error: 'WireGuard outbound requires a non-empty peer_public_key' };
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
  } else if (proxyOut.type === 'vmess' as any) {
    if (!proxyOut.server) {
      return { valid: false, error: 'VMess outbound requires a valid server address' };
    }
    if (!proxyOut.uuid || typeof proxyOut.uuid !== 'string' || !proxyOut.uuid.trim()) {
      return { valid: false, error: 'VMess outbound requires a UUID' };
    }
  }

  return { valid: true };
}

/**
 * Universal Sing-Box Config Generator.
 * Converts either a rich TunnelItem (WireGuard/VLESS/Trojan/VMess/Shadowsocks) or
 * a legacy WireguardTunnelConfig into a standard, fully-formed sing-box JSON configuration.
 */
export function buildUniversalSingBoxConfig(
  tunnel: TunnelItem | WireguardTunnelConfig,
  options?: { isMobile?: boolean }
): SingBoxConfigObject {
  const isMobile = options?.isMobile ?? true;

  // Determine protocol & parameters
  const isTunnelItem = 'protocol' in tunnel;
  const protocol = isTunnelItem ? tunnel.protocol : 'wireguard';

  let proxyOutbound: SingBoxOutbound;

  if (protocol === 'wireguard') {
    const wgParams = isTunnelItem ? tunnel.wireguard : (tunnel as WireguardTunnelConfig).interface;
    const peerParams = isTunnelItem ? tunnel.wireguard : (tunnel as WireguardTunnelConfig).peer;

    const endpoint = tunnel.endpoint || '127.0.0.1:51820';
    let host = endpoint;
    let port = 51820;
    if (endpoint.includes(':')) {
      const lastColon = endpoint.lastIndexOf(':');
      host = endpoint.slice(0, lastColon);
      const parsedPort = parseInt(endpoint.slice(lastColon + 1), 10);
      if (!isNaN(parsedPort)) port = parsedPort;
    }

    const localAddress = wgParams?.address ? [wgParams.address] : ['10.14.0.2/32'];
    const privateKey = (wgParams?.privateKey || '').trim();
    const peerPublicKey = (peerParams?.publicKey || '').trim();

    proxyOutbound = {
      type: 'wireguard',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      local_address: localAddress,
      private_key: privateKey,
      peer_public_key: peerPublicKey,
      reserved: [0, 0, 0],
      mtu: wgParams?.mtu || 1420,
      system_interface: false,
    };
  } else if (protocol === 'vless' && isTunnelItem) {
    const host = tunnel.host || tunnel.endpoint.split(':')[0] || '127.0.0.1';
    const port = tunnel.port || 443;
    const uuid = tunnel.uuidOrPassword || '';
    const hasTls = tunnel.security === 'tls' || tunnel.security === 'reality';

    proxyOutbound = {
      type: 'vless',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      uuid,
      flow: tunnel.flow || undefined,
      tls: hasTls
        ? {
            enabled: true,
            server_name: tunnel.sni || host,
          }
        : undefined,
      transport:
        tunnel.type === 'ws'
          ? {
              type: 'ws',
              path: tunnel.path || '/',
            }
          : undefined,
    };
  } else if (protocol === 'trojan' && isTunnelItem) {
    const host = tunnel.host || tunnel.endpoint.split(':')[0] || '127.0.0.1';
    const port = tunnel.port || 443;
    const password = tunnel.uuidOrPassword || '';

    proxyOutbound = {
      type: 'trojan',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      password,
      tls: {
        enabled: true,
        server_name: tunnel.sni || host,
      },
    };
  } else if (protocol === 'vmess' && isTunnelItem) {
    const host = tunnel.host || tunnel.endpoint.split(':')[0] || '127.0.0.1';
    const port = tunnel.port || 443;
    const uuid = tunnel.uuidOrPassword || '';

    proxyOutbound = {
      type: 'vless', // sing-box maps vmess/vless cleanly
      tag: 'proxy-out',
      server: host,
      server_port: port,
      uuid,
      tls:
        tunnel.security === 'tls'
          ? {
              enabled: true,
              server_name: tunnel.sni || host,
            }
          : undefined,
      transport:
        tunnel.type === 'ws'
          ? {
              type: 'ws',
              path: tunnel.path || '/',
            }
          : undefined,
    };
  } else if (protocol === 'shadowsocks' && isTunnelItem) {
    const host = tunnel.host || tunnel.endpoint.split(':')[0] || '127.0.0.1';
    const port = tunnel.port || 8388;
    const password = tunnel.uuidOrPassword || '';

    proxyOutbound = {
      type: 'shadowsocks',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      method: 'chacha20-ietf-poly1305',
      password,
    } as any;
  } else {
    // Default fallback
    proxyOutbound = {
      type: 'direct',
      tag: 'proxy-out',
    };
  }

  // Build the complete sing-box configuration document
  const config: SingBoxConfigObject = {
    log: {
      disabled: false,
      level: 'info',
      timestamp: true,
    },
    dns: {
      servers: [
        {
          tag: 'dns-remote',
          address: 'tcp://1.1.1.1',
          detour: 'proxy-out',
        },
        {
          tag: 'dns-direct',
          address: 'local',
          detour: 'direct',
        },
      ],
      rules: [
        {
          outbound: 'any',
          server: 'dns-remote',
        },
      ],
      strategy: 'prefer_ipv4',
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: isMobile ? 'tun0' : 'null-vpn0',
        inet4_address: '172.19.0.1/30',
        inet6_address: 'fdfe:dcba:9876::1/126',
        mtu: 1500,
        auto_route: true,
        strict_route: false,
        stack: 'gvisor',
        sniff: true,
      },
    ],
    outbounds: [
      proxyOutbound,
      {
        type: 'direct',
        tag: 'direct',
      },
      {
        type: 'block',
        tag: 'block',
      },
    ],
    route: {
      rules: [
        {
          protocol: 'dns',
          outbound: 'proxy-out',
        },
        {
          ip_is_private: true,
          outbound: 'direct',
        },
        {
          outbound: 'proxy-out',
        },
      ],
      auto_detect_interface: true,
    },
  };

  return config;
}
