import type { SignalType } from "../state/types.js";

export interface QueryVariant {
  query: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  priority: number;
  requires_fields: string[];
  target_pairs: string[][];
}

export interface SourceRecipe {
  id: string;
  label: string;
  signal_type: SignalType;
  tool: "exa" | "tavily" | "firecrawl";
  can_verify_pairs: string[][];
  buildQueries: (ctx: PlaybookCtx) => QueryVariant[];
}

export type SearchGoal = "find_direct_contact" | "find_external_contact" | "balanced";

export interface PlaybookCtx {
  full_name: string;
  /** Common name variants for search (e.g., dropping middle name for Spanish names). */
  name_variants: string[];
  country: string;
  city?: string;
  postal_code?: string;
  phoneHint?: string;
  phone?: string;
  email?: string;
  dni_nie?: string;
  dni_no_letter?: string;
  provincia?: string;
  employer?: string;
  autonomo?: boolean;
  has_dni: boolean;
  has_email: boolean;
  has_phone: boolean;
  has_employer: boolean;
  search_goal: SearchGoal;
  call_outcome: string;
  debt_origin: string;
  debt_eur: number;
}

export interface Playbook {
  country: string;
  label: string;
  recipes: SourceRecipe[];
}
