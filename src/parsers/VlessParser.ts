import type { ParseResult, ParsedTunnel } from '../types/vpn';

/**
 * Safely extracts a query parameter directly from a URL search query string
 * without converting '+' to spaces ' ' (which URLSearchParams does under form-urlencoded rules).
 */
export function extractQueryParamRaw(search: string, paramName: string): string | undefined {
  if (!search) return undefined;
  const regex = new RegExp(`(?:^|[?&])${paramName}=([^&#]*)`, 'i');
  const match = search.match(regex);
  if (!match) return undefined;
  const raw = match[1];
  try {
    // decodeURIComponent decodes %2B -> +, %2F -> /, %3D -> =
    // but crucially preserves literal '+' characters
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Normalizes Reality public key:
 * - Strips whitespace and surrounding quotes
 * - Recovers '+' if URL decoding converted '+' to space ' '
 * - Normalizes Base64URL (- and _) to standard Base64 (+ and /)
 * - Adds padding '=' if missing (unpadded 43 chars -> 44 chars)
 */
export function normalizeRealityPublicKey(key: string | undefined): string | undefined {
  if (!key || typeof key !== 'string') return undefined;
  let cleaned = key.trim();
  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
     (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // If spaces were introduced by application/x-www-form-urlencoded parsing (+ -> ' '), restore '+'
  cleaned = cleaned.replace(/ /g, '+');
  // Normalize Base64URL (- and _) to standard Base64 (+ and /)
  cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  // Restore Base64 '=' padding if missing (32 bytes = 43 chars unpadded -> 44 chars with '=')
  const padLen = (4 - (cleaned.length % 4)) % 4;
  if (padLen > 0) {
    cleaned = cleaned + '='.repeat(padLen);
  }
  return cleaned;
}

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
    let normalizedRaw = rawUri.trim();
    if (!normalizedRaw.toLowerCase().startsWith('vless://')) {
      return { success: false, error: 'Invalid link format: Must start with vless://' };
    }

    const uri = new URL(normalizedRaw);
    const uuid = uri.username;
    const host = uri.hostname;
    const port = parseInt(uri.port || '443', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `VLESS-${host}`;

    if (!uuid) {
      return { success: false, error: 'VLESS URI missing UUID credentials' };
    }

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$|^[0-9a-fA-F]{32}$/;
    if (!uuidRegex.test(uuid)) {
      return { success: false, error: 'Invalid UUID: Must be a standard 32 or 36 character hexadecimal UUID' };
    }

    if (!host) {
      return { success: false, error: 'VLESS URI missing remote host address' };
    }

    if (isNaN(port) || port <= 0 || port > 65535) {
      return { success: false, error: `Invalid port "${uri.port}": Must be a number between 1 and 65535` };
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
    // Extract raw value directly from search string first to avoid application/x-www-form-urlencoded
    // converting literal '+' into spaces (' '), which corrupts Base64 cryptographic keys.
    const rawPbk = extractQueryParamRaw(uri.search, 'pbk') ||
                   extractQueryParamRaw(uri.search, 'public_key') ||
                   params.get('pbk') ||
                   params.get('public_key') ||
                   undefined;
    const publicKey = normalizeRealityPublicKey(rawPbk);

    const rawSid = extractQueryParamRaw(uri.search, 'sid') ||
                   extractQueryParamRaw(uri.search, 'short_id') ||
                   params.get('sid') ||
                   params.get('short_id') ||
                   undefined;
    const shortId = rawSid ? rawSid.trim() : undefined;

    if (security === 'reality' && !publicKey) {
      return { success: false, error: 'Invalid Reality parameters: Missing public key (pbk/public_key)' };
    }

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

    // XHTTP / SplitHTTP transport parsing
    const normalizedType = type === 'splithttp' ? 'xhttp' : type;
    let xhttp: import('../types/vpn').XHttpParams | undefined = undefined;
    if (normalizedType === 'xhttp') {
      const mode = params.get('mode') || params.get('xhttp_mode') || 'auto';
      const validModes = ['auto', 'stream-up', 'stream-one', 'packet-up'];
      if (!validModes.includes(mode)) {
        return {
          success: false,
          error: `Invalid XHTTP configuration: Unsupported mode "${mode}". Supported: ${validModes.join(', ')}`,
        };
      }

      const xhttpHost = params.get('host') || params.get('xhttp_host') || undefined;
      const xPadding = params.get('x_padding_bytes') || params.get('x_padding') || params.get('padding') || undefined;
      const noGrpcHeaderParam = params.get('no_grpc_header');
      const noGrpcHeader =
        noGrpcHeaderParam === '1' || noGrpcHeaderParam === 'true'
          ? true
          : noGrpcHeaderParam === '0' || noGrpcHeaderParam === 'false'
            ? false
            : undefined;

      let xhttpHeaders: Record<string, string> | undefined = undefined;
      const rawHeaders = params.get('headers') || params.get('extra');
      if (rawHeaders) {
        try {
          xhttpHeaders = JSON.parse(rawHeaders);
        } catch {
          return {
            success: false,
            error: 'Invalid XHTTP configuration: Malformed JSON in headers/extra parameter',
          };
        }
      }

      let xmux: Record<string, any> | undefined = undefined;
      const rawXmux = params.get('xmux');
      if (rawXmux) {
        try {
          xmux = JSON.parse(rawXmux);
        } catch {}
      }

      xhttp = {
        mode,
        path: cleanPath || '/',
        host: xhttpHost,
        headers: xhttpHeaders,
        x_padding_bytes: xPadding,
        no_grpc_header: noGrpcHeader,
        xmux,
      };
    }

    const tunnel: ParsedTunnel = {
      name,
      protocol: 'vless',
      endpoint: `${host}:${port}`,
      host,
      port,
      uuidOrPassword: uuid,
      security,
      sni,
      type: normalizedType,
      flow,
      path: cleanPath,
      insecure,
      wsHost,
      maxEarlyData,
      earlyDataHeaderName,
      xhttp,
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
