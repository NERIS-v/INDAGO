import { HypothesisEngine } from "@/components/intel/hypothesis-engine";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function HypothesisPage({ params }: PageProps) {
  // In Next.js 15, params must be awaited
  const resolvedParams = await params;
  
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <HypothesisEngine investigationId={resolvedParams.id} />
    </div>
  );
}