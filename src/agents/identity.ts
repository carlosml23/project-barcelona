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

export interface DataPoint {
  field: string;
  value: string;
  normalized: string;
  search_variants: string[];
}

export function buildPlaybookCtx(row: CaseRow): PlaybookCtx {
  const prefix = row.phone ? Object.keys(PHONE_COUNTRY_HINTS).find((p) => row.phone!.startsWith(p)) : undefined;
  const dniNorm = row.dni_nie ? normaliseDni(row.dni_nie) : undefined;
  const nameVariants = generateNameVariants(row.full_name);
  return {
    full_name: normaliseName(row.full_name),
    name_variants: nameVariants,
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

  // full_name — always present, including name variants for partial matching
  const nameNorm = normaliseName(row.full_name).toLowerCase();
  const tokens = nameTokens(row.full_name);
  const variants = generateNameVariants(row.full_name);
  points.push({
    field: "full_name",
    value: row.full_name,
    normalized: nameNorm,
    search_variants: [...new Set([nameNorm, ...variants, ...tokens])],
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

// ── Name Variant Generation ─────────────────────────────────────────────────

/**
 * Generate common name variants for Spanish naming conventions.
 *
 * Spanish legal names follow: nombre1 [nombre2] apellido1 [apellido2]
 * People commonly shorten these on social platforms:
 *   "Carlos Sebastian Morales Lascano" → "Carlos Morales Lascano", "Carlos Morales"
 *   "Maria Jose Garcia Fernandez"     → "Maria Garcia Fernandez", "Maria Garcia"
 *
 * Returns lowercased variants (excluding individual tokens — those are added separately).
 */
export function generateNameVariants(fullName: string): string[] {
  const tokens = nameTokens(fullName);
  if (tokens.length <= 2) return [tokens.join(" ")];

  const variants: string[] = [];
  const full = tokens.join(" ");
  variants.push(full);

  if (tokens.length === 3) {
    // Could be: nombre apellido1 apellido2 OR nombre1 nombre2 apellido
    // Generate both interpretations
    const [a, b, c] = tokens;
    variants.push(`${a} ${c}`);  // nombre + apellido2 (if b is middle name)
    variants.push(`${a} ${b}`);  // nombre + apellido1 (if c is apellido2)
  }

  if (tokens.length === 4) {
    // Most likely: nombre1 nombre2 apellido1 apellido2
    const [n1, n2, s1, s2] = tokens;
    variants.push(`${n1} ${s1} ${s2}`);  // drop middle name (most common social usage)
    variants.push(`${n1} ${s1}`);         // first name + first surname
    variants.push(`${n1} ${n2} ${s1}`);   // both first names + first surname
    variants.push(`${n2} ${s1} ${s2}`);   // middle name as first (some people prefer it)
  }

  if (tokens.length >= 5) {
    // Rare but possible: multiple first names or compound surnames
    // Try: first token + last two tokens (likely apellido1 apellido2)
    const first = tokens[0];
    const lastTwo = tokens.slice(-2);
    variants.push(`${first} ${lastTwo.join(" ")}`);
    variants.push(`${first} ${lastTwo[0]}`);
    // Try: first two tokens + last two tokens
    variants.push(`${tokens[0]} ${tokens[1]} ${lastTwo.join(" ")}`);
  }

  // Deduplicate and exclude the full name (already included)
  return [...new Set(variants)];
}
