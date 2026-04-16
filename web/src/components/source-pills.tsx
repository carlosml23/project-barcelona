"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { SourceHit } from "@/hooks/use-investigation";

interface SourcePillsProps {
  sources: SourceHit[];
}

const SIGNAL_COLORS: Record<string, string> = {
  legal: "bg-red-500/15 text-red-400 border-red-500/20",
  asset: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  business: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  employment: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  registry: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  subsidy: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  social: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  news: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  other: "bg-muted text-muted-foreground border-border/30",
};

const MAX_VISIBLE = 14;

export function SourcePills({ sources }: SourcePillsProps) {
  if (sources.length === 0) return null;

  const visible = sources.slice(0, MAX_VISIBLE);
  const overflow = sources.length - MAX_VISIBLE;

  return (
    <div className="space-y-2.5">
      <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
        Sources found
      </p>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence mode="popLayout">
          {visible.map((src) => (
            <motion.span
              key={src.domain}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium border ${SIGNAL_COLORS[src.signalType] ?? SIGNAL_COLORS.other}`}
            >
              {src.domain}
            </motion.span>
          ))}
          {overflow > 0 && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-muted text-muted-foreground"
            >
              +{overflow} more
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
