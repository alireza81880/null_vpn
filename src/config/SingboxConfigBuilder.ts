import type { SingBoxConfigObject, SingBoxOutbound } from '../types/singbox';
import type { WireguardTunnelConfig, TunnelItem } from '../types/vpn';

/**
 * Universal Sing-Box Config Generator.
 * Converts either a normalized TunnelItem (WireGuard/VLESS/Trojan/VMess/Shadowsocks) or
 * a legacy WireguardTunnelConfig into a standard, fully-formed sing-box v1.10.7 JSON configuration.
 *
 * Architectural constraints:
 * - Pure deterministic transformation
 * - No network access
 * - No Android/OS APIs
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
    let host = (isTunnelItem ? tunnel.host : undefined) || endpoint;
    let port = (isTunnelItem ? tunnel.port : undefined) || 51820;

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

    let localAddress: string[] = ['10.14.0.2/32'];
    if (wgParams?.address) {
      const splitAddresses = wgParams.address
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      if (splitAddresses.length > 0) {
        localAddress = splitAddresses;
      }
    }
    const privateKey = (wgParams?.privateKey || '').trim();
    const peerPublicKey = (peerParams?.publicKey || '').trim();
    const preSharedKey = (peerParams?.preSharedKey || '').trim() || undefined;
    const reserved = peerParams?.reserved || [0, 0, 0];

    // Preserve WireGuard AllowedIPs strictly according to sing-box v1.10.7 schema
    const rawAllowedIPs = peerParams?.allowedIPs || '0.0.0.0/0, ::/0';
    const allowedIpsList = rawAllowedIPs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const finalAllowedIps = allowedIpsList.length > 0 ? allowedIpsList : ['0.0.0.0/0', '::/0'];

    proxyOutbound = {
      type: 'wireguard',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      local_address: localAddress,
      private_key: privateKey,
      peer_public_key: peerPublicKey,
      pre_shared_key: preSharedKey,
      peers: [
        {
          server: host,
          server_port: port,
          public_key: peerPublicKey,
          pre_shared_key: preSharedKey,
          allowed_ips: finalAllowedIps,
          reserved,
        },
      ],
      reserved,
      mtu: wgParams?.mtu || 1420,
      system_interface: false,
    };
  } else if (protocol === 'vless' && isTunnelItem) {
    const host = tunnel.host || tunnel.endpoint.split(':')[0] || '127.0.0.1';
    const port = tunnel.port || 443;
    const uuid = tunnel.uuidOrPassword || '';
    const isReality = tunnel.security === 'reality';
    const isTls = tunnel.security === 'tls';
    const hasTls = isTls || isReality;

    let tlsConfig: Record<string, any> | undefined = undefined;
    if (hasTls) {
      const baseTls: Record<string, any> = {
        enabled: true,
        server_name: tunnel.sni || host,
        insecure: tunnel.insecure,
      };

      if (tunnel.alpn && tunnel.alpn.length > 0) {
        baseTls.alpn = tunnel.alpn;
      }

      if (isReality) {
        // In sing-box v1.10.7, uTLS is required by reality client
        const fp = tunnel.utls?.fingerprint || 'chrome';
        baseTls.utls = {
          enabled: true,
          fingerprint: fp,
        };

        baseTls.reality = {
          enabled: true,
          public_key: tunnel.reality?.publicKey || '',
          short_id: tunnel.reality?.shortId !== undefined ? tunnel.reality.shortId : undefined,
        };
      }

      tlsConfig = baseTls;
    }

    // Determine transport configuration (ws, xhttp, etc.)
    let transportConfig: Record<string, any> | undefined = undefined;
    if (tunnel.type === 'ws') {
      let wsPath = tunnel.path || '/';
      let maxEarlyData = tunnel.maxEarlyData;
      let earlyDataHeaderName = tunnel.earlyDataHeaderName;

      // Ensure ed parameter is stripped from path and mapped to sing-box early data options
      if (wsPath.includes('?')) {
        const [basePath, search] = wsPath.split('?');
        const searchParams = new URLSearchParams(search);
        const edVal = searchParams.get('ed');
        if (edVal) {
          const parsedEd = parseInt(edVal, 10);
          if (!isNaN(parsedEd)) {
            maxEarlyData = maxEarlyData ?? parsedEd;
            earlyDataHeaderName = earlyDataHeaderName ?? 'Sec-WebSocket-Protocol';
          }
          searchParams.delete('ed');
        }
        const remainingSearch = searchParams.toString();
        wsPath = remainingSearch ? `${basePath}?${remainingSearch}` : (basePath || '/');
      }

      if (maxEarlyData && !earlyDataHeaderName) {
        earlyDataHeaderName = 'Sec-WebSocket-Protocol';
      }

      transportConfig = {
        type: 'ws',
        path: wsPath,
        headers: tunnel.wsHost ? { Host: tunnel.wsHost } : undefined,
        max_early_data: maxEarlyData,
        early_data_header_name: maxEarlyData ? (earlyDataHeaderName || 'Sec-WebSocket-Protocol') : undefined,
      };
    } else if (tunnel.type === 'xhttp' || tunnel.type === 'splithttp' || tunnel.xhttp) {
      const x = tunnel.xhttp;
      const path = x?.path || tunnel.path || '/';
      const hostHeader = x?.host || tunnel.wsHost || undefined;

      let headers: Record<string, string> | undefined = undefined;
      if (x?.headers && Object.keys(x.headers).length > 0) {
        headers = { ...x.headers };
      }
      if (hostHeader) {
        headers = { ...(headers || {}), Host: hostHeader };
      }

      const xhttpTransport: Record<string, any> = {
        type: 'xhttp',
        mode: x?.mode || 'auto',
        path: path,
      };

      if (hostHeader) {
        xhttpTransport.host = hostHeader;
      }
      if (headers && Object.keys(headers).length > 0) {
        xhttpTransport.headers = headers;
      }
      if (x?.x_padding_bytes !== undefined) {
        xhttpTransport.x_padding_bytes = x.x_padding_bytes;
      }
      if (x?.no_grpc_header !== undefined) {
        xhttpTransport.no_grpc_header = x.no_grpc_header;
      }
      if (x?.xmux !== undefined && Object.keys(x.xmux).length > 0) {
        xhttpTransport.xmux = x.xmux;
      }

      transportConfig = xhttpTransport;
    }

    proxyOutbound = {
      type: 'vless',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      uuid,
      flow: tunnel.flow || undefined,
      packet_encoding: tunnel.packetEncoding || undefined,
      tls: tlsConfig,
      transport: transportConfig,
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
    const uuid = (tunnel.uuidOrPassword || '').trim();

    if (!uuid) {
      throw new Error('Invalid VMess configuration: missing required user UUID');
    }
    if (!host) {
      throw new Error('Invalid VMess configuration: missing server address');
    }

    proxyOutbound = {
      type: 'vmess',
      tag: 'proxy-out',
      server: host,
      server_port: port,
      uuid,
      security: 'auto',
      alter_id: 0,
      global_padding: false,
      authenticated_length: true,
      tls:
        tunnel.security === 'tls'
          ? {
              enabled: true,
              server_name: tunnel.sni || host,
              insecure: tunnel.insecure,
            }
          : undefined,
      transport:
        tunnel.type === 'ws'
          ? {
              type: 'ws',
              path: tunnel.path || '/',
              headers: tunnel.wsHost ? { Host: tunnel.wsHost } : undefined,
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
        ...(proxyOutbound.type === 'vless' &&
        proxyOutbound.server &&
        !/^(\d{1,3}\.){3}\d{1,3}$/.test(proxyOutbound.server) &&
        !proxyOutbound.server.includes(':')
          ? [
              {
                domain: [proxyOutbound.server],
                server: 'dns-direct',
              },
            ]
          : []),
        {
          outbound: 'any',
          server: 'dns-direct',
        },
      ],
      final: 'dns-remote',
      strategy: 'prefer_ipv4',
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: isMobile ? 'tun0' : 'null-vpn0',
        inet4_address: '172.19.0.1/30',
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
        type: 'dns' as any,
        tag: 'dns-out',
      },
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
          outbound: 'dns-out',
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
