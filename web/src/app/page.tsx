"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SherlockHeader } from "@/components/sherlock-header";
import { CaseForm } from "@/components/case-form";
import { CaseSidebar } from "@/components/case-sidebar";
import { TraceTimeline } from "@/components/trace-timeline";
import { BriefingCard } from "@/components/briefing-card";
import { useInvestigation } from "@/hooks/use-investigation";
import type { CaseFormInput, CaseState } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Home() {
  const { status, trace, caseState, error, startInvestigation, cancel } = useInvestigation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [historicalCase, setHistoricalCase] = useState<CaseState | null>(null);
  const didRefresh = useRef(false);

  const handleSubmit = useCallback(
    (input: CaseFormInput) => {
      setHistoricalCase(null);
      didRefresh.current = false;
      startInvestigation(input);
    },
    [startInvestigation],
  );

  const handleSelectCase = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}`);
      if (res.ok) {
        const data = await res.json();
        setHistoricalCase({
          case: { case_id: caseId } as CaseState["case"],
          evidence: data.evidence ?? [],
          trace: data.traces ?? [],
          briefing: data.briefing ?? null,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Refresh sidebar when investigation completes
  useEffect(() => {
    if (status === "complete" && !historicalCase && !didRefresh.current) {
      didRefresh.current = true;
      setRefreshKey((k) => k + 1);
    }
  }, [status, historicalCase]);

  // Use historical case or live case
  const displayCase = historicalCase ?? caseState;
  const displayTrace = historicalCase ? historicalCase.trace : trace;
  const displayStatus = historicalCase ? "complete" as const : status;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <SherlockHeader />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-[360px] shrink-0 border-r border-border/50 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <CaseForm onSubmit={handleSubmit} isDisabled={status === "running"} />
            <CaseSidebar onSelectCase={handleSelectCase} refreshKey={refreshKey} />
          </div>
        </aside>

        {/* Right Panel */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {displayStatus === "idle" && displayTrace.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-foreground">Ready to Investigate</h2>
                <p className="text-sm text-muted-foreground">
                  Fill in the subject details on the left and click Investigate to begin.
                  Each agent&apos;s work will be shown here in real-time.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Error */}
              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Trace Timeline */}
              {displayTrace.length > 0 && (
                <TraceTimeline events={displayTrace} status={displayStatus} />
              )}

              {/* Briefing */}
              {displayCase?.briefing && (
                <BriefingCard
                  briefing={displayCase.briefing}
                  evidence={displayCase.evidence}
                />
              )}

              {/* Cancel button while running */}
              {status === "running" && (
                <button
                  onClick={cancel}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel investigation
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
