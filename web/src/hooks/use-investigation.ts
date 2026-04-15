"use client";

import { useState, useRef, useCallback } from "react";
import type { TraceEvent, CaseState, CaseFormInput } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type InvestigationStatus = "idle" | "running" | "complete" | "error";

export interface InvestigationState {
  status: InvestigationStatus;
  trace: TraceEvent[];
  caseState: CaseState | null;
  error: string | null;
  startInvestigation: (input: CaseFormInput) => void;
  cancel: () => void;
}

export function useInvestigation(): InvestigationState {
  const [status, setStatus] = useState<InvestigationStatus>("idle");
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                const eventType = line.slice(7).trim();

                const dataLineIndex = lines.indexOf(line) + 1;
                if (dataLineIndex < lines.length) continue;

                if (eventType === "done") {
                  continue;
                }
              }

              if (!line.startsWith("data: ")) continue;

              const raw = line.slice(6);
              try {
                const parsed = JSON.parse(raw);

                if (parsed.case && parsed.evidence && parsed.briefing !== undefined) {
                  setCaseState(parsed as CaseState);
                  setStatus("complete");
                } else if (parsed.error) {
                  setError(String(parsed.error));
                  setStatus("error");
                } else {
                  setTrace((prev) => [...prev, parsed as TraceEvent]);
                }
              } catch {
                // incomplete JSON chunk, ignore
              }
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

  return { status, trace, caseState, error, startInvestigation, cancel };
}
