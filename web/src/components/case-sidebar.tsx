"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CsvUpload } from "@/components/csv-upload";
import type { CaseRow } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type SidebarTab = "history" | "batch";

interface CaseSidebarProps {
  onSelectCase: (caseId: string) => void;
  refreshKey: number;
}

export function CaseSidebar({ onSelectCase, refreshKey }: CaseSidebarProps) {
  const [cases, setCases] = useState<(CaseRow & { inserted_at?: string })[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTab>("history");

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cases`);
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch {
      // API not available yet
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases, refreshKey]);

  const handleBatchComplete = useCallback(() => {
    fetchCases();
    setActiveTab("history");
  }, [fetchCases]);

  return (
    <div className="pt-2">
      {/* Tab toggle */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setActiveTab("history")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "bg-foreground/10 text-foreground"
              : "text-foreground/40 hover:text-foreground/70"
          }`}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab("batch")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "batch"
              ? "bg-foreground/10 text-foreground"
              : "text-foreground/40 hover:text-foreground/70"
          }`}
        >
          Batch Upload
        </button>
      </div>

      {/* Batch Upload tab */}
      {activeTab === "batch" && (
        <div>
          <CsvUpload onBatchComplete={handleBatchComplete} />
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <>
          {cases.length === 0 ? (
            <p className="text-sm text-foreground/30 px-1">No investigations yet.</p>
          ) : (
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {cases.map((c) => (
                  <button
                    key={c.case_id}
                    onClick={() => onSelectCase(c.case_id)}
                    className="w-full text-left px-2.5 py-2 rounded-md hover:bg-foreground/5 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                      <span className="text-base text-foreground/70 truncate group-hover:text-foreground">
                        {c.full_name}
                      </span>
                      <span className="text-[10px] shrink-0 ml-auto px-1.5 py-0.5 rounded border border-foreground/15 text-foreground/40">
                        {c.country}
                      </span>
                    </div>
                    {c.inserted_at && (
                      <div className="flex items-center gap-1 mt-0.5 ml-5">
                        <Clock className="h-3 w-3 text-foreground/25" />
                        <span className="text-xs text-foreground/25">
                          {new Date(c.inserted_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}
