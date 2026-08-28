"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createIntakeProviders, toProviderError } from "@/lib/providers";
import type { IntakeProviders } from "@/lib/providers/factory";
import { investigationUrl } from "@/lib/workspace/url";
import { EvidenceIntake, type EvidenceIntakeSubmitRequest } from "@/components/evidence/evidence-intake";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type Stage = "case" | "preparing" | "intake";

export default function NewInvestigationPage() {
  const router = useRouter();
  const [caseInput, setCaseInput] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("case");
  const [intake, setIntake] = useState<IntakeProviders | null>(null);
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Coordinator: resolves the investigation identity and prepares the intake
   * provider set for the entered case. Demos reuse their deterministic case
   * investigation; live modes create/start a fresh one. It never branches on
   * data mode — it asks the provider layer.
   */
  const beginIntake = useCallback(async (rawCaseId: string) => {
    const trimmed = rawCaseId.trim();
    if (!trimmed) return;
    setError(null);
    setStage("preparing");
    try {
      const providers = createIntakeProviders(trimmed);
      let resolvedId: string | undefined;
      try {
        const list = await providers.investigations.listByCase(trimmed, {
          pageSize: 1,
        });
        resolvedId = list.items[0]?.id;
      } catch {
        resolvedId = undefined;
      }
      const id = resolvedId ?? crypto.randomUUID();
      await providers.investigations.start(trimmed, id);
      setCaseId(trimmed);
      setIntake(providers);
      setInvestigationId(id);
      setStage("intake");
    } catch (err) {
      setError(toProviderError(err).message);
      setStage("case");
    }
  }, []);

  const handleSubmitEvidence = useCallback(
    async (request: EvidenceIntakeSubmitRequest) => {
      if (!intake || !investigationId || !caseId) return;
      await intake.evidence.submit(investigationId, request);
      router.push(investigationUrl(investigationId, caseId));
    },
    [intake, investigationId, caseId, router],
  );

  if (stage === "preparing") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <LoadingSpinner label="Preparing investigation" />
      </div>
    );
  }

  if (stage === "intake" && intake && investigationId && caseId) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="type-title text-text-primary">New Investigation</h1>
              <p className="type-caption mt-1">
                Create an investigation and submit evidence for case{" "}
                <span className="type-mono">{caseId}</span>.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStage("case")}>
              Change case
            </Button>
          </div>

          <Card padding="md">
            <EvidenceIntake
              evidence={intake.evidence}
              investigationId={investigationId}
              caseId={caseId}
              onSubmitEvidence={handleSubmitEvidence}
              onComplete={() => undefined}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="mx-auto max-w-lg space-y-8">
        <div>
          <h1 className="type-title text-text-primary">New Investigation</h1>
          <p className="type-caption mt-1">
            Enter a case ID to begin a new intelligence analysis.
          </p>
        </div>

        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void beginIntake(caseInput);
            }}
            className="space-y-6"
          >
            <Input
              label="Case ID"
              type="text"
              value={caseInput}
              onChange={(e) => setCaseInput(e.target.value)}
              placeholder="e.g. case-042"
              autoFocus
            />
            {error && (
              <div className="rounded-lg bg-danger/10 p-3 text-sm border border-danger/20 text-danger/80" role="alert">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={!caseInput.trim()}
              className="w-full"
            >
              Continue
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}