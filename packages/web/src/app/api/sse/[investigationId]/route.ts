// ============================================================================
// SSE Proxy Route
//
// Server-side API route that proxies SSE events from the platform to the
// browser. The browser connects here (no auth token needed). This route
// authenticates to the platform with the server-side AUTH_TOKEN and
// streams events back.
//
// SECURITY: the platform's stream endpoint enforces case-scope
// authorization (verifyCaseAccess against the canonical run.caseId) BEFORE
// any event is emitted. This proxy is a dumb pipe: it does not and cannot
// grant case access — upstream 401/403/404 responses are forwarded verbatim
// (see below). It cannot be used to obtain an unscoped stream.
//
// GET /api/sse/[investigationId]
// → connects to platform SSE with AUTH_TOKEN
// → streams events to browser
// ============================================================================

import type { NextRequest } from "next/server";

// SSE stream transport: one "data:" frame maps to exactly one JSON message.
// The browser's media-type contract is text/event-stream, and the upstream
// platform emits canonical `data:` frames; the proxy forwards each chunk
// verbatim without splitting or buffering JSON lines.
const SSE_MEDIA_TYPE = "text/event-stream";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const { investigationId } = await params;

  // ---- 0. Boundary validation (fail-closed at the HTTP edge).
  //
  // The investigationId is interleaved INTO the upstream URL path
  // (…/investigations/{id}/stream). A value that is not a canonical UUID v4
  // — or that smuggles a slash/query — must never reach the platform URL
  // construction. We both (a) reject non-UUIDs outright (400) and (b) escape
  // the segment with EncodeURIComponent so even a hostile value cannot change
  // which path the platform serves. The platform route independently re-checks
  // case authorization (verifyCaseAccess) before a single byte streams, so
  // this boundary hardening does not grant, relax, or widen case access.
  if (!isUuidV4(investigationId)) {
    return new Response(
      JSON.stringify({ error: "Invalid investigation ID" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const token = process.env.AUTH_TOKEN;

  if (!baseUrl || !token) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const encodedId = encodeURIComponent(investigationId);
  const platformUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/investigations/${encodedId}/stream`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(platformUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Platform unreachable (not running/network). Surface a clean 502 instead
    // of an unhandled exception 500, so the client can show an honest
    // "stream unavailable" state rather than a generic server error.
    return new Response(
      JSON.stringify({ error: "Platform unreachable" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!upstreamResponse.ok) {
    // Forward the upstream rejection verbatim: 401/403 (unauthorized or
    // wrong-case) and 404 (no such investigation) must reach the browser
    // exactly as the platform decided them. The proxy NEVER downgrades an
    // upstream authorization failure — there is no path where a forbidden
    // stream is 200-masked here.
    return new Response(
      JSON.stringify({ error: `Platform SSE failed: ${upstreamResponse.status}` }),
      { status: upstreamResponse.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      const reader = upstreamResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {
          // Upstream closed
        } finally {
          controller.close();
        }
      };

      void pump();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": SSE_MEDIA_TYPE,
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** RFC 4122 v4-shaped UUID: 8-4-4-4-12 with a fixed `4` version nibble. */
function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
