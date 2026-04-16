import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { CaseRowSchema, type TraceEvent } from "../state/types.js";
import { runCase } from "../orchestrator/graph.js";
import { store } from "../state/store.js";
import { newId } from "../util/id.js";

const app = new Hono();

app.use("/*", cors({ origin: "http://localhost:3000" }));

app.post("/api/investigate", async (c) => {
  const body = await c.req.json();
  const parsed = CaseRowSchema.omit({ case_id: true }).safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const row = { ...parsed.data, case_id: newId("WEB_") };

  return streamSSE(c, async (stream) => {
    const onTraceEvent = (evt: TraceEvent): void => {
      stream.writeSSE({ data: JSON.stringify(evt), event: "trace" });
    };

    try {
      const state = await runCase(row, { onTraceEvent });

      await stream.writeSSE({
        data: JSON.stringify(state),
        event: "done",
      });
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({ error: String(err) }),
        event: "error",
      });
    }
  });
});

app.get("/api/cases", (c) => {
  const cases = store.listCases();
  return c.json(cases);
});

app.get("/api/cases/:id", (c) => {
  const caseId = c.req.param("id");
  const evidence = store.getEvidence(caseId);
  const traces = store.getTraces(caseId);
  const briefing = store.getBriefing(caseId);
  return c.json({ case_id: caseId, evidence, traces, briefing });
});

const PORT = 3001;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Sherlock API running on http://localhost:${PORT}`);
});
