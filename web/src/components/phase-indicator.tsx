"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Search, ShieldCheck, Sparkles, Brain, Loader2, Users, UserCheck } from "lucide-react";
import type { InvestigationPhase } from "@/hooks/use-investigation";

interface PhaseIndicatorProps {
  phase: InvestigationPhase;
  subjectName: string;
  sourcesCount: number;
  evidenceCount: number;
}

const PHASE_CONFIG: Record<string, { label: string; icon: typeof Search; color: string }> = {
  connecting: { label: "Starting investigation...", icon: Loader2, color: "text-muted-foreground" },
  searching: { label: "Searching public records", icon: Search, color: "text-blue-400" },
  verifying: { label: "Verifying identity", icon: ShieldCheck, color: "text-amber-400" },
  refining: { label: "Deep-diving into leads", icon: Sparkles, color: "text-purple-400" },
  clustering: { label: "Grouping evidence by candidate", icon: Users, color: "text-indigo-400" },
  awaitingSelection: { label: "Candidate selection required", icon: UserCheck, color: "text-orange-400" },
  synthesizing: { label: "Analyzing findings", icon: Brain, color: "text-emerald-400" },
};

export function PhaseIndicator({ phase, subjectName, sourcesCount, evidenceCount }: PhaseIndicatorProps) {
  if (phase === "complete") return null;

  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG.connecting;
  const Icon = config.icon;

  const detail = phase === "searching" && sourcesCount > 0
    ? `${sourcesCount} source${sourcesCount !== 1 ? "s" : ""} found`
    : phase === "verifying"
      ? `${evidenceCount} results across ${sourcesCount} sources`
      : phase === "refining"
        ? "Searching for additional evidence"
        : phase === "clustering"
          ? "Analyzing identity patterns"
          : phase === "awaitingSelection"
            ? "Review candidates below"
            : phase === "synthesizing"
              ? "Building your briefing"
              : "";

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Investigating {subjectName}
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <Icon className={`h-4 w-4 ${config.color} ${phase === "connecting" ? "animate-spin" : ""}`} />
            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
            {detail && (
              <span className="text-xs text-muted-foreground">{detail}</span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Indeterminate progress bar */}
      <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary/60"
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: "40%" }}
        />
      </div>
    </div>
  );
}
