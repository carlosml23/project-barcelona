"use client";

import { ExternalLink } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { Evidence } from "@/lib/types";

interface EvidenceListProps {
  evidence: Evidence[];
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    very_high: "bg-emerald-400",
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-red-400",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[confidence] ?? colors.low}`} />;
}

export function EvidenceList({ evidence }: EvidenceListProps) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Evidence ({evidence.length})
      </h4>
      <Accordion className="space-y-1">
        {evidence.map((e) => (
          <AccordionItem key={e.id} value={e.id} className="border-border/30">
            <AccordionTrigger className="py-2 px-2.5 text-sm hover:no-underline hover:bg-secondary/30 rounded-md">
              <div className="flex items-center gap-2 text-left min-w-0">
                <ConfidenceDot confidence={e.pairing_confidence} />
                <span className="truncate text-foreground/90">{e.title ?? e.source}</span>
                <Badge variant="outline" className="text-[9px] shrink-0 ml-auto mr-2">
                  {e.signal_type}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2.5 pb-3">
              <div className="space-y-2 text-xs">
                <p className="text-foreground/70 leading-relaxed">{e.snippet}</p>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>Score: {(e.identity_match_score * 100).toFixed(0)}%</span>
                  <span>Match: {e.pairing_confidence}</span>
                  {e.matched_data_points.length > 0 && (
                    <span>Fields: {e.matched_data_points.join(", ")}</span>
                  )}
                </div>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {e.source} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
