import type {
  SubscriptionFormat,
  SubscriptionParseResult,
  SubscriptionParseError,
  ParsedTunnel,
} from '../types/vpn';
import { UriParserFactory } from './UriParserFactory';
import { normalizeRealityPublicKey } from './VlessParser';

/**
 * Safe UTF-8 Base64 Decoder handling standard, URL-safe base64, and padding variants.
 */
export function safeBase64Decode(str: string): string | null {
  try {
    const cleaned = str.trim().replace(/\s+/g, '');
    if (!cleaned) return null;
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);
    const binary = atob(padded);
    try {
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return binary;
    }
  } catch {
    return null;
  }
}

/**
 * SubscriptionDecoder:
 * Detects subscription payload format, decodes raw contents,
 * and delegates node parsing to UriParserFactory.
 */
export class SubscriptionDecoder {
  /**
   * Identifies the format of raw subscription text without executing full parse.
   */
  public static detectFormat(rawText: string): {
    format: SubscriptionFormat;
    decodedText?: string;
    unsupportedMessage?: string;
  } {
    const text = rawText.trim();
    if (!text) {
      return { format: 'unknown', unsupportedMessage: 'Input content is empty' };
    }

    // 1. Detect sing-box JSON configuration
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const obj = JSON.parse(text);
        if (
          obj &&
          (Array.isArray(obj.outbounds) ||
            Array.isArray(obj.inbounds) ||
            obj.route ||
            obj.dns)
        ) {
          return { format: 'singbox-json', decodedText: text };
        }
      } catch {}
    }

    // 2. Detect Clash / Mihomo YAML configuration
    if (
      text.includes('proxies:') ||
      text.includes('proxy-groups:') ||
      (text.includes('rules:') && (text.includes('port:') || text.includes('mode:')))
    ) {
      return {
        format: 'clash-yaml',
        unsupportedMessage:
          'Clash / Mihomo YAML format detected. YAML parser is not bundled in current runtime; please use sing-box JSON or standard share-link subscriptions.',
      };
    }

    // 3. Detect Plain Share-Link List
    const hasPlainLinks =
      /(vless|vmess|trojan|ss):\/\//i.test(text) || text.includes('[Interface]');
    if (hasPlainLinks) {
      return { format: 'plain', decodedText: text };
    }

    // 4. Detect Base64 Encoded Share-Link List
    const decoded = safeBase64Decode(text);
    if (
      decoded &&
      (/(vless|vmess|trojan|ss):\/\//i.test(decoded) || decoded.includes('[Interface]'))
    ) {
      return { format: 'base64', decodedText: decoded };
    }

    // 5. Unrecognized / Unknown format
    return {
      format: 'unknown',
      unsupportedMessage:
        'Unrecognized format. Expected share-link list (plain or base64) or sing-box JSON.',
    };
  }

  /**
   * Parse sing-box JSON outbound array into ParsedTunnel objects
   */
  private static parseSingBoxJson(jsonText: string): {
    nodes: ParsedTunnel[];
    errors: SubscriptionParseError[];
  } {
    const nodes: ParsedTunnel[] = [];
    const errors: SubscriptionParseError[] = [];

    try {
      const obj = JSON.parse(jsonText);
      const outbounds = Array.isArray(obj.outbounds) ? obj.outbounds : [];

      outbounds.forEach((outbound: any, index: number) => {
        const type = outbound?.type;
        const tag = outbound?.tag || `Node-${index + 1}`;

        if (!type || ['direct', 'block', 'dns'].includes(type)) {
          return;
        }

        try {
          if (type === 'vless') {
            const host = outbound.server || '127.0.0.1';
            const port = outbound.server_port || 443;
            const tls = outbound.tls;
            const isReality = tls?.reality?.enabled;
            const isTls = tls?.enabled && !isReality;
            const security = isReality ? 'reality' : isTls ? 'tls' : 'none';
            const transport = outbound.transport;
            const normalizedType = transport?.type === 'splithttp' ? 'xhttp' : transport?.type || 'tcp';

            const node: ParsedTunnel = {
              name: tag,
              protocol: 'vless',
              endpoint: `${host}:${port}`,
              host,
              port,
              uuidOrPassword: outbound.uuid || '',
              security,
              sni: tls?.server_name || host,
              type: normalizedType,
              flow: outbound.flow || undefined,
              path: transport?.path,
              insecure: tls?.insecure || false,
              wsHost: transport?.headers?.Host || transport?.host,
              maxEarlyData: transport?.max_early_data,
              earlyDataHeaderName: transport?.early_data_header_name,
              xhttp:
                normalizedType === 'xhttp'
                  ? {
                      mode: transport?.mode || 'auto',
                      path: transport?.path || '/',
                      host: transport?.host || transport?.headers?.Host,
                      headers: transport?.headers,
                      x_padding_bytes: transport?.x_padding_bytes,
                      no_grpc_header: transport?.no_grpc_header,
                      xmux: transport?.xmux,
                    }
                  : undefined,
              reality: isReality
                ? {
                    publicKey: normalizeRealityPublicKey(tls.reality.public_key) || tls.reality.public_key,
                    shortId: tls.reality.short_id,
                  }
                : undefined,
              utls: tls?.utls?.fingerprint
                ? {
                    fingerprint: tls.utls.fingerprint,
                  }
                : undefined,
              packetEncoding: outbound.packet_encoding,
              alpn: tls?.alpn,
              rawConfig: JSON.stringify(outbound, null, 2),
            };
            nodes.push(node);
          } else if (type === 'trojan') {
            const host = outbound.server || '127.0.0.1';
            const port = outbound.server_port || 443;
            nodes.push({
              name: tag,
              protocol: 'trojan',
              endpoint: `${host}:${port}`,
              host,
              port,
              uuidOrPassword: outbound.password || '',
              security: 'tls',
              sni: outbound.tls?.server_name || host,
              type: outbound.transport?.type || 'tcp',
              rawConfig: JSON.stringify(outbound, null, 2),
            });
          } else if (type === 'vmess') {
            const host = outbound.server || '127.0.0.1';
            const port = outbound.server_port || 443;
            nodes.push({
              name: tag,
              protocol: 'vmess',
              endpoint: `${host}:${port}`,
              host,
              port,
              uuidOrPassword: outbound.uuid || '',
              security: outbound.tls?.enabled ? 'tls' : 'none',
              sni: outbound.tls?.server_name || host,
              type: outbound.transport?.type || 'tcp',
              path: outbound.transport?.path,
              wsHost: outbound.transport?.headers?.Host,
              rawConfig: JSON.stringify(outbound, null, 2),
            });
          } else if (type === 'shadowsocks') {
            const host = outbound.server || '127.0.0.1';
            const port = outbound.server_port || 8388;
            nodes.push({
              name: tag,
              protocol: 'shadowsocks',
              endpoint: `${host}:${port}`,
              host,
              port,
              uuidOrPassword: outbound.password || '',
              rawConfig: JSON.stringify(outbound, null, 2),
            });
          } else if (type === 'wireguard') {
            const host = outbound.server || '127.0.0.1';
            const port = outbound.server_port || 51820;
            const peer = outbound.peers?.[0];
            nodes.push({
              name: tag,
              protocol: 'wireguard',
              endpoint: `${host}:${port}`,
              host,
              port,
              wireguard: {
                privateKey: outbound.private_key,
                publicKey: peer?.public_key || outbound.peer_public_key,
                preSharedKey: peer?.pre_shared_key || outbound.pre_shared_key,
                allowedIPs: peer?.allowed_ips?.join(', ') || '0.0.0.0/0',
                reserved: peer?.reserved || outbound.reserved,
                mtu: outbound.mtu,
              },
              rawConfig: JSON.stringify(outbound, null, 2),
            });
          }
        } catch (err: any) {
          errors.push({
            line: index + 1,
            raw: `Outbound [${tag}]`,
            error: err?.message || 'Failed to parse outbound structure',
          });
        }
      });
    } catch (err: any) {
      errors.push({
        line: 1,
        raw: 'sing-box JSON root',
        error: `Invalid JSON syntax: ${err?.message || 'Malformed structure'}`,
      });
    }

    return { nodes, errors };
  }

  /**
   * Decodes and parses any subscription content into a structured SubscriptionParseResult.
   */
  public static decodeAndParse(rawText: string): SubscriptionParseResult {
    const detection = this.detectFormat(rawText);

    if (detection.format === 'unknown' || detection.format === 'clash-yaml') {
      return {
        format: detection.format,
        nodes: [],
        errors: detection.unsupportedMessage
          ? [{ line: 1, raw: '', error: detection.unsupportedMessage }]
          : [],
        nodeCount: 0,
        unsupportedMessage: detection.unsupportedMessage,
      };
    }

    if (detection.format === 'singbox-json') {
      const { nodes, errors } = this.parseSingBoxJson(detection.decodedText || rawText);
      return {
        format: 'singbox-json',
        nodes,
        errors,
        nodeCount: nodes.length,
      };
    }

    // For plain or base64, delegate multi-line parsing to UriParserFactory
    const textToParse = detection.decodedText || rawText;
    const { nodes, errors } = UriParserFactory.parseMultiNodeWithReport(textToParse);

    return {
      format: detection.format,
      nodes,
      errors,
      nodeCount: nodes.length,
    };
  }
}
