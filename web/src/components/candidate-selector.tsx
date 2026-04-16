"use client";

import { motion } from "framer-motion";
import { Users, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CandidateReport } from "@/lib/types";

interface CandidateSelectorProps {
  report: CandidateReport;
  onSelect: (candidateId: string) => void;
  onAutoSelect: () => void;
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.75
      ? "bg-emerald-500"
      : confidence >= 0.5
        ? "bg-amber-500"
        : "bg-red-500";
  const textColor =
    confidence >= 0.75
      ? "text-emerald-400"
      : confidence >= 0.5
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${textColor} tabular-nums`}>{pct}%</span>
    </div>
  );
}

export function CandidateSelector({ report, onSelect, onAutoSelect }: CandidateSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-orange-400" />
        <h3 className="text-base font-semibold text-foreground">Multiple candidates detected</h3>
        <Badge variant="outline" className="text-xs bg-orange-500/15 text-orange-400 border-orange-500/30">
          {report.candidates.length} candidates
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        The investigation found evidence that may belong to different people. Select the correct candidate to continue.
      </p>

      {/* Candidate cards */}
      <div className="space-y-3">
        {report.candidates.map((candidate, i) => (
          <motion.div
            key={candidate.candidate_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.08 }}
            className="p-4 rounded-lg bg-secondary/40 border border-border/20 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {i === 0 && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      Best match
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {candidate.evidence_count} evidence item{candidate.evidence_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <h4 className="text-sm font-medium text-foreground">{candidate.label}</h4>
              </div>
              <Button
                size="sm"
                variant={i === 0 ? "default" : "outline"}
                onClick={() => onSelect(candidate.candidate_id)}
                className="shrink-0"
              >
                Select
              </Button>
            </div>

            <ConfidenceBar confidence={candidate.confidence} />

            <p className="text-xs text-foreground/70 leading-relaxed">{candidate.summary}</p>

            {candidate.distinguishing_features.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {candidate.distinguishing_features.map((feat, j) => (
                  <span
                    key={j}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                  >
                    {feat}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Follow-up questions */}
      {report.follow_up_questions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <HelpCircle className="h-3 w-3 text-primary" />
            Questions to help decide
          </h4>
          <div className="space-y-1.5">
            {report.follow_up_questions.map((q, i) => (
              <p key={i} className="text-sm text-foreground/80 pl-3 border-l-2 border-primary/30 leading-relaxed">
                {q.question}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Auto-select fallback */}
      <div className="pt-1">
        <Button variant="ghost" size="sm" onClick={onAutoSelect} className="text-xs text-muted-foreground">
          Use top candidate
        </Button>
      </div>
    </motion.div>
  );
}
