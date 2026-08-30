"use client";

import { useState } from "react";
import {
  EVIDENCE_TYPE_LABELS,
  SOURCE_CATALOG_LABELS,
  DEFAULT_SOURCE_CATALOG,
} from "@/lib/contracts/types";
import type { SourceCatalog } from "@/lib/contracts/types";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type EvidenceTypeValue =
  | "DOCUMENT"
  | "RECORD"
  | "TESTIMONY"
  | "PHYSICAL"
  | "DIGITAL"
  | "FINANCIAL"
  | "COMMUNICATION"
  | "OTHER";

export interface EvidenceMetadata {
  sourceName: string;
  sourceDescription: string;
  evidenceType: EvidenceTypeValue;
  sourceCatalog: SourceCatalog;
  evidenceTitle: string;
  evidenceDescription: string;
  observedAt: string;
  notes: string;
}

interface EvidenceMetadataFormProps {
  readonly initial?: Partial<EvidenceMetadata>;
  readonly onSubmit: (metadata: EvidenceMetadata) => void;
  readonly onCancel: () => void;
}

const INITIAL: EvidenceMetadata = {
  sourceName: "",
  sourceDescription: "",
  evidenceType: "DOCUMENT",
  sourceCatalog: DEFAULT_SOURCE_CATALOG,
  evidenceTitle: "",
  evidenceDescription: "",
  observedAt: "",
  notes: "",
};

const EVIDENCE_TYPE_OPTIONS = Object.entries(EVIDENCE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const SOURCE_CATALOG_OPTIONS = Object.entries(SOURCE_CATALOG_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function EvidenceMetadataForm({
  initial,
  onSubmit,
  onCancel,
}: EvidenceMetadataFormProps) {
  const [form, setForm] = useState<EvidenceMetadata>({
    ...INITIAL,
    ...initial,
  });

  const set = (field: keyof EvidenceMetadata, value: string) =>
    setForm((prev) => ({
      ...prev,
      [field]:
        field === "evidenceType"
          ? (value as EvidenceTypeValue)
          : field === "sourceCatalog"
            ? (value as SourceCatalog)
            : value,
    }));

  const canSubmit = form.sourceName.trim() && form.evidenceTitle.trim();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-surface-800">Evidence Context</h3>
        <p className="mt-1 text-xs text-surface-500">
          Provide context about where this evidence came from and what it contains.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Source / Origin *"
          type="text"
          value={form.sourceName}
          onChange={(e) => set("sourceName", e.target.value)}
          placeholder="e.g. CDR export from Telecom A"
        />
        <Select
          label="Evidence Type *"
          value={form.evidenceType}
          onChange={(e) => set("evidenceType", e.target.value)}
          options={EVIDENCE_TYPE_OPTIONS}
        />
      </div>

      <Select
        label="Source Catalog"
        value={form.sourceCatalog}
        onChange={(e) => set("sourceCatalog", e.target.value)}
        options={SOURCE_CATALOG_OPTIONS}
      />

      <Input
        label="Evidence Title *"
        type="text"
        value={form.evidenceTitle}
        onChange={(e) => set("evidenceTitle", e.target.value)}
        placeholder="e.g. Call records for suspect phone number"
      />

      <Textarea
        label="Source Description"
        value={form.sourceDescription}
        onChange={(e) => set("sourceDescription", e.target.value)}
        placeholder="Describe the source origin, provider, or context..."
        rows={2}
      />

      <Textarea
        label="Evidence Description"
        value={form.evidenceDescription}
        onChange={(e) => set("evidenceDescription", e.target.value)}
        placeholder="Describe what this evidence contains or shows..."
        rows={2}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Relevant Date"
          type="date"
          value={form.observedAt}
          onChange={(e) => set("observedAt", e.target.value)}
        />
        <Input
          label="Notes"
          type="text"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Any additional notes..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(form)} disabled={!canSubmit}>
          Next: Select Files
        </Button>
      </div>
    </div>
  );
}
