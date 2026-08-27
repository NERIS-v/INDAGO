import { InvestigationOverview } from "./investigation-overview";

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ caseId?: string }>;
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
            <span className="inline-flex rounded-md border border-border-subtle bg-surface-50 px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100">
              Go to Dashboard
            </span>
          </a>
        </div>
      </div>
    );
  }

  // The workspace shell + provider bundle are established in the layout via
  // <WorkspaceBoundary>, which resolves investigationId from the route and
  // caseId from ?caseId=. The overview consumes the bundle through the
  // Workspace context and never imports Demo/Live implementations directly.
  return <InvestigationOverview investigationId={id} />;
}
