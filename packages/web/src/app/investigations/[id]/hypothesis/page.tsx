import { HypothesisEngine } from "@/components/intel/hypothesis-engine";

export default function HypothesisPage({ params }: { params: { id: string } }) {
  return <HypothesisEngine investigationId={params.id} />;
}