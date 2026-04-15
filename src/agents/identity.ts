import type { CaseRow } from "../state/types.js";
import type { PlaybookCtx, SearchGoal } from "../playbooks/types.js";

export type { SearchGoal } from "../playbooks/types.js";

export function deriveSearchGoal(call_outcome: string): SearchGoal {
  if (["not_debtor", "invalid_number", "wrong_number"].includes(call_outcome))
    return "find_direct_contact";
  if (["rings_out", "busy", "voicemail", "answered_refused"].includes(call_outcome))
    return "find_external_contact";
  return "balanced";
}

const PHONE_COUNTRY_HINTS: Record<string, string> = {
  "+34": "ES",
  "+351": "PT",
  "+48": "PL",
  "+40": "RO",
  "+49": "DE",
  "+33": "FR",
  "+39": "IT",
};

export interface DataPoint {
  field: string;
  value: string;
  normalized: string;
  search_variants: string[];
}

export function buildPlaybookCtx(row: CaseRow): PlaybookCtx {
  const prefix = row.phone ? Object.keys(PHONE_COUNTRY_HINTS).find((p) => row.phone!.startsWith(p)) : undefined;
  const dniNorm = row.dni_nie ? normaliseDni(row.dni_nie) : undefined;
  return {
    full_name: normaliseName(row.full_name),
    country: row.country,
    phoneHint: prefix,
    phone: row.phone,
    email: row.email ? normaliseEmail(row.email) : undefined,
    dni_nie: dniNorm,
    dni_no_letter: dniNorm ? extractDniWithoutLetter(dniNorm) : undefined,
    provincia: row.provincia,
    employer: row.employer ? normaliseEmployer(row.employer) : undefined,
    autonomo: row.autonomo,
    city: row.city,
    postal_code: row.postal_code,
    has_dni: !!row.dni_nie,
    has_email: !!row.email,
    has_phone: !!row.phone,
    has_employer: !!row.employer,
    search_goal: deriveSearchGoal(row.call_outcome),
    call_outcome: row.call_outcome,
    debt_origin: row.debt_origin,
    debt_eur: row.debt_eur,
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

export function normaliseDni(dni: string): string {
  return dni.replace(/[\s\-]/g, "").toUpperCase();
}

export function extractDniWithoutLetter(dni: string): string {
  const norm = normaliseDni(dni);
  // DNI: 8 digits + letter → return just digits
  const dniMatch = norm.match(/^(\d{8})[A-Z]$/);
  if (dniMatch) return dniMatch[1];
  // NIE: X/Y/Z + 7 digits + letter → return letter + digits
  const nieMatch = norm.match(/^([XYZ]\d{7})[A-Z]$/);
  if (nieMatch) return nieMatch[1];
  return norm;
}

export function validateDni(dni: string): boolean {
  const norm = normaliseDni(dni);
  // DNI: 8 digits + letter
  if (/^\d{8}[A-Z]$/.test(norm)) return true;
  // NIE: X/Y/Z + 7 digits + letter
  if (/^[XYZ]\d{7}[A-Z]$/.test(norm)) return true;
  return false;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normaliseEmployer(employer: string): string {
  return employer
    .trim()
    .replace(/\s*,?\s*(S\.?L\.?U?\.?|S\.?A\.?|S\.?L\.?L?\.?|S\.?C\.?|S\.?COOP\.?)$/i, "")
    .trim();
}

export function extractDataPoints(row: CaseRow): DataPoint[] {
  const points: DataPoint[] = [];

  // full_name — always present
  const nameNorm = normaliseName(row.full_name).toLowerCase();
  const tokens = nameTokens(row.full_name);
  points.push({
    field: "full_name",
    value: row.full_name,
    normalized: nameNorm,
    search_variants: [nameNorm, ...tokens],
  });

  if (row.phone) {
    const digits = row.phone.replace(/[\s\-\(\)]/g, "");
    const local = digits.startsWith("+34") ? digits.slice(3) : digits;
    const spaced = local.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
    points.push({
      field: "phone",
      value: row.phone,
      normalized: digits,
      search_variants: [digits, local, spaced, digits.replace("+", "")].filter(Boolean),
    });
  }

  if (row.email) {
    const norm = normaliseEmail(row.email);
    points.push({
      field: "email",
      value: row.email,
      normalized: norm,
      search_variants: [norm],
    });
  }

  if (row.dni_nie) {
    const norm = normaliseDni(row.dni_nie);
    const noLetter = extractDniWithoutLetter(norm);
    const variants = [norm, noLetter];
    // Add hyphenated variant: 12345678-Z
    if (/^\d{8}[A-Z]$/.test(norm)) {
      variants.push(norm.slice(0, 8) + "-" + norm.slice(8));
    }
    points.push({
      field: "dni_nie",
      value: row.dni_nie,
      normalized: norm,
      search_variants: [...new Set(variants)],
    });
  }

  if (row.employer) {
    const norm = normaliseEmployer(row.employer).toLowerCase();
    points.push({
      field: "employer",
      value: row.employer,
      normalized: norm,
      search_variants: [norm, row.employer.trim().toLowerCase()],
    });
  }

  if (row.city) {
    points.push({
      field: "city",
      value: row.city,
      normalized: row.city.toLowerCase(),
      search_variants: [row.city.toLowerCase()],
    });
  }

  if (row.provincia) {
    points.push({
      field: "provincia",
      value: row.provincia,
      normalized: row.provincia.toLowerCase(),
      search_variants: [row.provincia.toLowerCase()],
    });
  }

  if (row.postal_code) {
    points.push({
      field: "postal_code",
      value: row.postal_code,
      normalized: row.postal_code,
      search_variants: [row.postal_code],
    });
  }

  return points;
}
