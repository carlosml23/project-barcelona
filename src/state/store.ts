import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env.js";
import type { CaseRow, Evidence, Briefing, TraceEvent } from "./types.js";

mkdirSync(dirname(env.SQLITE_PATH), { recursive: true });

const db = new Database(env.SQLITE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS cases (
  case_id TEXT PRIMARY KEY,
  country TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  debt_eur REAL NOT NULL,
  debt_origin TEXT NOT NULL,
  debt_age_months INTEGER NOT NULL,
  call_attempts INTEGER NOT NULL,
  call_outcome TEXT NOT NULL,
  legal_asset_finding TEXT NOT NULL,
  inserted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  identity_match_score REAL NOT NULL,
  signal_type TEXT NOT NULL,
  raw_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);

CREATE TABLE IF NOT EXISTS traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  agent TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_traces_case ON traces(case_id);

CREATE TABLE IF NOT EXISTS briefings (
  case_id TEXT PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
  briefing_json TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
`);

const insertCase = db.prepare(`
INSERT OR REPLACE INTO cases (case_id, country, full_name, phone, debt_eur, debt_origin,
  debt_age_months, call_attempts, call_outcome, legal_asset_finding)
VALUES (@case_id, @country, @full_name, @phone, @debt_eur, @debt_origin,
  @debt_age_months, @call_attempts, @call_outcome, @legal_asset_finding)
`);

const insertEvidence = db.prepare(`
INSERT OR REPLACE INTO evidence (id, case_id, agent, source, url, title, snippet,
  retrieved_at, identity_match_score, signal_type, raw_json)
VALUES (@id, @case_id, @agent, @source, @url, @title, @snippet,
  @retrieved_at, @identity_match_score, @signal_type, @raw_json)
`);

const insertTrace = db.prepare(`
INSERT INTO traces (case_id, ts, agent, kind, message, data_json)
VALUES (@case_id, @ts, @agent, @kind, @message, @data_json)
`);

const insertBriefing = db.prepare(`
INSERT OR REPLACE INTO briefings (case_id, briefing_json, generated_at)
VALUES (?, ?, ?)
`);

export const store = {
  saveCase(row: CaseRow): void {
    insertCase.run({ ...row, phone: row.phone ?? null });
  },
  saveEvidence(e: Evidence): void {
    insertEvidence.run({
      ...e,
      title: e.title ?? null,
      raw_json: e.raw ? JSON.stringify(e.raw) : null,
    });
  },
  saveTrace(t: TraceEvent): void {
    insertTrace.run({
      ...t,
      data_json: t.data ? JSON.stringify(t.data) : null,
    });
  },
  saveBriefing(b: Briefing): void {
    insertBriefing.run(b.case_id, JSON.stringify(b), b.generated_at);
  },
  listCases(): CaseRow[] {
    return db.prepare(`SELECT * FROM cases ORDER BY inserted_at DESC`).all() as CaseRow[];
  },
  getEvidence(case_id: string): Evidence[] {
    const rows = db
      .prepare(`SELECT * FROM evidence WHERE case_id = ?`)
      .all(case_id) as Array<Evidence & { raw_json: string | null }>;
    return rows.map((r) => ({ ...r, raw: r.raw_json ? JSON.parse(r.raw_json) : undefined }));
  },
};
