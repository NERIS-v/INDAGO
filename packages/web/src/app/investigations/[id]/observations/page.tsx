"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { Observation } from "@indago/contracts";
import { ObservationsList } from "@/components/observations/observations-list";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ObservationsPage() {
  const workspace = useWorkspace();
  const [items, setItems] = useState<Observation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.observations.listByInvestigation(
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-text-primary">Observations</h1>
        <Badge variant="muted">Canonical Observations</Badge>
      </div>

      <Card>
        <CardHeader className="border-b border-border-subtle px-6 py-4">
          <CardTitle>Observations in this investigation</CardTitle>
        </CardHeader>
        <div className="p-6">
          <ObservationsList
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