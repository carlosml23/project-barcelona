"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShieldCheck, Sparkles, Brain, Loader2, Users, Activity, ChevronDown } from "lucide-react";
import { getAgentLabel } from "@/config/agent-labels";
import { getAgentMeta } from "@/config/agents";
import type { InvestigationPhase } from "@/hooks/use-investigation";
import type { TraceEvent } from "@/lib/types";

interface PhaseIndicatorProps {
  phase: InvestigationPhase;
  subjectName: string;
  sourcesCount: number;
  evidenceCount: number;
  trace?: TraceEvent[];
}

const PHASE_CONFIG: Record<string, { label: string; icon: typeof Search; color: string }> = {
  connecting: { label: "Preparing search plan...", icon: Loader2, color: "text-blue-400" },
  searching: { label: "Searching public records", icon: Search, color: "text-blue-400" },
  verifying: { label: "Verifying identity", icon: ShieldCheck, color: "text-amber-400" },
  refining: { label: "Deep-diving into leads", icon: Sparkles, color: "text-purple-400" },
  clustering: { label: "Grouping evidence by candidate", icon: Users, color: "text-indigo-400" },
  synthesizing: { label: "Analyzing findings", icon: Brain, color: "text-emerald-400" },
};

export function PhaseIndicator({ phase, subjectName, sourcesCount, evidenceCount, trace = [] }: PhaseIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          : phase === "synthesizing"
              ? "Building your briefing"
              : "";

  const activityEvents = trace.filter((e) => e.kind === "tool_call" || e.kind === "tool_result");

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isExpanded, activityEvents.length]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Investigating {subjectName}
        </h2>
      </div>

      {/* Clickable phase + progress bar */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full text-left group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 flex-1 min-w-0"
            >
              <Icon className={`h-5 w-5 ${config.color} ${phase === "connecting" ? "animate-spin" : ""}`} />
              <span className={`text-base font-medium ${config.color}`}>{config.label}</span>
              {detail && (
                <span className="text-sm text-muted-foreground">{detail}</span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Expand indicator */}
          <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
            <Activity className="h-4 w-4" />
            <span className="text-sm">{activityEvents.length}</span>
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden mt-2.5">
          <motion.div
            className="h-full rounded-full bg-primary/60"
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "40%" }}
          />
        </div>
      </button>

      {/* Collapsible activity panel */}
      <AnimatePresence initial={false}>
        {isExpanded && activityEvents.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="max-h-64 overflow-y-auto rounded-lg border border-border/30 bg-secondary/20 p-3 space-y-1.5"
            >
              {activityEvents.map((evt, i) => {
                const meta = getAgentMeta(evt.agent);
                const AgentIcon = meta.icon;
                const isToolCall = evt.kind === "tool_call";

                return (
                  <motion.div
                    key={`${evt.ts}-${evt.agent}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-start gap-2.5 py-1"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${meta.dotClass}`} />
                    <AgentIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.textClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground/80">
                          {getAgentLabel(evt.agent)}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          isToolCall
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-emerald-500/15 text-emerald-400"
                        }`}>
                          {isToolCall ? "searching" : "found"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{evt.message}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
