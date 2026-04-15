import { z } from "zod";

export const CallOutcome = z.enum([
  "not_debtor",
  "busy",
  "rings_out",
  "voicemail",
  "answered_refused",
  "answered_negotiating",
  "wrong_number",
  "invalid_number",
  "unknown",
]);

export const LegalAssetFinding = z.enum([
  "no_assets_found",
  "assets_not_seizable",
  "assets_found",
  "pending",
  "unknown",
]);

export const DebtOrigin = z.enum([
  "personal_loan",
  "telecom",
  "consumer_loan",
  "credit_card",
  "utilities",
  "auto_loan",
  "sme_loan",
  "utility",
  "other",
]);

export const SignalType = z.enum([
  "employment",
  "business",
  "asset",
  "social",
  "news",
  "legal",
  "registry",
  "subsidy",
  "other",
]);
export type SignalType = z.infer<typeof SignalType>;

export const PairingConfidence = z.enum(["low", "medium", "high", "very_high"]);
export type PairingConfidence = z.infer<typeof PairingConfidence>;

export const CaseRowSchema = z.object({
  case_id: z.string(),
  country: z.string().length(2),
  debt_eur: z.number().nonnegative(),
  debt_origin: DebtOrigin,
  debt_age_months: z.number().int().nonnegative(),
  call_attempts: z.number().int().nonnegative(),
  call_outcome: CallOutcome,
  legal_asset_finding: LegalAssetFinding,
  full_name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  dni_nie: z.string().optional(),
  provincia: z.string().optional(),
  employer: z.string().optional(),
  autonomo: z.boolean().optional(),
  bank_account: z.string().optional(),
  vida_laboral: z.boolean().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
});
export type CaseRow = z.infer<typeof CaseRowSchema>;

export const EvidenceSchema = z.object({
  id: z.string(),
  case_id: z.string(),
  agent: z.string(),
  source: z.string(),
  url: z.string().url(),
  title: z.string().optional(),
  snippet: z.string(),
  retrieved_at: z.string(),
  identity_match_score: z.number().min(0).max(1),
  signal_type: SignalType,
  matched_data_points: z.array(z.string()).default([]),
  pairing_confidence: PairingConfidence.default("low"),
  raw: z.unknown().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const GapSchema = z.object({
  what_we_tried: z.string(),
  why_not_found: z.string(),
  sources_checked: z.array(z.string()),
});
export type Gap = z.infer<typeof GapSchema>;

export const FindingSchema = z.object({
  claim: z.string(),
  evidence_ids: z.array(z.string()).min(1),
  signal_type: SignalType,
  confidence: z.enum(["low", "medium", "high"]),
});
export type Finding = z.infer<typeof FindingSchema>;

export const BriefingSchema = z.object({
  case_id: z.string(),
  summary: z.string(),
  findings: z.array(FindingSchema),
  negotiation_angles: z.array(z.string()),
  gaps: z.array(GapSchema),
  overall_confidence: z.enum(["low", "medium", "high"]),
  generated_at: z.string(),
});
export type Briefing = z.infer<typeof BriefingSchema>;

export const TraceEventSchema = z.object({
  ts: z.string(),
  case_id: z.string(),
  agent: z.string(),
  kind: z.enum(["plan", "tool_call", "tool_result", "decision", "error"]),
  message: z.string(),
  data: z.unknown().optional(),
});
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const CaseStateSchema = z.object({
  case: CaseRowSchema,
  evidence: z.array(EvidenceSchema),
  trace: z.array(TraceEventSchema),
  briefing: BriefingSchema.nullable(),
});
export type CaseState = z.infer<typeof CaseStateSchema>;
