import { Search, ShieldCheck, Brain, Network, Users, Sparkles, type LucideIcon } from "lucide-react";

export interface AgentMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  dotClass: string;
  textClass: string;
  bgClass: string;
}

export const AGENT_META: Record<string, AgentMeta> = {
  orchestrator: {
    label: "Orchestrator",
    icon: Network,
    color: "purple",
    dotClass: "bg-purple-500",
    textClass: "text-purple-400",
    bgClass: "bg-purple-500/10",
  },
  verifier: {
    label: "Verifier",
    icon: ShieldCheck,
    color: "amber",
    dotClass: "bg-amber-500",
    textClass: "text-amber-400",
    bgClass: "bg-amber-500/10",
  },
  refiner: {
    label: "Refiner",
    icon: Sparkles,
    color: "purple",
    dotClass: "bg-purple-500",
    textClass: "text-purple-400",
    bgClass: "bg-purple-500/10",
  },
  clusterer: {
    label: "Clusterer",
    icon: Users,
    color: "indigo",
    dotClass: "bg-indigo-500",
    textClass: "text-indigo-400",
    bgClass: "bg-indigo-500/10",
  },
  synthesiser: {
    label: "Synthesiser",
    icon: Brain,
    color: "green",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
  },
};

const DEFAULT_AGENT_META: AgentMeta = {
  label: "Search",
  icon: Search,
  color: "blue",
  dotClass: "bg-blue-500",
  textClass: "text-blue-400",
  bgClass: "bg-blue-500/10",
};

export function getAgentMeta(agent: string): AgentMeta {
  return AGENT_META[agent] ?? DEFAULT_AGENT_META;
}
