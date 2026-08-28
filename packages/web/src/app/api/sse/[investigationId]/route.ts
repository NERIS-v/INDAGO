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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const { investigationId } = await params;

  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const token = process.env.AUTH_TOKEN;

  if (!baseUrl || !token) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const platformUrl = `${baseUrl}/api/v1/investigations/${investigationId}/stream`;

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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
