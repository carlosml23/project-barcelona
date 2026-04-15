"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAgentMeta } from "@/config/agents";
import type { TraceEvent } from "@/lib/types";
import type { InvestigationStatus } from "@/hooks/use-investigation";

interface TraceTimelineProps {
  events: TraceEvent[];
  status: InvestigationStatus;
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
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${variants[kind] ?? variants.plan}`}>
      {kind.replace("_", " ")}
    </span>
  );
}

function TraceEventItem({ event, isLatest }: { event: TraceEvent; isLatest: boolean }) {
  const meta = getAgentMeta(event.agent);
  const Icon = meta.icon;
  const time = new Date(event.ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex gap-3 group"
    >
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1">
        <div className="relative">
          <div className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
          {isLatest && (
            <motion.div
              className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${meta.dotClass}`}
              animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>
        <div className="w-px flex-1 bg-border/50 mt-1" />
      </div>

      {/* Event content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-3 w-3 ${meta.textClass} shrink-0`} />
          <span className={`text-xs font-medium ${meta.textClass}`}>{meta.label}</span>
          <KindBadge kind={event.kind} />
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{time}</span>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed break-words">
          {event.message}
        </p>
      </div>
    </motion.div>
  );
}

export function TraceTimeline({ events, status }: TraceTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0 && status === "idle") {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Start an investigation to see the agent trace here.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Investigation Trace
        </h3>
        {status === "running" && (
          <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
            <motion.span
              className="inline-block w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            Live
          </Badge>
        )}
        {status === "complete" && (
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
            Complete
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 pr-2">
        <AnimatePresence mode="popLayout">
          {events.map((evt, i) => (
            <TraceEventItem
              key={`${evt.ts}-${evt.agent}-${i}`}
              event={evt}
              isLatest={i === events.length - 1 && status === "running"}
            />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </ScrollArea>
    </div>
  );
}
