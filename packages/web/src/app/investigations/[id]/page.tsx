import { notFound } from "next/navigation";
import { InvestigationDetail } from "./investigation-detail";
import type { InvestigationStatusResponse } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ caseId?: string }>;
}

async function getInvestigation(
  investigationId: string,
  caseId: string,
): Promise<InvestigationStatusResponse | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const token = process.env.AUTH_TOKEN;

  if (!baseUrl || !token) return null;

  try {
    const res = await fetch(
      `${baseUrl}/api/v1/investigations/${investigationId}?caseId=${encodeURIComponent(caseId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    if (!res.ok) return null;
    return (await res.json()) as InvestigationStatusResponse;
  } catch {
    return null;
  }
}

export default async function InvestigationPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { caseId } = await searchParams;

  if (!caseId) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-amber-50">
            <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-surface-900">Missing caseId</h1>
            <p className="mt-2 text-sm text-surface-500">
              Navigate from the dashboard with a case ID to view an investigation.
            </p>
          </div>
          <a href="/">
            <Button variant="secondary" size="sm">Go to Dashboard</Button>
          </a>
        </div>
      </div>
    );
  }

  const investigation = await getInvestigation(id, caseId);

  if (!investigation) {
    notFound();
  }

  return <InvestigationDetail initialData={investigation} caseId={caseId} />;
}
