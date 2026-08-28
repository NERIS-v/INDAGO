import { InvestigationScaffold } from "../investigation-scaffold";

export default function GraphPage() {
  return (
    <InvestigationScaffold
      title="Graph"
      domain="Entities & Relations"
      description="Entity/relation graph rendering, layout, and graph holes. The GraphProvider and graph fixture exist, but the renderer is intentionally deferred to F-PR4."
    />
  );
}
