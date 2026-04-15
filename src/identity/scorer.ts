import type { PairingConfidence } from "../state/types.js";
import type { DataPoint } from "../agents/identity.js";

// ── Public Interface ─────────────────────────────────────────────────────────

export interface ScoreResult {
  /** Weighted composite score 0–1. */
  total: number;
  /** Fields from the case that matched in the evidence text. */
  matchedFields: string[];
  /** Target pairs where both fields were confirmed in the text. */
  matchedPairs: string[][];
  /** Overall identity confidence based on which pairs matched. */
  pairingConfidence: PairingConfidence;
}

/**
 * Score a piece of evidence against the debtor's known data points.
 *
 * Uses accent-normalized, case-insensitive matching for each DataPoint's
 * search_variants. Computes pairing confidence from which target_pairs
 * have both fields confirmed.
 */
export function scoreEvidence(
  dataPoints: DataPoint[],
  text: string,
  targetPairs: string[][],
  source: string,
): ScoreResult {
  const normalizedText = normalizeAccents(text.toLowerCase());
  const matchedFields = findMatchedFields(dataPoints, normalizedText);
  const matchedPairs = findMatchedPairs(targetPairs, matchedFields);
  const pairingConfidence = computePairingConfidence(matchedFields, matchedPairs);
  const total = computeTotal(matchedFields, dataPoints, matchedPairs, source);

  return { total, matchedFields, matchedPairs, pairingConfidence };
}

// ── Field Matching ───────────────────────────────────────────────────────────

function findMatchedFields(dataPoints: DataPoint[], normalizedText: string): string[] {
  const matched: string[] = [];
  for (const dp of dataPoints) {
    if (fieldMatches(dp, normalizedText)) {
      matched.push(dp.field);
    }
  }
  return matched;
}

function fieldMatches(dp: DataPoint, normalizedText: string): boolean {
  for (const variant of dp.search_variants) {
    const normalizedVariant = normalizeAccents(variant.toLowerCase());
    if (normalizedVariant.length < 2) continue;
    if (normalizedText.includes(normalizedVariant)) return true;
  }
  return false;
}

// ── Pair Matching ────────────────────────────────────────────────────────────

function findMatchedPairs(targetPairs: string[][], matchedFields: string[]): string[][] {
  const fieldSet = new Set(matchedFields);
  return targetPairs.filter((pair) => pair.every((f) => fieldSet.has(f)));
}

// ── Pairing Confidence ───────────────────────────────────────────────────────

function computePairingConfidence(
  matchedFields: string[],
  matchedPairs: string[][],
): PairingConfidence {
  const fieldSet = new Set(matchedFields);

  // DNI match is authoritative — unique identifier
  if (fieldSet.has("dni_nie")) return "very_high";

  // Two strong identifiers confirmed together
  if (matchedPairs.length >= 2) return "very_high";

  // Name + phone is a strong pair
  if (fieldSet.has("full_name") && fieldSet.has("phone")) return "high";

  // Name + employer or name + email
  if (fieldSet.has("full_name") && (fieldSet.has("employer") || fieldSet.has("email"))) return "high";

  // Any confirmed pair
  if (matchedPairs.length >= 1) return "medium";

  // Name + location
  if (fieldSet.has("full_name") && (fieldSet.has("city") || fieldSet.has("provincia"))) return "medium";

  // Name alone
  if (fieldSet.has("full_name")) return "low";

  return "low";
}

// ── Score Calculation ────────────────────────────────────────────────────────

/** Source authority bonuses — higher for official government sources. */
const SOURCE_AUTHORITY: Record<string, number> = {
  "boe.es": 0.10,
  "borme.es": 0.10,
  "sede.registradores.org": 0.10,
  "registradores.org": 0.10,
  "sedecatastro.gob.es": 0.10,
  "pap.hacienda.gob.es": 0.10,
  "einforma.com": 0.08,
  "axesor.es": 0.08,
  "infoempresa.com": 0.08,
  "infocif.es": 0.08,
  "empresia.es": 0.08,
  "linkedin.com": 0.05,
  "www.linkedin.com": 0.05,
  "dateas.com": 0.03,
};

/** Field weights — how much each field contributes to the total score. */
const FIELD_WEIGHTS: Record<string, number> = {
  full_name: 0.30,
  dni_nie: 0.30,
  phone: 0.10,
  email: 0.08,
  employer: 0.08,
  city: 0.04,
  provincia: 0.04,
  postal_code: 0.03,
};

const MAX_FIELD_WEIGHT = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);

function computeTotal(
  matchedFields: string[],
  dataPoints: DataPoint[],
  matchedPairs: string[][],
  source: string,
): number {
  const fieldSet = new Set(matchedFields);

  // DNI match floor — a unique identifier match guarantees a high score
  if (fieldSet.has("dni_nie")) {
    const authorityBonus = SOURCE_AUTHORITY[source] ?? 0;
    return Math.min(1, 0.85 + authorityBonus);
  }

  // Sum of weights for fields that matched
  const fieldScore = matchedFields.reduce((sum, f) => sum + (FIELD_WEIGHTS[f] ?? 0.02), 0);

  // Normalize by the total weight of fields that were AVAILABLE (not all possible fields)
  const availableWeight = dataPoints.reduce((sum, dp) => sum + (FIELD_WEIGHTS[dp.field] ?? 0.02), 0);
  const normalizedFieldScore = availableWeight > 0 ? fieldScore / availableWeight : 0;

  // Pair bonus: each confirmed pair adds a small bonus
  const pairBonus = Math.min(0.15, matchedPairs.length * 0.05);

  // Source authority bonus
  const authorityBonus = SOURCE_AUTHORITY[source] ?? 0;

  return Math.min(1, normalizedFieldScore + pairBonus + authorityBonus);
}

// ── Text Normalization ───────────────────────────────────────────────────────

/** Strip accents: García → Garcia, José → Jose */
function normalizeAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
