"use client";

import { AlertTriangle } from "lucide-react";
import type { Gap } from "@/lib/types";

interface GapsSectionProps {
  gaps: Gap[];
}

export function GapsSection({ gaps }: GapsSectionProps) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        Gaps ({gaps.length})
      </h4>
      <div className="space-y-2">
        {gaps.map((g, i) => (
          <div key={i} className="p-3 rounded-md bg-amber-500/5 border border-amber-500/15">
            <p className="text-base text-foreground/80">{g.what_we_tried}</p>
            <p className="text-sm text-muted-foreground mt-1">{g.why_not_found}</p>
            {g.sources_checked.length > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                Checked: {g.sources_checked.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
