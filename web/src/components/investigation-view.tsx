"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, FileText, AlertTriangle, List, Users } from "lucide-react";
import { PhaseIndicator } from "@/components/phase-indicator";
import { InvestigationSteps } from "@/components/investigation-steps";
import { SourcePills } from "@/components/source-pills";
import { BriefingReport } from "@/components/briefing-card";
import { TraceTimeline } from "@/components/trace-timeline";
import { EvidenceList } from "@/components/evidence-list";
import { GapsSection } from "@/components/gaps-section";
import type { InvestigationStatus, InvestigationPhase, SourceHit } from "@/hooks/use-investigation";
import type { TraceEvent, CaseState, CandidateReport } from "@/lib/types";

interface InvestigationViewProps {
  status: InvestigationStatus;
  phase: InvestigationPhase;
  trace: TraceEvent[];
  caseState: CaseState | null;
  error: string | null;
  sourcesFound: SourceHit[];
  evidenceCount: number;
  subjectName: string;
  onCancel: () => void;
}

interface CollapsibleSectionProps {
  label: string;
  count: number;
  icon: typeof FileText;
  children: React.ReactNode;
}

function CollapsibleSection({ label, count, icon: Icon, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 text-base text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
      >
        <Icon className="h-4 w-4" />
        <span className="font-medium">{label}</span>
        <span className="text-sm">({count})</span>
        <ChevronRight
          className={`h-4 w-4 ml-auto transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CandidateReportSummary({ report }: { report: CandidateReport }) {
  return (
    <div className="space-y-2">
      {report.candidates.map((c, i) => (
        <div key={c.candidate_id} className="p-2.5 rounded-md bg-secondary/30 border border-border/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-foreground/90">#{i + 1}</span>
            <span className="text-xs text-foreground/80">{c.label}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {Math.round(c.confidence * 100)}% · {c.evidence_count} evidence
            </span>
          </div>
          <p className="text-xs text-foreground/60">{c.summary}</p>
        </div>
      ))}
    </div>
  );
}

function IdleState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sherlock-logo.svg" alt="" width={128} height={128} className="mx-auto opacity-25" />
        <h2 className="text-xl font-semibold text-foreground">Who should we investigate today?</h2>
        <p className="text-base text-muted-foreground">
          Fill in the subject details on the left and click Investigate to begin.
          Each agent&apos;s work will be shown here in real-time.
        </p>
      </div>
    </div>
  );
}

export function InvestigationView({
  status,
  phase,
  trace,
  caseState,
  error,
  sourcesFound,
  evidenceCount,
  subjectName,
  onCancel,
}: InvestigationViewProps) {
  if (status === "idle" && trace.length === 0) {
    return <IdleState />;
  }

  const briefing = caseState?.briefing ?? null;
  const evidence = caseState?.evidence ?? [];
  const gaps = briefing?.gaps ?? [];
  const isComplete = status === "complete" && briefing !== null;
  const displayCandidateReport = caseState?.candidateReport ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-md bg-red-500/10 border border-red-500/20 text-base text-red-400"
          >
            {error}
          </motion.div>
        )}

        {/* Running state: phase indicator + source pills */}
        {status === "running" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-5"
          >
            <PhaseIndicator
              phase={phase}
              subjectName={subjectName}
              sourcesCount={sourcesFound.length}
              evidenceCount={evidenceCount}
              trace={trace}
            />
            <InvestigationSteps trace={trace} status={status} />
            <SourcePills sources={sourcesFound} />
            <button
              onClick={onCancel}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel investigation
            </button>
          </motion.div>
        )}

        {/* Complete state: briefing report + collapsible details */}
        {isComplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <BriefingReport briefing={briefing} candidates={displayCandidateReport?.candidates} />

            {/* Collapsible detail sections */}
            <div className="space-y-2 pt-2">
              {evidence.length > 0 && (
                <CollapsibleSection label="View sources" count={evidence.length} icon={FileText}>
                  <EvidenceList evidence={evidence} />
                </CollapsibleSection>
              )}

              {gaps.length > 0 && (
                <CollapsibleSection label="View gaps" count={gaps.length} icon={AlertTriangle}>
                  <GapsSection gaps={gaps} />
                </CollapsibleSection>
              )}

              {displayCandidateReport && displayCandidateReport.candidates.length > 1 && (
                <CollapsibleSection label="View candidate analysis" count={displayCandidateReport.candidates.length} icon={Users}>
                  <CandidateReportSummary report={displayCandidateReport} />
                </CollapsibleSection>
              )}

              {trace.length > 0 && (
                <CollapsibleSection label="View investigation trace" count={trace.length} icon={List}>
                  <TraceTimeline events={trace} />
                </CollapsibleSection>
              )}
            </div>
          </motion.div>
        )}

        {/* Error complete (no briefing but complete) */}
        {status === "complete" && !briefing && trace.length > 0 && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-base text-amber-400">
              Investigation completed but no briefing was generated.
            </div>
            <CollapsibleSection label="View investigation trace" count={trace.length} icon={List}>
              <TraceTimeline events={trace} />
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}
