"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Circle } from "lucide-react";
import { getStepLabel, PIPELINE_STAGES } from "@/config/step-labels";
import type { TraceEvent } from "@/lib/types";
import type { InvestigationStatus } from "@/hooks/use-investigation";

type StepStatus = "pending" | "active" | "done";

interface InvestigationStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_STAGES);

function parseHitCount(message: string): string | undefined {
  const match = message.match(/(\d+)\s*hits?/i);
  if (match) {
    const n = parseInt(match[1], 10);
    return `${n} result${n !== 1 ? "s" : ""}`;
  }
  return undefined;
}

function deriveSteps(trace: readonly TraceEvent[], status: InvestigationStatus): InvestigationStep[] {
  const searchSteps = new Map<string, InvestigationStep>();
  const searchOrder: string[] = [];
  const stageStatus = new Map<string, { status: StepStatus; detail?: string }>();

  // Initialize pipeline stages as pending
  for (const stage of PIPELINE_STAGES) {
    stageStatus.set(stage, { status: "pending" });
  }

  let hasSearchEvent = false;

  for (const evt of trace) {
    const { agent, kind, message } = evt;
    const isPipelineStage = PIPELINE_STAGE_SET.has(agent);

    if (!isPipelineStage) {
      // Search agent events
      hasSearchEvent = true;

      if (kind === "plan" || kind === "tool_call") {
        if (!searchSteps.has(agent)) {
          searchOrder.push(agent);
          searchSteps.set(agent, {
            id: agent,
            label: getStepLabel(agent),
            status: "active",
          });
        } else {
          const step = searchSteps.get(agent)!;
          if (step.status !== "done") {
            searchSteps.set(agent, { ...step, status: "active" });
          }
        }
      } else if (kind === "tool_result") {
        const existing = searchSteps.get(agent);
        const detail = parseHitCount(message);
        searchSteps.set(agent, {
          id: agent,
          label: getStepLabel(agent),
          status: "done",
          detail: detail ?? existing?.detail ?? "done",
        });
        if (!existing) searchOrder.push(agent);
      } else if (kind === "error") {
        const existing = searchSteps.get(agent);
        searchSteps.set(agent, {
          id: agent,
          label: getStepLabel(agent),
          status: "done",
          detail: "failed",
        });
        if (!existing) searchOrder.push(agent);
      }
    } else {
      // Pipeline stage events
      const current = stageStatus.get(agent)!;
      if (kind === "tool_result" || kind === "decision") {
        stageStatus.set(agent, {
          status: "done",
          detail: current.detail ?? parseHitCount(message),
        });
      } else if (current.status === "pending") {
        stageStatus.set(agent, { status: "active" });
      }
    }
  }

  // Build final list: search steps first, then pipeline stages
  const steps: InvestigationStep[] = searchOrder.map((id) => searchSteps.get(id)!);

  // Only show pipeline stages once search has started
  if (hasSearchEvent) {
    for (const stage of PIPELINE_STAGES) {
      const info = stageStatus.get(stage)!;
      steps.push({
        id: stage,
        label: getStepLabel(stage),
        status: info.status,
        detail: info.detail,
      });
    }
  }

  // If investigation is done, mark everything as done
  if (status !== "running") {
    return steps.map((s) =>
      s.status === "done" ? s : { ...s, status: "done" as const },
    );
  }

  return steps;
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    case "active":
      return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />;
    case "pending":
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />;
  }
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "text-foreground/70",
  active: "text-foreground/90",
  pending: "text-muted-foreground/50",
};

interface InvestigationStepsProps {
  trace: TraceEvent[];
  status: InvestigationStatus;
}

export function InvestigationSteps({ trace, status }: InvestigationStepsProps) {
  const steps = useMemo(() => deriveSteps(trace, status), [trace, status]);

  if (steps.length === 0) return null;

  return (
    <div className="space-y-1 py-1">
      <AnimatePresence initial={false}>
        {steps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 py-0.5 px-1">
              <StepIcon status={step.status} />
              <span className={`text-xs ${STATUS_TEXT[step.status]} flex-1 truncate`}>
                {step.label}
              </span>
              {step.detail && step.status === "done" && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {step.detail}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
