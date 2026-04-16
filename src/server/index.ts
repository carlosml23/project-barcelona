import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { parse } from "csv-parse/sync";
import { CaseRowSchema, type TraceEvent } from "../state/types.js";
import { runCase } from "../orchestrator/graph.js";
import { store } from "../state/store.js";
import { newId } from "../util/id.js";

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

const CaseFormSchema = CaseRowSchema.omit({ case_id: true });

app.post("/api/batch/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No CSV file provided" }, 400);
  }

  const text = await file.text();

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    return c.json({ error: `CSV parse error: ${String(err)}` }, 400);
  }

  const results = records.map((r, i) => {
    try {
      const data = CaseFormSchema.parse({
        country: r.country?.toUpperCase(),
        debt_eur: Number(r.debt_eur),
        debt_origin: r.debt_origin,
        debt_age_months: Number(r.debt_age_months),
        call_attempts: Number(r.call_attempts),
        call_outcome: r.call_outcome,
        legal_asset_finding: r.legal_asset_finding,
        full_name: r.full_name,
        phone: r.phone || undefined,
        email: r.email || undefined,
        dni_nie: r.dni_nie || undefined,
        provincia: r.provincia || undefined,
        employer: r.employer || undefined,
        autonomo: r.autonomo === "true" ? true : r.autonomo === "false" ? false : undefined,
        city: r.city || undefined,
        postal_code: r.postal_code || undefined,
      });
      return { row: i + 1, data };
    } catch (err) {
      return { row: i + 1, error: String(err) };
    }
  });

  const valid = results.filter((r) => "data" in r).length;
  const errors = results.filter((r) => "error" in r);

  return c.json({ total: records.length, valid, errors, results });
});

const PORT = 3001;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Sherlock API running on http://localhost:${PORT}`);
});
