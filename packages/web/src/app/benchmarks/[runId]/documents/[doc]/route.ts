import { NextResponse } from "next/server";

import { readBenchmarkDocument } from "@/lib/benchmark/benchmark-loader";

export const dynamic = "force-dynamic";

// Serves the committed raw benchmark artifacts (reproducibility actions).
// Path is restricted to the allowlist in the loader; anything else is FORBIDDEN.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; doc: string }> },
) {
  const { runId, doc } = await params;
  const result = await readBenchmarkDocument(runId, doc);

  if (!result.ok) {
    if (result.reason === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return new NextResponse(result.content, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}