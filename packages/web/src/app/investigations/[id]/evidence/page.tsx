"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { EvidenceListItem } from "@/lib/api/types";
import { EvidenceList } from "@/components/evidence/evidence-list";
import {
  EvidenceIntake,
  type EvidenceIntakeSubmitRequest,
} from "@/components/evidence/evidence-intake";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { triggerOrQueueUploadSequence } from "@/components/graph/graph-live";

export default function EvidencePage() {
  const workspace = useWorkspace();
  const [items, setItems] = useState<EvidenceListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.evidence.listByInvestigation(
        workspace.investigationId,
        { pageSize: 100 },
      );
      setItems(page.items);
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setItems([]);
      } else {
        setError(pe.message);
      }
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = useCallback(
    async (request: EvidenceIntakeSubmitRequest) => {
      await workspace.evidence.submit(workspace.investigationId, request);
      
      triggerOrQueueUploadSequence(workspace.realtime);
      
      await load();
    },
    [workspace, load],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-text-primary">Evidence</h1>
        <Badge variant="muted">Evidence Items</Badge>
      </div>

      <Card>
        <CardHeader className="border-b border-border-subtle px-6 py-4">
          <CardTitle>Add Evidence</CardTitle>
        </CardHeader>
        <div className="p-6">
          <EvidenceIntake
            evidence={workspace.evidence}
            investigationId={workspace.investigationId}
            caseId={workspace.caseId}
            onSubmitEvidence={handleSubmit}
            onComplete={() => undefined}
          />
        </div>
      </Card>

      <Card>
        <CardHeader className="border-b border-border-subtle px-6 py-4">
          <CardTitle>Evidence in this investigation</CardTitle>
        </CardHeader>
        <div className="p-6">
          <EvidenceList
            items={items}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
          />
        </div>
      </Card>
    </div>
  );
}