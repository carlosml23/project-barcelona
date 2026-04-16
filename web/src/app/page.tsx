"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SherlockHeader } from "@/components/sherlock-header";
import { CaseForm } from "@/components/case-form";
import { CaseSidebar } from "@/components/case-sidebar";
import { InvestigationView } from "@/components/investigation-view";
import { useInvestigation } from "@/hooks/use-investigation";
import type { CaseFormInput, CaseState } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Home() {
  const {
    status,
    phase,
    trace,
    caseState,
    error,
    sourcesFound,
    evidenceCount,
    startInvestigation,
    cancel,
  } = useInvestigation();

  const [refreshKey, setRefreshKey] = useState(0);
  const [historicalCase, setHistoricalCase] = useState<CaseState | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const didRefresh = useRef(false);

  const handleSubmit = useCallback(
    (input: CaseFormInput) => {
      setHistoricalCase(null);
      setSubjectName(input.full_name);
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
          candidateReport: data.candidateReport ?? null,
        });
        if (data.briefing?.case_id) {
          setSubjectName(data.case?.full_name ?? "Subject");
        }
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

  // Determine display values: historical or live
  const displayCase = historicalCase ?? caseState;
  const displayTrace = historicalCase ? historicalCase.trace : trace;
  const displayStatus = historicalCase ? "complete" as const : status;
  const displayPhase = historicalCase ? "complete" as const : phase;
  const displaySources = historicalCase ? [] : sourcesFound;
  const displayEvidence = historicalCase ? 0 : evidenceCount;
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <SherlockHeader />

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* Left Panel */}
        <aside className="w-[400px] shrink-0 flex flex-col overflow-hidden bg-[#d5d0bb] rounded-2xl shadow-lg">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <CaseForm onSubmit={handleSubmit} isDisabled={status === "running"} />
            <CaseSidebar onSelectCase={handleSelectCase} refreshKey={refreshKey} />
          </div>
        </aside>

        {/* Right Panel */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <InvestigationView
            status={displayStatus}
            phase={displayPhase}
            trace={displayTrace}
            caseState={displayCase}
            error={error}
            sourcesFound={displaySources}
            evidenceCount={displayEvidence}
            subjectName={subjectName}
            onCancel={cancel}
          />
        </main>
      </div>
    </div>
  );
}
