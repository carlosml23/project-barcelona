"use client";

import { motion } from "framer-motion";
import { getAgentMeta } from "@/config/agents";
import type { TraceEvent } from "@/lib/types";

interface TraceTimelineProps {
  events: TraceEvent[];
}

function KindBadge({ kind }: { kind: TraceEvent["kind"] }) {
  const variants: Record<string, string> = {
    plan: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    tool_call: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    tool_result: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    decision: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border ${variants[kind] ?? variants.plan}`}>
      {kind.replace("_", " ")}
    </span>
  );
}

function TraceEventItem({ event }: { event: TraceEvent }) {
  const meta = getAgentMeta(event.agent);
  const Icon = meta.icon;
  const time = new Date(event.ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1">
        <div className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
        <div className="w-px flex-1 bg-border/50 mt-1" />
      </div>

      {/* Event content */}
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className={`h-3.5 w-3.5 ${meta.textClass} shrink-0`} />
          <span className={`text-sm font-medium ${meta.textClass}`}>{meta.label}</span>
          <KindBadge kind={event.kind} />
          <span className="text-xs text-muted-foreground ml-auto shrink-0">{time}</span>
        </div>
        <p className="text-sm text-foreground/70 leading-relaxed break-words">
          {event.message}
        </p>
      </div>
    </div>
  );
}

export function TraceTimeline({ events }: TraceTimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-0">
      {events.map((evt, i) => (
        <motion.div
          key={`${evt.ts}-${evt.agent}-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <TraceEventItem event={evt} />
        </motion.div>
      ))}
    </div>
  );
}
