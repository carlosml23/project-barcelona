import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { CaseRowSchema, type CandidateReport, type Evidence, type TraceEvent } from "../state/types.js";
import { runCase } from "../orchestrator/graph.js";
import { shouldAutoSelect } from "../agents/clusterer.js";
import { store } from "../state/store.js";
import { newId } from "../util/id.js";

// ── In-memory pending candidate selections ────────────────────────────────
interface PendingSelection {
  resolve: (candidateId: string | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingSelections = new Map<string, PendingSelection>();

const SELECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── App ───────────────────────────────────────────────────────────────────
const app = new Hono();

app.use("/*", cors({ origin: "http://localhost:3000" }));

app.post("/api/investigate", async (c) => {
  const body = await c.req.json();
  const parsed = CaseRowSchema.omit({ case_id: true }).safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const row = { ...parsed.data, case_id: newId("WEB_") };
  const caseId = row.case_id;

  return streamSSE(c, async (stream) => {
    // SSE keepalive while waiting for candidate selection
    let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

    const startKeepalive = (): void => {
      keepaliveInterval = setInterval(() => {
        stream.writeSSE({ data: "", event: "keepalive" });
      }, 30_000);
    };

    const stopKeepalive = (): void => {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
    };

    const onTraceEvent = (evt: TraceEvent): void => {
      stream.writeSSE({ data: JSON.stringify(evt), event: "trace" });
    };

    const onCandidateReport = async (
      report: CandidateReport,
      _evidence: Evidence[],
    ): Promise<string | null> => {
      // Auto-selected: inform client but don't pause
      if (report.auto_selected || shouldAutoSelect(report.candidates)) {
        const topId = report.candidates[0]?.candidate_id ?? null;
        await stream.writeSSE({
          data: JSON.stringify(report),
          event: "candidates_auto",
        });
        return topId;
      }

      // Interactive: emit candidates and pause pipeline
      await stream.writeSSE({
        data: JSON.stringify({ ...report, session_id: caseId }),
        event: "candidates",
      });

      startKeepalive();

      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingSelections.has(caseId)) {
            pendingSelections.delete(caseId);
            resolve(null); // Timeout: use top candidate
          }
        }, SELECTION_TIMEOUT_MS);

        pendingSelections.set(caseId, { resolve, timer });
      }).finally(() => {
        stopKeepalive();
      });
    };

    try {
      const state = await runCase(row, {
        onTraceEvent,
        mode: "interactive",
        onCandidateReport,
      });

      await stream.writeSSE({
        data: JSON.stringify(state),
        event: "done",
      });
    } catch (err) {
      // Clean up pending selection if pipeline errors
      const pending = pendingSelections.get(caseId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingSelections.delete(caseId);
      }
      await stream.writeSSE({
        data: JSON.stringify({ error: String(err) }),
        event: "error",
      });
    } finally {
      stopKeepalive();
    }
  });
});

// ── Candidate selection endpoint ──────────────────────────────────────────
app.post("/api/investigate/:caseId/select-candidate", async (c) => {
  const { caseId } = c.req.param();
  const { candidate_id } = await c.req.json<{ candidate_id: string | null }>();

  const pending = pendingSelections.get(caseId);
  if (!pending) {
    return c.json({ error: "No pending selection for this session" }, 404);
  }

  clearTimeout(pending.timer);
  pendingSelections.delete(caseId);
  pending.resolve(candidate_id ?? null);

  return c.json({ ok: true });
});

// ── Case history endpoints ────────────────────────────────────────────────
app.get("/api/cases", (c) => {
  const cases = store.listCases();
  return c.json(cases);
});

app.get("/api/cases/:id", (c) => {
  const caseId = c.req.param("id");
  const evidence = store.getEvidence(caseId);
  const traces = store.getTraces(caseId);
  const briefing = store.getBriefing(caseId);
  const candidateReport = store.getCandidateReport(caseId);
  return c.json({ case_id: caseId, evidence, traces, briefing, candidateReport });
});

const PORT = 3001;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Sherlock API running on http://localhost:${PORT}`);
});
