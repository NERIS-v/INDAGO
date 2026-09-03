"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface EvidenceRequestMock {
  id: string;
  requestedEvidence: string;
  reason: string;
  source: string;
  expectedInformationGain: number;
  priority: "HIGH" | "MODERATE" | "LOW";
  relatedGapId: string;
  status: "PENDING_APPROVAL" | "AUTHORIZED" | "FULFILLED";
}

interface EvidenceRequestListProps {
  requests: EvidenceRequestMock[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function EvidenceRequestList({ requests, onApprove, onReject }: EvidenceRequestListProps) {
  if (!requests.length) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-lg border border-surface-200/60 bg-surface-50 p-5">
        <span className="text-xs text-surface-500">No open evidence requests.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {requests.map((req, i) => (
        <Card 
          key={req.id} 
          className="animate-fade-in border-surface-200/60 bg-surface-50 p-5"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-surface-500">
                  <span className={req.priority === "HIGH" ? "text-brand-500" : ""}>
                    Priority: {req.priority}
                  </span>
                  <span>·</span>
                  <span>Source: {req.source}</span>
                </div>
                <h3 className="font-sans text-sm font-medium text-surface-800 leading-snug">
                  {req.requestedEvidence}
                </h3>
              </div>

              <div className="rounded border border-surface-200/40 bg-surface-100 p-3">
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-surface-500">
                  Rationale
                </span>
                <p className="text-xs text-surface-700">{req.reason}</p>
              </div>
            </div>

            <div className="flex min-w-[200px] flex-col gap-4">
              <div className="flex flex-col items-end gap-1 text-right">
                <Badge variant={req.status === "AUTHORIZED" ? "success" : "warning"} dot>
                  {req.status.replace(/_/g, " ")}
                </Badge>
                <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-surface-500">
                  Utility Score
                </div>
                <div className="text-sm font-medium text-brand-500">
                  EIG: {req.expectedInformationGain.toFixed(2)}
                </div>
              </div>

              {req.status === "PENDING_APPROVAL" && (
                <div className="flex gap-2">
                  <Button 
                    variant="quiet" 
                    className="flex-1 border border-surface-300 hover:bg-danger/10 hover:text-danger hover:border-danger/30"
                    onClick={() => onReject(req.id)}
                  >
                    Reject
                  </Button>
                  <Button 
                    className="flex-1 bg-surface-800 text-surface-0 hover:bg-surface-700"
                    onClick={() => onApprove(req.id)}
                  >
                    Approve
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}