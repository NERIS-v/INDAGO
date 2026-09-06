import { HypothesisWorkspace } from "@/components/intel/hypothesis-workspace";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function HypothesisPage({ params }: PageProps) {
  // In Next.js 15, params must be awaited
  await params;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <HypothesisWorkspace />
    </div>
  );
}