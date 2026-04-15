"use client";

import { AlertTriangle } from "lucide-react";
import type { Gap } from "@/lib/types";

interface GapsSectionProps {
  gaps: Gap[];
}

export function GapsSection({ gaps }: GapsSectionProps) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3 text-amber-400" />
        Gaps ({gaps.length})
      </h4>
      <div className="space-y-2">
        {gaps.map((g, i) => (
          <div key={i} className="p-2.5 rounded-md bg-amber-500/5 border border-amber-500/15">
            <p className="text-sm text-foreground/80">{g.what_we_tried}</p>
            <p className="text-xs text-muted-foreground mt-1">{g.why_not_found}</p>
            {g.sources_checked.length > 0 && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Checked: {g.sources_checked.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
