import { InvestigationScaffold } from "../investigation-scaffold";

export default function TimelinePage() {
  return (
    <InvestigationScaffold
      title="Timeline"
      domain="Observations & Events"
      description="Investigation timeline spanning bands and items. Uses the frontend-local timeline assumption pending a canonical Timeline/Spanning schema."
    />
  );
}
