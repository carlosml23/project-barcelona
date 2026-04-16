/** Human-readable labels for each agent, shown in the live investigation steps. */
export const STEP_LABELS: Record<string, string> = {
  // Search agents — Spain playbook
  boe_buscon_dni: "Searching Spanish official gazette (BOE)",
  boe_buscon_name: "Searching BOE by name",
  bdns_subvenciones: "Checking public subsidies registry",
  telemaco_bop: "Searching official provincial bulletins",
  registradores_propiedad: "Searching property registry",
  catastro: "Checking land registry (Catastro)",
  axesor_dni: "Checking Axesor business registry",
  einforma: "Searching Einforma company records",
  infocif: "Checking Infocif business directory",
  borme: "Searching BORME (company filings)",
  colegios_medicos: "Checking medical professional registry",
  colegios_abogados: "Checking legal professional registry",

  // Search agents — generic / cross-country
  linkedin_es: "Searching LinkedIn profiles",
  linkedin_generic: "Searching LinkedIn profiles",
  tellows_phone: "Checking phone reputation (Tellows)",
  listaspam_phone: "Checking spam phone database",
  dateas: "Searching Dateas public records",
  web_general: "Searching the web",
  news_generic: "Searching news articles",
  social_generic: "Searching social media",

  // Agentic discovery
  discovery: "Broad web discovery search",

  // Pipeline stages
  verifier: "Verifying identity matches",
  refiner: "Deep-diving into leads",
  clusterer: "Grouping evidence by candidate",
  synthesiser: "Building your briefing",
};

/** Pipeline stage agent IDs (order matters — reflects pipeline order). */
export const PIPELINE_STAGES = ["verifier", "refiner", "clusterer", "synthesiser"] as const;

export function getStepLabel(agent: string): string {
  return STEP_LABELS[agent] ?? `Searching ${agent.replace(/_/g, " ")}`;
}
