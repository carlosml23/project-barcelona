"use client";

import { motion } from "framer-motion";
import { FileText, Lightbulb, AlertTriangle, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EvidenceList } from "@/components/evidence-list";
import { GapsSection } from "@/components/gaps-section";
import type { Briefing, Evidence } from "@/lib/types";

interface BriefingCardProps {
  briefing: Briefing;
  evidence: Evidence[];
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <Badge variant="outline" className={`text-[10px] ${styles[confidence] ?? styles.low}`}>
      {confidence}
    </Badge>
  );
}

function SignalBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    employment: "bg-blue-500/15 text-blue-400",
    business: "bg-purple-500/15 text-purple-400",
    asset: "bg-emerald-500/15 text-emerald-400",
    legal: "bg-red-500/15 text-red-400",
    social: "bg-pink-500/15 text-pink-400",
    news: "bg-orange-500/15 text-orange-400",
    registry: "bg-cyan-500/15 text-cyan-400",
    subsidy: "bg-yellow-500/15 text-yellow-400",
  };

  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

export function BriefingCard({ briefing, evidence }: BriefingCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(briefing, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Briefing
            </CardTitle>
            <div className="flex items-center gap-2">
              <ConfidenceBadge confidence={briefing.overall_confidence} />
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Summary */}
          <p className="text-sm text-foreground leading-relaxed">{briefing.summary}</p>

          <Separator className="bg-border/50" />

          {/* Findings */}
          {briefing.findings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Findings
              </h4>
              <div className="space-y-2">
                {briefing.findings.map((f, i) => (
                  <div key={i} className="p-2.5 rounded-md bg-secondary/50 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <SignalBadge type={f.signal_type} />
                      <ConfidenceBadge confidence={f.confidence} />
                      <span className="text-[10px] text-muted-foreground">
                        {f.evidence_ids.length} source{f.evidence_ids.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90">{f.claim}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Negotiation Angles */}
          {briefing.negotiation_angles.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lightbulb className="h-3 w-3 text-primary" />
                Negotiation Angles
              </h4>
              <ul className="space-y-1.5">
                {briefing.negotiation_angles.map((angle, i) => (
                  <li key={i} className="text-sm text-foreground/80 pl-3 border-l-2 border-primary/30">
                    {angle}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gaps */}
          {briefing.gaps.length > 0 && (
            <>
              <Separator className="bg-border/50" />
              <GapsSection gaps={briefing.gaps} />
            </>
          )}

          {/* Evidence */}
          {evidence.length > 0 && (
            <>
              <Separator className="bg-border/50" />
              <EvidenceList evidence={evidence} />
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
