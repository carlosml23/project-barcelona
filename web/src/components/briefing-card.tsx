"use client";

import { motion } from "framer-motion";
import { Lightbulb, CheckCircle2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Briefing, Candidate } from "@/lib/types";

interface BriefingReportProps {
  briefing: Briefing;
  candidates?: Candidate[];
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <Badge variant="outline" className={`text-xs ${styles[confidence] ?? styles.low}`}>
      {confidence} confidence
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

function confidenceColor(score: number): string {
  if (score >= 0.75) return "text-emerald-400";
  if (score >= 0.5) return "text-amber-400";
  return "text-red-400";
}

function NegotiationAngleTabs({
  angles,
  candidates = [],
}: {
  angles: Record<string, string[]>;
  candidates?: Candidate[];
}) {
  const labels = Object.keys(angles);
  const [activeTab, setActiveTab] = useState(0);
  const isSingleGroup = labels.length <= 1;
  const activeAngles = angles[labels[activeTab]] ?? [];

  // Build label → confidence lookup from candidates
  const scoreByLabel = new Map(candidates.map((c) => [c.label, c.confidence]));

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Lightbulb className="h-3 w-3 text-primary" />
        Negotiation Angles
      </h3>

      {!isSingleGroup && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {labels.map((label, i) => {
            const score = scoreByLabel.get(label);
            return (
              <button
                key={label}
                onClick={() => setActiveTab(i)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  i === activeTab
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <span className="truncate max-w-[200px]">{label}</span>
                {score != null && (
                  <span className={`tabular-nums ${i === activeTab ? confidenceColor(score) : ""}`}>
                    {Math.round(score * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        {activeAngles.map((angle, i) => (
          <p key={i} className="text-sm text-foreground/80 pl-3 border-l-2 border-primary/30 leading-relaxed">
            {angle}
          </p>
        ))}
      </div>
    </div>
  );
}

export function BriefingReport({ briefing, candidates }: BriefingReportProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(briefing, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-foreground">Investigation Complete</h2>
          <ConfidenceBadge confidence={briefing.overall_confidence} />
        </div>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 gap-1 text-xs text-muted-foreground">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/* Summary */}
      <p className="text-sm leading-relaxed text-foreground/90">
        {briefing.summary}
      </p>

      <Separator className="bg-border/40" />

      {/* Findings */}
      {briefing.findings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Findings
          </h3>
          <div className="space-y-2">
            {briefing.findings.map((f, i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/40 border border-border/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <SignalBadge type={f.signal_type} />
                  <ConfidenceBadge confidence={f.confidence} />
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed">{f.claim}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negotiation Angles */}
      {Object.keys(briefing.negotiation_angles).length > 0 && (
        <NegotiationAngleTabs angles={briefing.negotiation_angles} candidates={candidates} />
      )}
    </motion.div>
  );
}
