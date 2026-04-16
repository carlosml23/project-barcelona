/** Human-readable labels for raw agent IDs used in trace events */
const AGENT_LABELS: Record<string, string> = {
  // Spain — legal / official
  boe_buscon_dni: "BOE — DNI Search",
  boe_buscon_name: "BOE — Name Search",
  bdns_subvenciones: "BDNS Subsidies",
  telemaco_bop: "Telemaco BOP",
  registradores_propiedad: "Property Registry",
  catastro: "Catastro",
  borme: "BORME",

  // Spain — business info
  axesor_dni: "Axesor Company Info",
  einforma: "eInforma",
  infocif: "InfoCIF",

  // Professional registries
  colegios_medicos: "Medical Registry",
  colegios_abogados: "Bar Association",

  // Phone / reputation
  tellows_phone: "Tellows Phone Lookup",
  listaspam_phone: "ListaSpam Phone",

  // Social / employment
  linkedin_es: "LinkedIn (Spain)",
  linkedin_generic: "LinkedIn",
  dateas: "Dateas",

  // Generic
  web_general: "Web Search",
  news_generic: "News Search",
  social_generic: "Social Search",
  discovery: "Agentic Discovery",

  // Pipeline agents
  orchestrator: "Orchestrator",
  verifier: "Identity Verifier",
  refiner: "Evidence Refiner",
  synthesiser: "Report Generator",
};

/** Returns a human-readable label for an agent ID. Falls back to title-casing the ID. */
export function getAgentLabel(agentId: string): string {
  return AGENT_LABELS[agentId] ?? agentId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
