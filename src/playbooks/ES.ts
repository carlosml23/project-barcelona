import type { Playbook } from "./types.js";

export const ES: Playbook = {
  country: "ES",
  label: "Spain",
  recipes: [
    {
      id: "linkedin_es",
      label: "LinkedIn profile (Spain)",
      signal_type: "employment",
      tool: "exa",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} site:linkedin.com/in current role Spain`,
        includeDomains: ["linkedin.com"],
      }),
    },
    {
      id: "borme",
      label: "BORME — Boletín Oficial del Registro Mercantil",
      signal_type: "business",
      tool: "tavily",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} BORME administrador único consejero`,
        includeDomains: ["boe.es", "borme.es"],
      }),
    },
    {
      id: "infoempresa",
      label: "Infoempresa / eInforma directorship lookup",
      signal_type: "business",
      tool: "tavily",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} administrador cargo directivo empresa España`,
        includeDomains: ["infoempresa.com", "einforma.com", "axesor.es", "empresia.es"],
      }),
    },
    {
      id: "registro_propiedad",
      label: "Registro de la Propiedad — index search",
      signal_type: "asset",
      tool: "tavily",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} titular propiedad inmueble registro`,
        includeDomains: ["registradores.org", "sede.registradores.org"],
      }),
    },
    {
      id: "boe_news",
      label: "BOE / local news mentions",
      signal_type: "news",
      tool: "tavily",
      buildQuery: ({ full_name, city }) => ({
        query: `"${full_name}" ${city ?? "España"} noticia`,
      }),
    },
    {
      id: "social_general",
      label: "Public social & blog presence",
      signal_type: "social",
      tool: "exa",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} Instagram Facebook Twitter perfil público`,
        includeDomains: ["instagram.com", "facebook.com", "twitter.com", "x.com"],
      }),
    },
    {
      id: "domain_whois",
      label: "Domain / business web presence",
      signal_type: "business",
      tool: "exa",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} empresa sitio web oficial contacto`,
      }),
    },
  ],
};
