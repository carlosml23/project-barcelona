"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CaseRow } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CaseSidebarProps {
  onSelectCase: (caseId: string) => void;
  refreshKey: number;
}

export function CaseSidebar({ onSelectCase, refreshKey }: CaseSidebarProps) {
  const [cases, setCases] = useState<(CaseRow & { inserted_at?: string })[]>([]);

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

  if (cases.length === 0) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
          History
        </h3>
        <p className="text-xs text-muted-foreground/60 px-1">No investigations yet.</p>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
        History
      </h3>
      <ScrollArea className="max-h-48">
        <div className="space-y-1">
          {cases.map((c) => (
            <button
              key={c.case_id}
              onClick={() => onSelectCase(c.case_id)}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-secondary/50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground/80 truncate group-hover:text-foreground">
                  {c.full_name}
                </span>
                <Badge variant="outline" className="text-[9px] shrink-0 ml-auto">
                  {c.country}
                </Badge>
              </div>
              {c.inserted_at && (
                <div className="flex items-center gap-1 mt-0.5 ml-5">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/50">
                    {new Date(c.inserted_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
