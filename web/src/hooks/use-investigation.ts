"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { TraceEvent, CaseState, CaseFormInput } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type InvestigationStatus = "idle" | "running" | "complete" | "error";
export type InvestigationPhase =
  | "connecting"
  | "searching"
  | "verifying"
  | "refining"
  | "clustering"
  | "synthesizing"
  | "complete";

export interface SourceHit {
  domain: string;
  signalType: string;
}

export interface InvestigationState {
  status: InvestigationStatus;
  phase: InvestigationPhase;
  trace: TraceEvent[];
  caseState: CaseState | null;
  error: string | null;
  sourcesFound: SourceHit[];
  evidenceCount: number;
  startInvestigation: (input: CaseFormInput) => void;
  cancel: () => void;
}

const KNOWN_PHASES: Record<string, InvestigationPhase> = {
  verifier: "verifying",
  refiner: "refining",
  clusterer: "clustering",
  synthesiser: "synthesizing",
};

function derivePhase(events: TraceEvent[], status: InvestigationStatus): InvestigationPhase {
  if (status === "complete") return "complete";
  if (status !== "running") return "connecting";
  if (events.length === 0) return "connecting";

  for (let i = events.length - 1; i >= 0; i--) {
    const agent = events[i].agent;
    if (KNOWN_PHASES[agent]) return KNOWN_PHASES[agent];
  }
  return "searching";
}

function extractSources(events: TraceEvent[]): SourceHit[] {
  const seen = new Set<string>();
  const sources: SourceHit[] = [];

  for (const evt of events) {
    if (evt.kind !== "tool_result") continue;

    const domain = agentToDomain(evt.agent);
    if (domain && !seen.has(domain)) {
      seen.add(domain);
      sources.push({ domain, signalType: guessSignalType(evt.agent) });
    }
  }
  return sources;
}

function agentToDomain(agent: string): string | null {
  const domainMap: Record<string, string> = {
    boe_buscon_dni: "boe.es",
    boe_buscon_name: "boe.es",
    bdns_subvenciones: "pap.hacienda.gob.es",
    telemaco_bop: "boe.es",
    registradores_propiedad: "registradores.org",
    catastro: "catastro.meh.es",
    axesor_dni: "axesor.es",
    einforma: "einforma.com",
    infocif: "infocif.es",
    borme: "boe.es/borme",
    colegios_medicos: "cgcom.es",
    colegios_abogados: "abogacia.es",
    tellows_phone: "tellows.es",
    listaspam_phone: "listaspam.com",
    linkedin_es: "linkedin.com",
    linkedin_generic: "linkedin.com",
    dateas: "dateas.com",
    web_general: "web",
    news_generic: "news",
    social_generic: "social",
    discovery: "web search",
  };
  return domainMap[agent] ?? null;
}

function guessSignalType(agent: string): string {
  if (agent.includes("boe") || agent.includes("borme") || agent.includes("telemaco")) return "legal";
  if (agent.includes("registradores") || agent.includes("catastro")) return "asset";
  if (agent.includes("axesor") || agent.includes("einforma") || agent.includes("infocif")) return "business";
  if (agent.includes("linkedin") || agent.includes("dateas")) return "employment";
  if (agent.includes("colegios")) return "registry";
  if (agent.includes("bdns")) return "subsidy";
  if (agent.includes("phone") || agent.includes("tellows") || agent.includes("listaspam")) return "social";
  if (agent.includes("news")) return "news";
  return "other";
}

function countEvidence(events: TraceEvent[]): number {
  let count = 0;
  for (const evt of events) {
    if (evt.kind !== "tool_result") continue;
    const match = evt.message.match(/(\d+)\s*hits?/i);
    if (match) count += parseInt(match[1], 10);
  }
  return count;
}

export function useInvestigation(): InvestigationState {
  const [status, setStatus] = useState<InvestigationStatus>("idle");
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const phase = useMemo(() => derivePhase(trace, status), [trace, status]);
  const sourcesFound = useMemo(() => extractSources(trace), [trace]);
  const evidenceCount = useMemo(() => countEvidence(trace), [trace]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((prev) => (prev === "running" ? "idle" : prev));
  }, []);

  const startInvestigation = useCallback(
    (input: CaseFormInput) => {
      cancel();

      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("running");
      setTrace([]);
      setCaseState(null);
      setError(null);

      (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/investigate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: controller.signal,
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
          }

          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response stream");

          const decoder = new TextDecoder();
          let buffer = "";
          let currentEventType = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEventType = line.slice(7).trim();
                continue;
              }

              if (!line.startsWith("data: ")) continue;

              const raw = line.slice(6);
              if (!raw) continue;

              try {
                const parsed = JSON.parse(raw);

                switch (currentEventType) {
                  case "trace":
                    setTrace((prev) => [...prev, parsed as TraceEvent]);
                    break;
                  case "done":
                    setCaseState(parsed as CaseState);
                    setStatus("complete");
                    break;
                  case "error":
                    setError(String(parsed.error));
                    setStatus("error");
                    break;
                  default:
                    // Fallback: detect by shape (backwards compat)
                    if (parsed.case && parsed.evidence && parsed.briefing !== undefined) {
                      setCaseState(parsed as CaseState);
                      setStatus("complete");
                    } else if (parsed.error) {
                      setError(String(parsed.error));
                      setStatus("error");
                    } else if (parsed.ts && parsed.agent) {
                      setTrace((prev) => [...prev, parsed as TraceEvent]);
                    }
                    break;
                }
              } catch {
                // incomplete JSON chunk, ignore
              }

              currentEventType = "";
            }
          }

          setStatus((prev) => (prev === "running" ? "complete" : prev));
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setError(String(err));
          setStatus("error");
        }
      })();
    },
    [cancel],
  );

  return {
    status,
    phase,
    trace,
    caseState,
    error,
    sourcesFound,
    evidenceCount,
    startInvestigation,
    cancel,
  };
}
