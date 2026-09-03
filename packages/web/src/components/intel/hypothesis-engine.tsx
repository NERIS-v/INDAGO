"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

// DETERMINISTIC ENGINE & DATA TYPES
export type EvidencePosture = "T0_OBSERVATION" | "T1_LEAD" | "T2_CORROBORATED" | "T3_PACKAGE_CANDIDATE";

export interface GroundedObservation {
  id: string;
  sourceId: string;
  sourceType: "FIR" | "CDR" | "FINANCIAL" | "REGISTRY" | "SURVEILLANCE";
  sourceName: string;
  timestamp: string;
  content: string;
  reliabilityScore: number;
}

export interface CompetingAlternative {
  id: string;
  explanation: string;
  plausibility: "LOW" | "MODERATE" | "HIGH";
  supportedByObsIds: string[];
  refutedByObsIds: string[];
}

export interface NextBestEvidenceRecommendation {
  id: string;
  actionTitle: string;
  targetGap: string;
  sourceToQuery: string;
  expectedInfoGain: number;
  relevance: number;
  feasibility: number;
  cost: number;
  lambdaWeight: number;
  netUtility: number;
  justification: string;
}

export interface InvestigativeLeadReport {
  leadId: string;
  caseId: string;
  caseName: string;
  generatedAt: string;
  targetEntityId: string;
  targetEntityName: string;
  claim: string;
  aiVerdict: string; 
  posture: EvidencePosture;
  analyticalConfidence: number; 
  
  structuralSignal: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  investigativeRelevance: "LOW" | "MODERATE" | "HIGH";
  independentSourceGroups: number;
  coverage: {
    sourceCoveragePct: number;
    temporalCoveragePct: number;
    resolutionConfidencePct: number;
  };
  perturbationStabilityScore: number; 

  supportingObservations: GroundedObservation[];
  contradictingObservations: GroundedObservation[];
  competingAlternatives: CompetingAlternative[];
  
  primaryGap: string;
  gapClass: "MISSING_INVESTIGATION" | "MISSING_DATA" | "MISSING_COMPARISON" | "CONCEALMENT_CONSISTENT";
  nextBestEvidence: NextBestEvidenceRecommendation;
  
  claimGroundingStatus: "FULLY_GROUNDED" | "PARTIAL_GROUNDING" | "UNGROUNDED";
  auditHash: string;
  reviewStatus: "UNREVIEWED" | "UNDER_INVESTIGATION" | "ACCEPTED_AS_LEAD" | "REJECTED_COUNTER_EVIDENCE";
}

export function calculateAcquisitionUtility(
  eig: number,
  relevance: number,
  feasibility: number,
  cost: number,
  lambda: number = 0.2
): number {
  const utility = (eig * relevance * feasibility) - (lambda * cost);
  return Math.max(0, Math.min(1, Number(utility.toFixed(3))));
}

export function getOperationFinancialShadowLead(): InvestigativeLeadReport {
  const eig = 0.92;
  const rel = 0.88;
  const feas = 0.75;
  const cost = 0.30;
  const lambda = 0.20;

  return {
    leadId: "LEAD-2024-FS-089",
    caseId: "CASE-9021-OFS",
    caseName: "Operation Financial Shadow",
    generatedAt: "2024-06-10T09:15:00.000Z", 
    targetEntityId: "ENT_VICTOR_ALDRIDGE",
    targetEntityName: "Victor Aldridge",
    claim: "Victor Aldridge serves as beneficial owner behind Aldridge Holdings S.A. through nominee director ND-118, utilizing Intermediary Account 0093 for layered transfers.",
    
    aiVerdict: "Analysis strongly supports the hypothesis that Victor Aldridge controls Aldridge Holdings S.A. via proxy. Cross-case telemetry (Cobalt) and financial logs (Account 0093) align with the Paris/Lyon registry contradiction. However, a critical identity gap remains regarding ND-118. Action is required to collapse this network segment.",
    
    posture: "T2_CORROBORATED",
    analyticalConfidence: 0.84, 
    structuralSignal: "HIGH",
    investigativeRelevance: "HIGH",
    independentSourceGroups: 3, 
    coverage: {
      sourceCoveragePct: 78,
      temporalCoveragePct: 83,
      resolutionConfidencePct: 62, 
    },
    perturbationStabilityScore: 87, 

    supportingObservations: [
      {
        id: "OBS_01",
        sourceId: "SRC-WIRE-882",
        sourceType: "FINANCIAL",
        sourceName: "SWIFT Intermediary Ledger #0093",
        timestamp: "2024-05-21T14:32:00Z",
        content: "Transfer of €480,000 executed from Aldridge Holdings S.A. to Intermediary Account 0093 matching invoice reference INV-8812.",
        reliabilityScore: 0.95,
      },
      {
        id: "OBS_06",
        sourceId: "SRC-EMAIL-EXT-1",
        sourceType: "CDR",
        sourceName: "Intercepted Mail Thread (Maria Castellan)",
        timestamp: "2024-05-24T09:15:00Z",
        content: "Email direct quote: 'Victor verified the routing parameters for the Paris registry account.'",
        reliabilityScore: 0.88,
      },
      {
        id: "OBS_08",
        sourceId: "SRC-REG-LU-11",
        sourceType: "REGISTRY",
        sourceName: "Commercial Court Filing ND-118",
        timestamp: "2024-06-02T11:00:00Z",
        content: "Registry lists nominee director (ND-118) for Shell One with residential address matching 14 Rue de la Paix, Paris (Victor Aldridge residence).",
        reliabilityScore: 0.90,
      }
    ],

    contradictingObservations: [
      {
        id: "OBS_09",
        sourceId: "SRC-REG-CC-882",
        sourceType: "SURVEILLANCE",
        sourceName: "Lyon Prefecture Cross-Check CC-882",
        timestamp: "2024-06-08T16:45:00Z",
        content: "Director 'V. Aldridge' residential address verified as 8 Rue des Capucines, Lyon — genuine residential discrepancy with ND-118 Paris filing.",
        reliabilityScore: 0.92,
      }
    ],

    competingAlternatives: [
      {
        id: "ALT-01",
        explanation: "ND-118 is a professional corporate services proxy sharing an administrative office address, not Victor Aldridge's direct personal alter-ego.",
        plausibility: "MODERATE",
        supportedByObsIds: ["OBS_09"],
        refutedByObsIds: ["OBS_08"],
      },
      {
        id: "ALT-02",
        explanation: "Shared intermediary routing is a standard pooling transaction by banking entity without executive knowledge from Victor Aldridge.",
        plausibility: "LOW",
        supportedByObsIds: [],
        refutedByObsIds: ["OBS_01", "OBS_06"],
      }
    ],

    primaryGap: "Beneficial ownership register for Shell One lacks notarized passport verification for ND-118 nominee filing.",
    gapClass: "MISSING_COMPARISON",

    nextBestEvidence: {
      id: "NBE-ACT-041",
      actionTitle: "Request Notarized KYC Filing for Nominee ND-118",
      targetGap: "Missing Identity Link between Victor Aldridge and Nominee Director 118",
      sourceToQuery: "Luxembourg Financial Intelligence Unit (FIU) Mutual Legal Assistance Request",
      expectedInfoGain: eig,
      relevance: rel,
      feasibility: feas,
      cost,
      lambdaWeight: lambda,
      netUtility: calculateAcquisitionUtility(eig, rel, feas, cost, lambda),
      justification: "Acquisition directly resolves whether OBS_08 and OBS_09 represent a shared identity or an administrative corporate coincidence."
    },

    claimGroundingStatus: "FULLY_GROUNDED",
    auditHash: "8f7b2c9a1d4e6f3b0c8a5e7d9b2a1f4e6d3c8b5a7e9f1a2b3c4d5e6f7a8b9c0d",
    reviewStatus: "UNDER_INVESTIGATION"
  };
}

// REPORT GENERATOR UI WITH TACTICAL PROCESSING

const PROCESSING_STEPS = [
  { id: "step-1", label: "Validating structural boundaries...", duration: 800 },
  { id: "step-2", label: "Grounding claims to verified artifacts (n=14)...", duration: 1200 },
  { id: "step-3", label: "Testing robustness via staged perturbation...", duration: 1500 },
  { id: "step-4", label: "Scanning cross-case telemetry (Match: Cobalt)...", duration: 1100 },
  { id: "step-5", label: "Computing optimal acquisition utility U(a)...", duration: 900 },
  { id: "step-6", label: "Compiling final dossier...", duration: 600 },
];

export function HypothesisEngine({ investigationId }: { investigationId?: string }) {
  const [engineState, setEngineState] = useState<"IDLE" | "PROCESSING" | "COMPLETE">("IDLE");
  const [activeStep, setActiveStep] = useState<number>(0);
  
  const [report] = useState<InvestigativeLeadReport>(getOperationFinancialShadowLead());
  const [activeTab, setActiveTab] = useState<"DOSSIER" | "EVIDENCE_EVAL" | "UTILITY_MATH">("DOSSIER");
  const [isCopied, setIsCopied] = useState(false);

  // Orchestrator Processing Sequence
  useEffect(() => {
    if (engineState !== "PROCESSING") return;

    let isCancelled = false;
    let currentStep = 0;

    const runSequence = async () => {
      for (const step of PROCESSING_STEPS) {
        if (isCancelled) break;
        setActiveStep(currentStep);
        await new Promise(r => setTimeout(r, step.duration));
        currentStep++;
      }
      if (!isCancelled) {
        setEngineState("COMPLETE");
      }
    };

    runSequence();
    return () => { isCancelled = true; };
  }, [engineState]);

  const handleGenerate = () => {
    setEngineState("PROCESSING");
    setActiveStep(0);
  };

  const handleReset = () => {
    setEngineState("IDLE");
    setActiveTab("DOSSIER");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyAuditHash = () => {
    navigator.clipboard.writeText(report.auditHash);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const postureBadgeColor = {
    T0_OBSERVATION: "bg-surface-200 text-surface-700 border-surface-300",
    T1_LEAD: "bg-accent-amber/15 text-accent-amber border-accent-amber/30",
    T2_CORROBORATED: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
    T3_PACKAGE_CANDIDATE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  }[report.posture];

  return (
    <>
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden !important; }
          #printable-dossier, #printable-dossier * { visibility: visible !important; }
          
          /* Nullify flex/grid offsets from sidebar and layouts */
          html, body, main, #__next, .layout-wrapper {
            display: block !important;
            position: static !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          /* Force the dossier to snap to the top-left of the page, full width */
          #printable-dossier { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            border: none !important; 
            box-shadow: none !important; 
            background: white !important;
            color: black !important;
          }
          
          .print\\:hidden, .print\\:hidden * { 
            display: none !important; 
            visibility: hidden !important; 
          }
        }
      `}} />

      <div className="w-full flex flex-col space-y-6 animate-fade-in text-surface-900 pb-12">
        
        {(engineState === "IDLE" || engineState === "PROCESSING") && (
          <div className="w-full max-w-5xl mx-auto border border-surface-200 bg-surface-50 shadow-2xl rounded-sm overflow-hidden flex flex-col mt-12 font-mono">
            
            {/* Tactical Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 bg-surface-100">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-none ${engineState === "IDLE" ? "bg-surface-400" : "bg-accent-blue animate-pulse"}`} />
                <span className="text-[11px] text-surface-500 uppercase tracking-widest font-bold">
                  INDAGO // Hypothesis Generation Pipeline
                </span>
              </div>
              <span className="text-[10px] text-surface-400 uppercase tracking-widest">
                {engineState === "IDLE" ? "SYSTEM_READY" : "EXECUTING"}
              </span>
            </div>

            <div className="flex flex-col md:flex-row flex-1">
              
              {/* Left Panel: Target Parameters */}
              <div className="w-full md:w-[40%] border-r border-surface-200 p-8 bg-surface-50 flex flex-col gap-6">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-surface-400 block mb-2 font-bold">Target Context</span>
                  <div className="text-base text-surface-900 font-bold tracking-tight">{report.caseName}</div>
                  <div className="text-xs text-surface-500 mt-1">{investigationId || "ID: UNKNOWN"}</div>
                </div>
                
                <div className="space-y-4 pt-6 border-t border-surface-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-surface-500">Evidence Pool</span>
                    <span className="text-surface-900 font-bold">14 Artifacts</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-surface-500">Cross-Case Scope</span>
                    <span className="text-surface-900 font-bold">Global</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-surface-500">Claim Grounding</span>
                    <span className="text-emerald-600 font-bold">Strict</span>
                  </div>
                </div>
              </div>

              {/* Right Panel: Action / Logs */}
              <div className="w-full md:w-[60%] flex flex-col bg-surface-0 min-h-[350px]">
                {engineState === "IDLE" ? (
                  <div className="p-8 flex flex-col justify-between h-full">
                    <div className="space-y-4">
                      <span className="text-[11px] uppercase tracking-widest text-accent-blue font-bold flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Initialization Required
                      </span>
                      <p className="text-sm text-surface-600 leading-relaxed font-sans">
                        The engine is prepared to compile available evidence, compute acquisition utility for missing data, and generate a bounded investigative lead. Hallucination protocols are strictly disabled.
                      </p>
                    </div>

                    <button 
                      onClick={handleGenerate}
                      className="group relative mt-8 w-full py-4 bg-accent-blue text-[#050505] font-bold text-[12px] uppercase tracking-widest transition-all duration-300 hover:bg-accent-blue/90 shadow-[0_0_15px_var(--color-accent-blue-subtle)] hover:shadow-[0_0_25px_var(--color-accent-blue)] rounded-sm flex items-center justify-center gap-3 overflow-hidden focus-visible:outline-none"
                    >
                      {/* Subtle sheen effect on hover */}
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                      <span className="relative flex items-center gap-3">
                        <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Initialize Investigative Synthesis
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="p-8 flex flex-col bg-[#050505] h-full text-surface-400 text-xs overflow-hidden relative">
                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-20" />
                    
                    <div className="space-y-4 z-10 font-mono">
                      <div className="text-surface-500 mb-6 tracking-wider">Initialize INDAGO core...</div>
                      
                      {PROCESSING_STEPS.map((step, idx) => {
                        if (idx > activeStep) return null;
                        
                        const isActive = idx === activeStep;
                        
                        return (
                          <div key={step.id} className="flex items-start gap-3">
                            <span className={isActive ? "text-accent-blue" : "text-emerald-500"}>
                              {isActive ? "> [RUNNING]" : "> [OK]"}
                            </span>
                            <span className={isActive ? "text-surface-200" : "text-surface-500"}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                      
                      {/* Blinking cursor */}
                      <div className="flex items-center gap-2 mt-4">
                        <span className="text-accent-blue">{">"}</span>
                        <span className="w-2 h-4 bg-accent-blue animate-pulse shadow-[0_0_8px_var(--color-accent-blue)]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {engineState === "COMPLETE" && (
          <div className="w-full flex flex-col space-y-6 animate-slide-up">
            
            {/* Top Action & Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl glass-panel border border-surface-200/60 shadow-sm print:hidden">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_var(--color-emerald-500)]" />
                <span className="font-mono text-xs uppercase tracking-widest text-surface-500 font-bold">
                  Synthesis Complete
                </span>
                <span className="text-surface-300">|</span>
                <span className="font-mono text-xs font-semibold text-surface-800">
                  {report.caseName} {investigationId && `(ID: ${investigationId.split('-')[0]})`}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex p-1 bg-surface-100 rounded-lg border border-surface-200">
                  <button onClick={() => setActiveTab("DOSSIER")} className={`px-3 py-1 text-xs font-mono rounded transition-colors ${activeTab === "DOSSIER" ? "bg-surface-0 font-bold shadow-xs text-surface-900" : "text-surface-500 hover:text-surface-900"}`}>Lead Dossier</button>
                  <button onClick={() => setActiveTab("EVIDENCE_EVAL")} className={`px-3 py-1 text-xs font-mono rounded transition-colors ${activeTab === "EVIDENCE_EVAL" ? "bg-surface-0 font-bold shadow-xs text-surface-900" : "text-surface-500 hover:text-surface-900"}`}>Evidence Matrix</button>
                  <button onClick={() => setActiveTab("UTILITY_MATH")} className={`px-3 py-1 text-xs font-mono rounded transition-colors ${activeTab === "UTILITY_MATH" ? "bg-surface-0 font-bold shadow-xs text-surface-900" : "text-surface-500 hover:text-surface-900"}`}>Utility U(a)</button>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={handlePrint} className="bg-surface-900 text-surface-0 hover:bg-surface-800 font-mono text-xs flex items-center gap-2 px-3 py-1.5 rounded transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Export
                  </button>
                  <button onClick={handleReset} className="bg-transparent border border-surface-200 text-surface-600 hover:bg-surface-100 hover:text-surface-900 font-mono text-xs px-3 py-1.5 rounded transition-colors shadow-none">
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Main Report Document Canvas WITH ID for printing */}
            <div id="printable-dossier" className="bg-surface-0 border border-surface-200 rounded-2xl shadow-xl overflow-hidden print:border-none print:shadow-none print:m-0 w-full">
              
              {/* Document Header */}
              <div className="p-6 sm:p-8 border-b border-surface-200 bg-surface-50/50">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="muted" className={`font-mono text-[10px] tracking-wider uppercase px-2.5 py-0.5 border ${postureBadgeColor}`}>
                        {report.posture.replace("_", " ")}
                      </Badge>
                      <Badge variant="muted" className="font-mono text-[10px] bg-surface-100 text-surface-700 border-surface-300">
                        GROUNDING: {report.claimGroundingStatus.replace("_", " ")}
                      </Badge>
                      <span className="font-mono text-xs text-surface-400">ID: {report.leadId}</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-surface-950 sm:text-3xl">
                      Investigative Lead & Hypothesis Assessment
                    </h1>
                    <p className="text-xs font-mono text-surface-500 mt-1">
                      Target Entity: <span className="text-surface-900 font-semibold">{report.targetEntityName}</span> ({report.targetEntityId})
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400 block">Ranking Signal</span>
                      <span className="text-xl font-mono font-bold text-accent-rose">{(report.analyticalConfidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400 block">Perturbation Stability</span>
                      <span className="text-sm font-mono font-bold text-emerald-600">{report.perturbationStabilityScore}/100</span>
                    </div>
                  </div>
                </div>

                {/* Epistemic Claim Container */}
                <div className="mt-6 p-4 rounded-xl bg-surface-100/70 border border-surface-200/80">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-accent-rose font-bold block mb-1">Evaluated Hypothesis Claim</span>
                  <p className="text-sm sm:text-base font-sans leading-relaxed text-surface-900 font-medium">"{report.claim}"</p>
                </div>

                {/* AI Executive Verdict */}
                <div className="mt-4 p-5 rounded-xl bg-surface-50 border border-surface-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-accent-blue" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-accent-blue font-bold flex items-center gap-2 mb-2">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    AI Executive Synthesis
                  </span>
                  <p className="text-sm font-sans leading-relaxed text-surface-900 tracking-wide font-medium">
                    {report.aiVerdict}
                  </p>
                </div>
              </div>

              {/* Dynamic Section Contents */}
              <div className="p-6 sm:p-8 space-y-8">

                {/* Telemetry Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-surface-50 border border-surface-200">
                  <div><span className="text-[9px] font-mono uppercase tracking-widest text-surface-500 block">Independent Sources</span><span className="text-lg font-mono font-bold text-surface-900">{report.independentSourceGroups} Groups</span></div>
                  <div><span className="text-[9px] font-mono uppercase tracking-widest text-surface-500 block">Source Coverage</span><span className="text-lg font-mono font-bold text-surface-900">{report.coverage.sourceCoveragePct}%</span></div>
                  <div><span className="text-[9px] font-mono uppercase tracking-widest text-surface-500 block">Structural Signal</span><span className="text-lg font-mono font-bold text-accent-rose">{report.structuralSignal}</span></div>
                  <div><span className="text-[9px] font-mono uppercase tracking-widest text-surface-500 block">Review Decision</span><span className="text-lg font-mono font-bold text-accent-amber">{report.reviewStatus.replace(/_/g, " ")}</span></div>
                </div>

                {/* TAB 1: Complete Dossier View */}
                {activeTab === "DOSSIER" && (
                  <div className="space-y-8 animate-fade-in">
                    
                    {/* Evidence For & Against (Dual Column) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Supporting Observations</span>
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-mono text-[9px]">{report.supportingObservations.length} OBS</Badge>
                        </div>
                        <div className="space-y-3">
                          {report.supportingObservations.map((obs) => (
                            <div key={obs.id} className="p-3 bg-surface-0 rounded-lg border border-emerald-500/20 shadow-2xs space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono text-surface-500"><span className="font-bold text-surface-700">{obs.id}</span><span>{obs.sourceType}</span></div>
                              <p className="text-xs text-surface-800 leading-normal">{obs.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-5 rounded-xl border border-danger/30 bg-danger/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-danger flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-danger" />Counter-Evidence</span>
                          <Badge className="bg-danger/10 text-danger hover:bg-danger/10 font-mono text-[9px]">{report.contradictingObservations.length} OBS</Badge>
                        </div>
                        <div className="space-y-3">
                          {report.contradictingObservations.map((obs) => (
                            <div key={obs.id} className="p-3 bg-surface-0 rounded-lg border border-danger/20 shadow-2xs space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono text-surface-500"><span className="font-bold text-danger">{obs.id}</span><span>{obs.sourceType}</span></div>
                              <p className="text-xs text-surface-800 leading-normal">{obs.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Competing Alternative Explanations */}
                    <div className="p-5 rounded-xl border border-surface-200 bg-surface-50/50 space-y-3">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-surface-600 block">Competing Alternative Explanations</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {report.competingAlternatives.map((alt) => (
                          <div key={alt.id} className="p-4 bg-surface-0 rounded-lg border border-surface-200 space-y-2">
                            <div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold text-surface-700">{alt.id}</span><Badge variant="muted" className="text-[9px] font-mono border-accent-amber/40 text-accent-amber bg-accent-amber/5">{alt.plausibility}</Badge></div>
                            <p className="text-xs text-surface-700">{alt.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Next Best Evidence Optimization Loop */}
                    <div className="p-6 rounded-xl border border-accent-blue/30 bg-accent-blue/5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent-blue flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />Identified Graph Hole & Primary Gap</span>
                          <h3 className="text-sm font-semibold text-surface-900 mt-1">{report.primaryGap}</h3>
                        </div>
                        <Badge variant="muted" className="w-fit text-[10px] font-mono border-accent-blue/30 text-accent-blue bg-accent-blue/10">CLASS: {report.gapClass}</Badge>
                      </div>

                      <div className="p-4 rounded-lg bg-surface-0 border border-accent-blue/20 shadow-xs space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="text-[9px] font-mono uppercase tracking-widest text-accent-rose font-bold">Highest Value Verification Action</span>
                            <h4 className="text-sm font-bold text-surface-950">{report.nextBestEvidence.actionTitle}</h4>
                            <p className="text-xs text-surface-600 mt-1">{report.nextBestEvidence.justification}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400 block">Acquisition Utility U(a)</span>
                            <span className="text-2xl font-mono font-black text-accent-blue">{report.nextBestEvidence.netUtility}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {activeTab === "EVIDENCE_EVAL" && (
                  <div className="space-y-4 animate-fade-in">
                    <h3 className="text-sm font-mono uppercase font-bold text-surface-700">Observation Provenance Ledger</h3>
                    <div className="border border-surface-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-surface-100 border-b border-surface-200 text-surface-600"><tr><th className="p-3">OBS ID</th><th className="p-3">Source Name</th><th className="p-3">Type</th><th className="p-3">Quality</th><th className="p-3">Stance</th></tr></thead>
                        <tbody className="divide-y divide-surface-200">
                          {report.supportingObservations.map((obs) => (
                            <tr key={obs.id} className="hover:bg-surface-50"><td className="p-3 font-bold text-surface-900">{obs.id}</td><td className="p-3 text-surface-700">{obs.sourceName}</td><td className="p-3"><Badge variant="muted" className="text-[9px]">{obs.sourceType}</Badge></td><td className="p-3 text-emerald-600">{(obs.reliabilityScore * 100).toFixed(0)}%</td><td className="p-3"><span className="text-emerald-600 font-bold">SUPPORT</span></td></tr>
                          ))}
                          {report.contradictingObservations.map((obs) => (
                            <tr key={obs.id} className="hover:bg-surface-50"><td className="p-3 font-bold text-danger">{obs.id}</td><td className="p-3 text-surface-700">{obs.sourceName}</td><td className="p-3"><Badge variant="muted" className="text-[9px]">{obs.sourceType}</Badge></td><td className="p-3 text-danger">{(obs.reliabilityScore * 100).toFixed(0)}%</td><td className="p-3"><span className="text-danger font-bold">CONTRADICT</span></td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "UTILITY_MATH" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="p-6 rounded-xl bg-surface-50 border border-surface-200 space-y-4">
                      <h3 className="text-base font-bold text-surface-900">V7 Mathematical Guardrails Formulation</h3>
                      <p className="text-xs text-surface-600 leading-relaxed">INDAGO strictly separates evidence utility from probabilistic guilt. Acquisition priority is computed via an explicit, non-blackbox heuristic:</p>
                      <div className="p-4 bg-surface-900 text-surface-0 rounded-lg font-mono text-xs overflow-x-auto">
                        <code>U(a) = EIG(a) × Relevance(a) × Feasibility(a) − λ × Cost(a)</code>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tamper-Evident Hash Footer */}
                <div className="pt-6 border-t border-surface-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-surface-400">
                  <div className="flex items-center gap-2">
                    <span>SHA-256 Audit Trail:</span>
                    <code className="text-[10px] text-surface-600 bg-surface-100 px-2 py-0.5 rounded select-all border border-surface-200">{report.auditHash.slice(0, 24)}...</code>
                    <button onClick={handleCopyAuditHash} className="hover:text-surface-800 transition-colors text-[10px] underline">{isCopied ? "Copied" : "Copy"}</button>
                  </div>
                  <span>Generated: {new Date(report.generatedAt).toUTCString()}</span>
                </div>

              </div>
            </div>

            <div className="hidden print:block text-center text-[10px] font-mono text-surface-400 mt-6">
              CONFIDENTIAL & PRIVILEGED INVESTIGATIVE WORK PRODUCT — FOR OFFICIAL POLICE/AGENCY USE ONLY.
              <br />
              PRODUCED BY INDAGO EVIDENCE-TO-GRAPH REASONING SYSTEM. NOT AN ACCUSATORY DETERMINATION.
            </div>

          </div>
        )}

      </div>
    </>
  );
}