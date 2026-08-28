import type { ArtifactReference } from '@indago/contracts';
import net from 'node:net';

// ============================================================================
// Artifact Fetcher
//
// Abstracts HTTP retrieval of artifacts from remote URLs.
// The URL is treated as opaque — no provider SDK coupling.
//
// SECURITY (positive policy, no blacklists):
//  - Only https is permitted by default (http only when explicitly enabled).
//  - Loopback, private, link-local/metadata, CGNAT and v6-ULA destinations are
//    rejected, as are reserved hostnames (localhost, .local, .internal, ...).
//  - Redirects are followed MANUALLY, at most `maxRedirects` hops, and every
//    hop is re-validated against the same policy — a redirect can never move
//    from an approved public origin to an internal/private target.
//  - The fetch deadline remains ACTIVE during body consumption (slow-drip
//    bodies cannot outlive the timeout).
//
// HARD RULE: The fetcher MUST enforce maxBytes while streaming.
// It NEVER accumulates an unbounded response in memory.
// ============================================================================

export interface FetchOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

export interface FetchedArtifact {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly contentLength: number | undefined;
  readonly body: Uint8Array;
}

export interface ArtifactFetcher {
  fetch(
    reference: ArtifactReference,
    options: FetchOptions,
  ): Promise<FetchedArtifact>;
}

// ============================================================================
// HTTP Error Types
//
// Distinguishable failure modes for the acquisition service.
// ============================================================================

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class FetchFailedError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'FetchFailedError';
  }
}

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

export class ArtifactTooLargeError extends Error {
  constructor(
    message: string,
    public readonly maxBytes: number,
    public readonly actualBytes?: number,
  ) {
    super(message);
    this.name = 'ArtifactTooLargeError';
  }
}

export class InvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReferenceError';
  }
}

// ============================================================================
// Fetch Policy — positive security policy for outbound artifact retrieval.
// ============================================================================

export interface ArtifactFetchPolicy {
  /** Schemes permitted at every hop. Default: https only. */
  readonly allowedSchemes?: ReadonlySet<string>;
  /** Positive allowlist of origins (hostnames). When set, ONLY these hosts
   *  and their subdomains may be fetched. */
  readonly allowedOrigins?: ReadonlySet<string>;
  /** Maximum redirect hops followed. Default 5. */
  readonly maxRedirects?: number;
  /** Permit private/loopback/link-local destinations. Stays false in
   *  production; exists so integration tests can target a real local
   *  fixture server. */
  readonly allowPrivateHosts?: boolean;
}

const DEFAULT_POLICY: ArtifactFetchPolicy = {
  allowedSchemes: new Set(['https']),
  maxRedirects: 5,
  allowPrivateHosts: false,
};

const RESERVED_HOST_NAMES = ['localhost'];
const RESERVED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

function isPrivateIpv4(octets: number[]): boolean {
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  if (a === 0 || a === 255) return true; // unspecified / broadcast
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  // "::ffff:a.b.c.d" — embedded IPv4
  const v4Embedded = lower.match(/^::ffff:(\d+(?:\.\d+){3})/);
  if (v4Embedded) {
    const octets = v4Embedded[1]!.split('.').map(Number);
    return isPrivateIpv4(octets);
  }
  if (lower === '::' || lower === '::1') return true; // unspecified / loopback
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true; // fe80::/10 link-local
  }
  const head = lower.split(':')[0] ?? '';
  if (head.startsWith('fc') || head.startsWith('fd')) return true; // fc00::/7 ULA
  if (head.startsWith('ff')) return true; // multicast
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (RESERVED_HOST_NAMES.includes(normalized)) return true;
  return RESERVED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function hostIsAllowed(host: string, policy: ArtifactFetchPolicy): boolean {
  let normalized = host.toLowerCase().replace(/\.$/, '');
  // URL.hostname keeps the brackets for IPv6 literals ("[::1]"), but Node's
  // net.isIP expects the bare address.
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    const octets = normalized.split('.').map(Number);
    if (!policy.allowPrivateHosts && isPrivateIpv4(octets)) return false;
    return true;
  }
  if (ipVersion === 6) {
    if (!policy.allowPrivateHosts && isPrivateIpv6(normalized)) return false;
    return true;
  }

  if (isBlockedHostname(normalized)) return false;

  if (policy.allowedOrigins && policy.allowedOrigins.size > 0) {
    for (const origin of policy.allowedOrigins) {
      const o = origin.toLowerCase().replace(/\.$/, '');
      if (normalized === o || normalized.endsWith(`.${o}`)) return true;
    }
    return false;
  }
  return true;
}

/**
 * Validate a destination against the positive fetch policy. Returns the
 * parsed URL (so redirect targets can be resolved and re-validated) or
 * throws InvalidReferenceError.
 */
export function assertSafeFetchUrl(
  rawUrl: string,
  policy: ArtifactFetchPolicy = DEFAULT_POLICY,
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidReferenceError(`Invalid URL: ${rawUrl}`);
  }

  const schemes = policy.allowedSchemes ?? DEFAULT_POLICY.allowedSchemes;
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (!schemes?.has(scheme)) {
    throw new InvalidReferenceError(`Unsupported URL scheme: ${url.protocol}`);
  }

  const host = url.hostname.toLowerCase();
  if (!host) throw new InvalidReferenceError('Invalid URL: missing host');

  if (!hostIsAllowed(host, policy ?? {})) {
    throw new InvalidReferenceError(`Destination host not permitted: ${host}`);
  }
  return url;
}

// ============================================================================
// HTTP Artifact Fetcher
//
// Uses Node's built-in fetch with streaming byte enforcement.
// Guarantees: returned body.byteLength <= maxBytes, always.
// ============================================================================

export class HttpArtifactFetcher implements ArtifactFetcher {
  constructor(
    private readonly policy: ArtifactFetchPolicy = DEFAULT_POLICY,
  ) {}

  async fetch(
    reference: ArtifactReference,
    options: FetchOptions,
  ): Promise<FetchedArtifact> {
    // Positive origin validation BEFORE any network I/O.
    const requestedUrl = assertSafeFetchUrl(reference.url, this.policy);
    const maxRedirects = this.policy.maxRedirects ?? 5;

    // Fast reject: declared size exceeds limit
    if (
      reference.declaredSizeBytes !== undefined &&
      reference.declaredSizeBytes > options.maxBytes
    ) {
      throw new ArtifactTooLargeError(
        `Declared size ${reference.declaredSizeBytes} exceeds maximum ${options.maxBytes}`,
        options.maxBytes,
        reference.declaredSizeBytes,
      );
    }

    const controller = new AbortController();
    const deadlineAt = Date.now() + options.timeoutMs;

    // Activity watchdog: rejects FetchTimeoutError when `p` does not settle
    // before the deadline, and aborts the underlying transport so partial
    // bytes are torn down. Re-used for BOTH the header phase and every body
    // read — the timeout never goes quiet during body consumption.
    const withDeadline = <T>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => {
          const remaining = Math.max(0, deadlineAt - Date.now());
          const fire = () => {
            controller.abort();
            reject(
              new FetchTimeoutError(`Fetch timed out after ${options.timeoutMs}ms`),
            );
          };
          if (remaining <= 0) {
            fire();
          } else {
            setTimeout(fire, remaining);
          }
        }),
      ]);

    try {
      let response: Response | undefined;
      let currentUrl: URL = requestedUrl;

      // Manual redirect handling: every hop is re-validated against the same
      // positive policy, and the hop count is capped.
      for (let hop = 0; ; hop++) {
        let fetched: Response;
        try {
          fetched = await withDeadline(
            fetch(currentUrl.toString(), {
              signal: controller.signal,
              redirect: 'manual',
            }),
          );
        } catch (err: unknown) {
          if (err instanceof FetchTimeoutError) throw err;
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw new FetchTimeoutError(
              `Fetch timed out after ${options.timeoutMs}ms`,
            );
          }
          throw new FetchFailedError(
            `Network error fetching ${reference.url}`,
            err instanceof Error ? err : undefined,
          );
        }

        const status = fetched.status;
        const location = fetched.headers.get('location');
        if (status >= 300 && status < 400 && location) {
          if (hop >= maxRedirects) {
            await fetched.body?.cancel().catch(() => {});
            throw new FetchFailedError(
              `Too many redirects (max ${maxRedirects}) fetching ${reference.url}`,
            );
          }
          currentUrl = assertSafeFetchUrl(
            new URL(location, currentUrl).toString(),
            this.policy,
          );
          continue;
        }
        response = fetched;
        break;
      }

      if (!response) {
        throw new FetchFailedError(
          `No HTTP response fetching ${reference.url}`,
        );
      }

      // Check Content-Length before downloading body
      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : undefined;

      if (contentLength !== undefined && contentLength > options.maxBytes) {
        response.body?.cancel().catch(() => {});
        throw new ArtifactTooLargeError(
          `Content-Length ${contentLength} exceeds maximum ${options.maxBytes}`,
          options.maxBytes,
          contentLength,
        );
      }

      const contentType = response.headers.get('content-type') ?? undefined;

      // Stream body with byte enforcement (timeout still armed via withDeadline)
      if (!response.body) {
        return {
          status: response.status,
          contentType,
          contentLength: contentLength ?? 0,
          body: new Uint8Array(0),
        };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        let read: Awaited<ReturnType<typeof reader.read>>;
        try {
          read = await withDeadline(reader.read());
        } catch (err) {
          if (err instanceof FetchTimeoutError) {
            throw err; // partial data discarded — nothing is returned
          }
          throw new FetchFailedError(
            'Error reading response body',
            err instanceof Error ? err : undefined,
          );
        }
        if (read.done) break;
        totalBytes += read.value.byteLength;
        if (totalBytes > options.maxBytes) {
          // Abort and discard all partial data
          await reader.cancel().catch(() => {});
          controller.abort();
          throw new ArtifactTooLargeError(
            `Downloaded ${totalBytes} bytes, exceeding maximum ${options.maxBytes}`,
            options.maxBytes,
            totalBytes,
          );
        }
        chunks.push(read.value);
      }

      // Concatenate chunks only after full validation
      return {
        status: response.status,
        contentType,
        contentLength: contentLength ?? totalBytes,
        body: concatChunks(chunks),
      };
    } catch (err) {
      controller.abort();
      throw err;
    }
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0]!;

  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.byteLength;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
