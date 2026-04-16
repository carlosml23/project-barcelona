import Anthropic from "@anthropic-ai/sdk";
import {
  CandidateReportSchema,
  type Candidate,
  type CandidateReport,
  type CaseRow,
  type Evidence,
  type TraceEvent,
} from "../state/types.js";
import { env } from "../config/env.js";
import { newId } from "../util/id.js";
import { extractDataPoints } from "./identity.js";

const MODEL = "claude-haiku-4-5-20251001";

const PAIRING_WEIGHT: Record<string, number> = {
  very_high: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const MIN_EVIDENCE_FOR_CLUSTERING = 3;

// ── Public Interface ────────────────────────────────────────────────────────

export interface ClusterResult {
  report: CandidateReport;
  trace: TraceEvent[];
}

export async function clusterCandidates(
  row: CaseRow,
  evidence: Evidence[],
): Promise<ClusterResult> {
  const trace: TraceEvent[] = [];
  const ts = () => new Date().toISOString();

  // Skip clustering when evidence is too thin
  if (evidence.length < MIN_EVIDENCE_FOR_CLUSTERING) {
    const report = singleCandidateReport(row, evidence);
    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: "clusterer",
      kind: "decision",
      message: `skipped clustering — only ${evidence.length} evidence items (min ${MIN_EVIDENCE_FOR_CLUSTERING})`,
    });
    return { report, trace };
  }

  if (!env.ANTHROPIC_API_KEY) {
    const report = heuristicCluster(row, evidence);
    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: "clusterer",
      kind: "decision",
      message: "ANTHROPIC_API_KEY missing — heuristic clustering",
    });
    return { report, trace };
  }

  try {
    return await llmCluster(row, evidence, trace);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: "clusterer",
      kind: "error",
      message: `LLM clustering failed (${msg}) — falling back to single candidate`,
    });
    return { report: singleCandidateReport(row, evidence), trace };
  }
}

/** Pure function: should we skip interactive selection? */
export function shouldAutoSelect(candidates: Candidate[]): boolean {
  if (candidates.length <= 1) return true;
  const [first, second] = candidates;
  return first.confidence >= 0.75 && first.confidence >= second.confidence * 2;
}

// ── LLM Clustering ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a person-disambiguation agent for a debt-recovery OSINT system.

You are given:
  (1) a case row — debtor name, country, known data points (employer, city, DNI, etc.)
  (2) an Evidence[] array — each item has { id, source, title, snippet, matched_data_points, pairing_confidence }

YOUR TASK:
  Group evidence items by DISTINCT REAL PEOPLE. Evidence about different employers, cities, or roles likely belongs to different people.

RULES:
  • Each evidence item must appear in exactly ONE candidate's evidence_ids (no duplicates, no omissions).
  • Sort candidates by confidence descending (best match to debtor first).
  • Return 1–5 candidates. If all evidence clearly refers to one person, return 1 candidate.
  • For each candidate, provide a human-readable label: "Name — Role/Employer, City" (or "Name — Unknown role, City").
  • Generate 1–3 follow-up questions that would help a human operator distinguish between candidates.
  • Each follow-up question should list which candidate_ids it distinguishes.
  • Output MUST be valid JSON matching the schema below — no prose outside JSON.

JSON schema:
{
  "candidates": [
    {
      "candidate_id": string,
      "label": string,
      "evidence_ids": [string, ...],
      "summary": string,
      "distinguishing_features": [string, ...],
      "confidence": number (0-1),
      "evidence_count": number
    }
  ],
  "follow_up_questions": [
    {
      "question": string,
      "distinguishes": [candidate_id, ...]
    }
  ]
}`;

async function llmCluster(
  row: CaseRow,
  evidence: Evidence[],
  trace: TraceEvent[],
): Promise<ClusterResult> {
  const ts = () => new Date().toISOString();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const dataPoints = extractDataPoints(row).map((dp) => ({
    field: dp.field,
    value: dp.value,
  }));

  const candidateIds = evidence.map(() => newId("cand_"));

  const userPayload = {
    debtor: {
      full_name: row.full_name,
      country: row.country,
      data_points: dataPoints,
    },
    candidate_id_pool: candidateIds.slice(0, 5),
    evidence: evidence.map((e) => ({
      id: e.id,
      source: e.source,
      title: e.title,
      snippet: e.snippet.slice(0, 200),
      matched_data_points: e.matched_data_points,
      pairing_confidence: e.pairing_confidence,
    })),
  };

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "clusterer",
    kind: "tool_call",
    message: `claude.messages.create model=${MODEL} evidence=${evidence.length}`,
  });

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Group the following evidence by distinct people. Use candidate_ids from the pool provided.\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in Claude response");
  }

  const jsonText = extractJson(textBlock.text);
  const raw = JSON.parse(jsonText);

  // Validate and build report
  const validEvidenceIds = new Set(evidence.map((e) => e.id));
  const candidates = validateCandidates(raw.candidates ?? [], validEvidenceIds, evidence);
  const followUpQuestions = Array.isArray(raw.follow_up_questions)
    ? raw.follow_up_questions.filter(
        (q: Record<string, unknown>) => typeof q.question === "string" && Array.isArray(q.distinguishes),
      )
    : [];

  // Ensure any unassigned evidence goes to the top candidate
  const assignedIds = new Set(candidates.flatMap((c) => c.evidence_ids));
  const unassigned = evidence.filter((e) => !assignedIds.has(e.id)).map((e) => e.id);
  if (unassigned.length > 0 && candidates.length > 0) {
    const top = candidates[0];
    candidates[0] = {
      ...top,
      evidence_ids: [...top.evidence_ids, ...unassigned],
      evidence_count: top.evidence_count + unassigned.length,
    };
  }

  const autoSelected = shouldAutoSelect(candidates);
  const report = CandidateReportSchema.parse({
    case_id: row.case_id,
    candidates,
    follow_up_questions: followUpQuestions,
    auto_selected: autoSelected,
    generated_at: new Date().toISOString(),
  });

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "clusterer",
    kind: "decision",
    message: `candidates=${report.candidates.length} auto_selected=${report.auto_selected} top_confidence=${candidates[0]?.confidence.toFixed(2) ?? "N/A"}`,
  });

  return { report, trace };
}

// ── Heuristic Fallback ──────────────────────────────────────────────────────

function heuristicCluster(row: CaseRow, evidence: Evidence[]): CandidateReport {
  // Group evidence by employer if multiple employers detected
  const employerGroups = new Map<string, Evidence[]>();
  const noEmployer: Evidence[] = [];

  for (const e of evidence) {
    const employer = e.matched_data_points.find((dp) => dp === "employer");
    const empFromSnippet = extractEmployerFromSnippet(e, row);
    const key = employer ? "known_employer" : empFromSnippet ?? "unknown";
    const group = employerGroups.get(key) ?? [];
    employerGroups.set(key, [...group, e]);
  }

  // If there's only one group, return single candidate
  if (employerGroups.size <= 1) {
    return singleCandidateReport(row, evidence);
  }

  // Build candidates from groups
  const candidates: Candidate[] = [...employerGroups.entries()]
    .map(([key, group]) => ({
      candidate_id: newId("cand_"),
      label: `${row.full_name} — ${key === "known_employer" ? (row.employer ?? "Known employer") : key === "unknown" ? "Unknown affiliation" : key}`,
      evidence_ids: group.map((e) => e.id),
      summary: `${group.length} evidence items grouped by ${key === "known_employer" ? "matching employer" : "inferred affiliation"}.`,
      distinguishing_features: [key === "known_employer" ? `Employer matches: ${row.employer}` : `Possible affiliation: ${key}`],
      confidence: calculateGroupConfidence(group),
      evidence_count: group.length,
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return {
    case_id: row.case_id,
    candidates,
    follow_up_questions: [],
    auto_selected: shouldAutoSelect(candidates),
    generated_at: new Date().toISOString(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function singleCandidateReport(row: CaseRow, evidence: Evidence[]): CandidateReport {
  const candidate: Candidate = {
    candidate_id: newId("cand_"),
    label: `${row.full_name} — all evidence`,
    evidence_ids: evidence.map((e) => e.id),
    summary: `All ${evidence.length} evidence items assigned to a single candidate.`,
    distinguishing_features: [],
    confidence: calculateGroupConfidence(evidence),
    evidence_count: evidence.length,
  };

  return {
    case_id: row.case_id,
    candidates: [candidate],
    follow_up_questions: [],
    auto_selected: true,
    generated_at: new Date().toISOString(),
  };
}

function calculateGroupConfidence(group: Evidence[]): number {
  if (group.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const e of group) {
    const w = PAIRING_WEIGHT[e.pairing_confidence] ?? 1;
    weightedSum += e.identity_match_score * w;
    totalWeight += w;
  }

  return totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;
}

function validateCandidates(
  raw: Array<Record<string, unknown>>,
  validIds: Set<string>,
  evidence: Evidence[],
): Candidate[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    // Fallback: single candidate with all evidence
    return [
      {
        candidate_id: newId("cand_"),
        label: "All evidence",
        evidence_ids: [...validIds],
        summary: "LLM returned no candidates — all evidence grouped together.",
        distinguishing_features: [],
        confidence: calculateGroupConfidence(evidence),
        evidence_count: evidence.length,
      },
    ];
  }

  return raw
    .filter((c) => Array.isArray(c.evidence_ids) && c.evidence_ids.length > 0)
    .map((c) => {
      const evidenceIds = (c.evidence_ids as string[]).filter((id) => validIds.has(id));
      const group = evidence.filter((e) => evidenceIds.includes(e.id));
      return {
        candidate_id: typeof c.candidate_id === "string" ? c.candidate_id : newId("cand_"),
        label: typeof c.label === "string" ? c.label : "Unknown candidate",
        evidence_ids: evidenceIds,
        summary: typeof c.summary === "string" ? c.summary : "",
        distinguishing_features: Array.isArray(c.distinguishing_features)
          ? (c.distinguishing_features as string[]).filter((f) => typeof f === "string")
          : [],
        confidence: typeof c.confidence === "number" ? Number(c.confidence.toFixed(2)) : calculateGroupConfidence(group),
        evidence_count: evidenceIds.length,
      };
    })
    .filter((c) => c.evidence_ids.length > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found in model output");
  return text.slice(start, end + 1);
}

function extractEmployerFromSnippet(e: Evidence, row: CaseRow): string | undefined {
  if (!row.employer) return undefined;
  const snippet = e.snippet.toLowerCase();
  const employer = row.employer.toLowerCase();
  return snippet.includes(employer) ? row.employer : undefined;
}
