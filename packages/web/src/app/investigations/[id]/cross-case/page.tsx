import { InvestigationScaffold } from "../investigation-scaffold";

export default function CrossCasePage() {
  return (
    <InvestigationScaffold
      title="Cross-Case"
      domain="Linked Cases"
      description="Cross-case matches linking this case to other investigations. Requires an explicit case identity; deferred to a later F-PR3+ phase."
    />
  );
}
