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
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[confidence] ?? colors.low}`} />;
}

export function EvidenceList({ evidence }: EvidenceListProps) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
        Evidence ({evidence.length})
      </h4>
      <Accordion className="space-y-1">
        {evidence.map((e) => (
          <AccordionItem key={e.id} value={e.id} className="border-border/30">
            <AccordionTrigger className="py-2.5 px-3 text-base hover:no-underline hover:bg-secondary/30 rounded-md">
              <div className="flex items-center gap-2 text-left min-w-0">
                <ConfidenceDot confidence={e.pairing_confidence} />
                <span className="truncate text-foreground/90">{e.title ?? e.source}</span>
                <Badge variant="outline" className="text-[10px] shrink-0 ml-auto mr-2">
                  {e.signal_type}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3.5">
              <div className="space-y-2 text-sm">
                <p className="text-foreground/70 leading-relaxed">{e.snippet}</p>
                <div className="flex items-center gap-3 text-muted-foreground text-sm">
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
                  {e.source} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
