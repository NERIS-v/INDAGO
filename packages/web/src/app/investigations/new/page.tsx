"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { startInvestigation } from "@/lib/api/server-action";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewInvestigationPage() {
  const router = useRouter();
  const [caseId, setCaseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!caseId.trim()) return;

      setLoading(true);
      setError(null);

      try {
        const investigationId = crypto.randomUUID();
        await startInvestigation({
          caseId: caseId.trim(),
          investigationId,
        });
        router.push(
          `/investigations/${investigationId}?caseId=${encodeURIComponent(caseId.trim())}`,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start investigation";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [caseId, router],
  );

  return (
    <div className="p-8 animate-fade-in">
      <div className="mx-auto max-w-lg space-y-8">
        <div>
          <h1 className="text-lg font-medium tracking-wide text-surface-800">New Investigation</h1>
          <p className="text-xs text-surface-500 mt-1">
            Enter a case ID to begin a new intelligence analysis.
          </p>
        </div>

        <Card>
          <form onSubmit={handleStart} className="space-y-6">
            <Input
              label="Case ID"
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="e.g. case-042"
              disabled={loading}
              autoFocus
            />

            {error && (
              <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger/80 border border-danger/20">
                {error}
              </div>
            )}

            <Button
              type="submit"
              loading={loading}
              disabled={!caseId.trim()}
              className="w-full"
            >
              Start Investigation
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
