import type { CaseRow } from "../state/types.js";
import type { PlaybookCtx } from "../playbooks/types.js";

const PHONE_COUNTRY_HINTS: Record<string, string> = {
  "+34": "ES",
  "+351": "PT",
  "+48": "PL",
  "+40": "RO",
  "+49": "DE",
  "+33": "FR",
  "+39": "IT",
};

export function buildPlaybookCtx(row: CaseRow): PlaybookCtx {
  const prefix = row.phone ? Object.keys(PHONE_COUNTRY_HINTS).find((p) => row.phone!.startsWith(p)) : undefined;
  return {
    full_name: normaliseName(row.full_name),
    country: row.country,
    phoneHint: prefix,
  };
}

export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function nameTokens(name: string): string[] {
  return normaliseName(name)
    .toLowerCase()
    .split(" ")
    .filter((t) => t.length >= 2);
}
