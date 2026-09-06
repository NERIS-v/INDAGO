"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

import narrativeScript from "@/lib/providers/demo/demo-fixtures/events.json";

// Import the actual UI components to render inside Judge Mode
import { GraphPanel } from "@/components/graph/graph-panel";
import { LeadDrawer } from "@/components/drawers/lead-drawer";
import { GapDrawer } from "@/components/drawers/gap-drawer";
import RobustnessPage from "../robustness/page";
import { ProcessingFilament } from "@/components/feedback/shell-animations";

export default function JudgeModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [leadVisible, setLeadVisible] = useState(false);
  const [gapVisible, setGapVisible] = useState(false);

  useEffect(() => setMounted(true), []);

  // F-PR16: the stage drawers were rendered with dead onClose={() => {}}.
  // They are now dismissible for the span of their narrative step; the
  // visibility resets whenever the narration moves between steps.
  useEffect(() => {
    const eventId = narrativeScript[currentStep]?.id;
    setLeadVisible(eventId === "narrative-05");
    setGapVisible(
      eventId === "narrative-06" ||
        eventId === "narrative-07" ||
        eventId === "narrative-08",
    );
  }, [currentStep]);

  const totalSteps = narrativeScript.length;
  const currentEvent = narrativeScript[currentStep];

  const advance = useCallback(() => {
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1);
  }, [currentStep, totalSteps]);

  const goBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  const reset = useCallback(() => {
    setCurrentStep(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "r" || e.key === "R") {
        reset();
      } else if (e.key === "Escape") {
        // Exit Judge Mode back to the active workspace
        router.push(`/investigations/${id}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, goBack, reset, router, id]);

  // Guard to ensure hydration and prevent out-of-bounds array access
  if (!mounted || !currentEvent) return null;

  // THE JUDGE STAGE: Renders the actual UI components
  const renderStage = () => {
    switch (currentEvent.id) {
      case "narrative-01":
      case "narrative-02":
      case "narrative-03":
        return (
          <div className="mt-12 flex flex-col items-center justify-center">
            <ProcessingFilament isProcessing={true} />
            <div className="h-12 w-12 rounded-full border-2 border-brand-500 border-t-transparent animate-spin opacity-50 mb-4" />
            <p className="text-surface-500 font-mono uppercase tracking-widest text-xs">
              System is extracting entities and resolving identities...
            </p>
          </div>
        );
      case "narrative-04":
        return (
          <div className="relative mt-8 w-full max-w-6xl h-[60vh] rounded-xl border border-surface-200/50 shadow-2xl overflow-hidden bg-surface-0">
            <GraphPanel activeTimeRange={null} />
          </div>
        );
      case "narrative-05":
        return (
          <div className="relative mt-8 w-full max-w-6xl h-[60vh] rounded-xl border border-surface-200/50 shadow-2xl overflow-hidden bg-surface-0">
            <GraphPanel activeTimeRange={null} />
            {leadVisible && (
              <LeadDrawer leadId="lead-victor-meridian" onClose={() => setLeadVisible(false)} />
            )}
          </div>
        );
      case "narrative-06":
      case "narrative-07":
      case "narrative-08":
        return (
          <div className="relative mt-8 w-full max-w-6xl h-[60vh] rounded-xl border border-surface-200/50 shadow-2xl overflow-hidden bg-surface-0">
            <GraphPanel activeTimeRange={null} />
            {gapVisible && (
              <GapDrawer gapId="gap-meridian-ownership" onClose={() => setGapVisible(false)} />
            )}
          </div>
        );
      case "narrative-09":
        return (
          <div className="relative mt-8 w-full max-w-6xl max-h-[60vh] overflow-y-auto rounded-xl border border-surface-200/50 bg-surface-50 shadow-2xl text-left">
            <RobustnessPage />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex flex-col bg-surface-0 animate-fade-in">
      <div className="relative flex flex-1 flex-col items-center justify-center p-12">
        {/* Background ambient lighting */}
        <div className="absolute inset-0 bg-surface-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-surface-100 to-surface-0 opacity-50 pointer-events-none" />
        
        <div className="z-10 text-center animate-fade-in w-full max-w-6xl" key={currentStep}>
          <Badge variant="muted" className="mb-4 shadow-sm">
            Step {currentStep + 1} of {totalSteps} · {currentEvent.type}
          </Badge>
          <h1 className="mb-2 text-3xl font-medium drop-shadow-lg text-surface-900">
            {currentEvent.action}
          </h1>
          <p className="mx-auto max-w-2xl text-base text-surface-500 mb-4">
            {currentEvent.description}
          </p>

          {renderStage()}
        </div>
      </div>

      {/* JUDGE NARRATION & CONTROLS FOOTER */}
      <div className="z-20 flex items-center justify-between border-t border-surface-200/50 bg-surface-50/80 px-8 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Badge variant={currentStep === totalSteps - 1 ? "success" : "warning"} dot>
            Judge Mode Live
          </Badge>
          <span className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            [Space] Advance · [←] Back · [R] Reset · [Esc] Exit
          </span>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center gap-1">
          {narrativeScript.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-normal ${
                i === currentStep 
                  ? "w-6 bg-brand-500" 
                  : i < currentStep 
                  ? "w-2 bg-surface-500" 
                  : "w-2 bg-surface-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}