import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { CaseRowSchema, type CaseRow } from "../state/types.js";

export function loadCasesFromCsv(path: string): CaseRow[] {
  const raw = readFileSync(path, "utf8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((r) =>
    CaseRowSchema.parse({
      case_id: r.case_id,
      country: r.country?.toUpperCase(),
      debt_eur: Number(r.debt_eur),
      debt_origin: r.debt_origin,
      debt_age_months: Number(r.debt_age_months),
      call_attempts: Number(r.call_attempts),
      call_outcome: r.call_outcome,
      legal_asset_finding: r.legal_asset_finding,
      full_name: r.full_name,
      phone: r.phone || undefined,
    }),
  );
}
