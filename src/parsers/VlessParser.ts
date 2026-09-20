import type { ParseResult, ParsedTunnel } from '../types/vpn';

/**
 * Pure parser for VLESS URI links:
 * vless://uuid@host:port?type=ws&security=tls&host=...&sni=...&path=...#name
 *
 * Normalizes parameters strictly for sing-box v1.10.7:
 * - host (in query) -> wsHost (mapped to transport.headers.Host)
 * - sni -> sni (mapped to tls.server_name)
 * - allowInsecure -> insecure boolean (mapped to tls.insecure)
 * - ed query in path -> extracts maxEarlyData, sets earlyDataHeaderName to "Sec-WebSocket-Protocol",
 *   and strips ?ed=... from the cleaned WebSocket path.
 */
export function parseVlessUri(rawUri: string): ParseResult {
  try {
    const uri = new URL(rawUri);
    const uuid = uri.username;
    const host = uri.hostname;
    const port = parseInt(uri.port || '443', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `VLESS-${host}`;

    if (!uuid) {
      return { success: false, error: 'VLESS URI missing UUID credentials' };
    }
    if (!host) {
      return { success: false, error: 'VLESS URI missing remote host address' };
    }

    const params = uri.searchParams;
    const type = params.get('type') || 'tcp';
    const security = params.get('security') || 'tls';
    const sni = params.get('sni') || host;
    const flow = params.get('flow') || undefined;
    const rawPath = params.get('path') || undefined;

    let cleanPath = rawPath;
    let maxEarlyData: number | undefined = undefined;
    let earlyDataHeaderName: string | undefined = undefined;

    if (rawPath) {
      if (rawPath.includes('?')) {
        const [basePath, search] = rawPath.split('?');
        const searchParams = new URLSearchParams(search);
        const edVal = searchParams.get('ed');
        if (edVal) {
          const parsedEd = parseInt(edVal, 10);
          if (!isNaN(parsedEd)) {
            maxEarlyData = parsedEd;
            earlyDataHeaderName = 'Sec-WebSocket-Protocol';
          }
          searchParams.delete('ed');
        }
        const remainingSearch = searchParams.toString();
        cleanPath = remainingSearch ? `${basePath}?${remainingSearch}` : basePath;
      }
    }

    if (maxEarlyData === undefined && params.get('ed')) {
      const parsedEd = parseInt(params.get('ed')!, 10);
      if (!isNaN(parsedEd)) {
        maxEarlyData = parsedEd;
        earlyDataHeaderName = 'Sec-WebSocket-Protocol';
      }
    }

    const insecure = params.get('allowInsecure') === '1';
    const wsHost = params.get('host') || undefined;

    // Reality parameters with aliases (pbk / public_key, sid / short_id)
    const publicKey = params.get('pbk') || params.get('public_key') || undefined;
    const shortId = params.get('sid') || params.get('short_id') || undefined;

    // uTLS fingerprint with aliases (fp / fingerprint)
    const fingerprint = params.get('fp') || params.get('fingerprint') || undefined;

    // Packet encoding with aliases (packetEncoding / packet_encoding)
    const packetEncoding = params.get('packetEncoding') || params.get('packet_encoding') || undefined;

    // ALPN list (comma-separated if present)
    const rawAlpn = params.get('alpn');
    const alpn = rawAlpn
      ? rawAlpn.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const reality =
      security === 'reality' || publicKey !== undefined || shortId !== undefined
        ? {
            publicKey,
            shortId,
          }
        : undefined;

    const utls =
      fingerprint !== undefined
        ? {
            fingerprint,
          }
        : undefined;

    const tunnel: ParsedTunnel = {
      name,
      protocol: 'vless',
      endpoint: `${host}:${port}`,
      host,
      port,
      uuidOrPassword: uuid,
      security,
      sni,
      type,
      flow,
      path: cleanPath,
      insecure,
      wsHost,
      maxEarlyData,
      earlyDataHeaderName,
      reality,
      utls,
      packetEncoding,
      alpn,
      rawConfig: rawUri.trim(),
    };

    return {
      success: true,
      tunnel,
    };
  } catch (err: any) {
    return { success: false, error: `Invalid VLESS URI: ${err?.message || 'Malformed structure'}` };
  }
}
