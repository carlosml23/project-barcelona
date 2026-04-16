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
    high: "bg-emerald-100 text-emerald-800 border-emerald-300",
    medium: "bg-amber-100 text-amber-800 border-amber-400",
    low: "bg-red-100 text-red-800 border-red-300",
  };
  return (
    <Badge variant="outline" className={`text-xs ${styles[confidence] ?? styles.low}`}>
      {confidence} confidence
    </Badge>
  );
}

function SignalBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    employment: "bg-blue-100 text-blue-800",
    business: "bg-purple-100 text-purple-800",
    asset: "bg-emerald-100 text-emerald-800",
    legal: "bg-red-100 text-red-800",
    social: "bg-pink-100 text-pink-800",
    news: "bg-orange-100 text-orange-800",
    registry: "bg-cyan-100 text-cyan-800",
    subsidy: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${styles[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

function confidenceColor(score: number): string {
  if (score >= 0.75) return "text-emerald-700";
  if (score >= 0.5) return "text-amber-700";
  return "text-red-700";
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
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-border"
                }`}
              >
                <span className="truncate max-w-[200px]">{label}</span>
                {score != null && (
                  <span className={`tabular-nums ${confidenceColor(score)}`}>
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
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          <h2 className="text-lg font-semibold text-foreground">Investigation Complete</h2>
          <ConfidenceBadge confidence={briefing.overall_confidence} />
        </div>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 px-2.5 gap-1.5 text-sm text-muted-foreground">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/* Summary */}
      <p className="text-base leading-relaxed text-foreground/90">
        {briefing.summary}
      </p>

      <Separator className="bg-border/40" />

      {/* Findings */}
      {briefing.findings.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Findings
          </h3>
          <div className="space-y-2.5">
            {briefing.findings.map((f, i) => (
              <div key={i} className="p-4 rounded-lg bg-secondary/40 border border-border/20">
                <div className="flex items-center gap-2 mb-2">
                  <SignalBadge type={f.signal_type} />
                  <ConfidenceBadge confidence={f.confidence} />
                </div>
                <p className="text-base text-foreground/85 leading-relaxed">{f.claim}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negotiation Angles — normalize legacy flat array format */}
      {(() => {
        const raw = briefing.negotiation_angles;
        const angles: Record<string, string[]> = Array.isArray(raw) ? { General: raw } : raw;
        return Object.keys(angles).length > 0 ? (
          <NegotiationAngleTabs angles={angles} candidates={candidates} />
        ) : null;
      })()}
    </motion.div>
  );
}
