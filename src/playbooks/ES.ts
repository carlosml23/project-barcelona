import type { Playbook, SourceRecipe } from "./types.js";

const recipes: SourceRecipe[] = [
  // ─── Legal / Official (highest priority) ──────────────────────────
  {
    id: "boe_buscon_dni",
    label: "BOE Sede Electrónica — search by DNI",
    signal_type: "legal",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" site:boe.es`,
          includeDomains: ["boe.es"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      if (ctx.dni_no_letter) {
        queries.push({
          query: `"${ctx.dni_no_letter}" "${ctx.full_name}" site:boe.es`,
          includeDomains: ["boe.es"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      return queries;
    },
  },
  {
    id: "boe_buscon_name",
    label: "BOE — search by name (embargos, multas, herencias)",
    signal_type: "legal",
    tool: "tavily",
    can_verify_pairs: [["full_name", "provincia"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" embargo multa herencia site:boe.es`,
        includeDomains: ["boe.es"],
        priority: 2,
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      },
    ],
  },
  {
    id: "bdns_subvenciones",
    label: "BDNS — Base de Datos Nacional de Subvenciones",
    signal_type: "subsidy",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "provincia"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" site:pap.hacienda.gob.es`,
          includeDomains: ["pap.hacienda.gob.es"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" subvención beneficiario ${ctx.provincia ?? ""}`,
        includeDomains: ["pap.hacienda.gob.es", "infosubvenciones.es"],
        priority: ctx.has_dni ? 3 : 2,
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      });
      return queries;
    },
  },
  {
    id: "telemaco_bop",
    label: "Boletines Oficiales Provinciales",
    signal_type: "legal",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "provincia"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" boletín oficial provincial`,
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" boletín oficial ${ctx.provincia ?? ""} edicto notificación`,
        priority: 3,
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      });
      return queries;
    },
  },

  // ─── Property / Registry ──────────────────────────────────────────
  {
    id: "registradores_propiedad",
    label: "Índice Único de la Propiedad — Registradores",
    signal_type: "registry",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" titular propiedad registradores`,
          includeDomains: ["registradores.org", "sede.registradores.org"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" titular propiedad inmueble registro`,
        includeDomains: ["registradores.org", "sede.registradores.org"],
        priority: 3,
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      });
      return queries;
    },
  },
  {
    id: "catastro",
    label: "Sede Electrónica del Catastro",
    signal_type: "asset",
    tool: "tavily",
    can_verify_pairs: [["full_name", "city"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" ${ctx.city ?? ctx.provincia ?? ""} catastro titular`,
        includeDomains: ["sedecatastro.gob.es", "catastro.meh.es"],
        priority: 3,
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  },

  // ─── Business / Mercantile ────────────────────────────────────────
  {
    id: "axesor_dni",
    label: "Axesor — business intelligence by DNI",
    signal_type: "business",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" administrador apoderado site:axesor.es`,
          includeDomains: ["axesor.es"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" administrador empresa site:axesor.es`,
        includeDomains: ["axesor.es"],
        priority: 3,
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      });
      return queries;
    },
  },
  {
    id: "einforma",
    label: "eInforma — company officer search",
    signal_type: "business",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "employer"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" cargo empresa site:einforma.com`,
          includeDomains: ["einforma.com"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" administrador cargo ${ctx.employer ?? ""} site:einforma.com`,
        includeDomains: ["einforma.com"],
        priority: 3,
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      });
      return queries;
    },
  },
  {
    id: "infocif",
    label: "Infocif — company network search",
    signal_type: "business",
    tool: "tavily",
    can_verify_pairs: [["full_name", "employer"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" ${ctx.employer ?? ""} site:infocif.es`,
        includeDomains: ["infocif.es"],
        priority: ctx.has_employer ? 2 : 4,
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      },
    ],
  },
  {
    id: "borme",
    label: "BORME — Boletín Oficial del Registro Mercantil",
    signal_type: "business",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "employer"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" BORME registro mercantil`,
          includeDomains: ["boe.es", "borme.es"],
          priority: 1,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" BORME administrador consejero ${ctx.employer ?? ""}`,
        includeDomains: ["boe.es", "borme.es"],
        priority: 2,
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      });
      return queries;
    },
  },

  // ─── Professional Registries ──────────────────────────────────────
  {
    id: "colegios_medicos",
    label: "CGCOM — Colegio General de Médicos",
    signal_type: "employment",
    tool: "tavily",
    can_verify_pairs: [["full_name", "provincia"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" médico colegiado ${ctx.provincia ?? ""}`,
        includeDomains: ["cgcom.es", "colegiodemedicos.com"],
        priority: 4,
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      },
    ],
  },
  {
    id: "colegios_abogados",
    label: "Abogacía — Colegio de Abogados",
    signal_type: "employment",
    tool: "tavily",
    can_verify_pairs: [["full_name", "provincia"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" abogado colegiado ${ctx.provincia ?? ""}`,
        includeDomains: ["abogacia.es", "icam.es", "reicaz.org"],
        priority: 4,
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      },
    ],
  },

  // ─── Phone / Email Verification ───────────────────────────────────
  {
    id: "tellows_phone",
    label: "Tellows.es — reverse phone lookup",
    signal_type: "social",
    tool: "tavily",
    can_verify_pairs: [["full_name", "phone"]],
    buildQueries: (ctx) => {
      if (!ctx.phone) return [];
      const digits = ctx.phone.replace(/[\s\-\(\)]/g, "");
      return [
        {
          query: `"${digits}" site:tellows.es`,
          includeDomains: ["tellows.es"],
          priority: 3,
          requires_fields: ["phone"],
          target_pairs: [["full_name", "phone"]],
        },
      ];
    },
  },
  {
    id: "listaspam_phone",
    label: "Listaspam — phone database",
    signal_type: "social",
    tool: "tavily",
    can_verify_pairs: [["full_name", "phone"]],
    buildQueries: (ctx) => {
      if (!ctx.phone) return [];
      const digits = ctx.phone.replace(/[\s\-\(\)]/g, "");
      return [
        {
          query: `"${digits}" site:listaspam.com`,
          includeDomains: ["listaspam.com"],
          priority: 3,
          requires_fields: ["phone"],
          target_pairs: [["full_name", "phone"]],
        },
      ];
    },
  },

  // ─── Employment / Social ──────────────────────────────────────────
  {
    id: "linkedin_es",
    label: "LinkedIn profile (Spain)",
    signal_type: "employment",
    tool: "exa",
    can_verify_pairs: [["full_name", "employer"], ["full_name", "city"]],
    buildQueries: (ctx) => {
      // Search with each name variant — people often use shortened names on LinkedIn
      // e.g., "Carlos Morales Lascano" instead of "Carlos Sebastian Morales Lascano"
      const location = ctx.city ?? "Spain";
      const employer = ctx.employer ?? "";
      const seen = new Set<string>();
      const queries = [];

      for (const variant of ctx.name_variants) {
        const q = `${variant} ${employer} ${location} site:linkedin.com/in`.replace(/\s+/g, " ").trim();
        if (seen.has(q)) continue;
        seen.add(q);
        queries.push({
          query: q,
          includeDomains: ["linkedin.com"],
          priority: variant === ctx.full_name.toLowerCase() ? 2 : 3,
          requires_fields: [],
          target_pairs: [["full_name", "employer"], ["full_name", "city"]],
        });
      }
      return queries;
    },
  },
  {
    id: "linkedin_es_web",
    label: "LinkedIn profile via web search (name variants)",
    signal_type: "employment",
    tool: "tavily",
    can_verify_pairs: [["full_name", "employer"], ["full_name", "city"]],
    buildQueries: (ctx) => {
      // Tavily web search catches LinkedIn profiles that Exa's neural search misses.
      // Use the shortened name variant (most common on social platforms).
      const shortVariant = ctx.name_variants.find((v) => v !== ctx.full_name.toLowerCase()) ?? ctx.full_name;
      const location = ctx.city ?? "Spain";
      return [
        {
          query: `"${shortVariant}" ${location} site:linkedin.com/in`,
          includeDomains: ["linkedin.com"],
          priority: 3,
          requires_fields: [],
          target_pairs: [["full_name", "employer"], ["full_name", "city"]],
        },
      ];
    },
  },
  {
    id: "dateas",
    label: "Dateas España — aggregated records",
    signal_type: "other",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "city"]],
    buildQueries: (ctx) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" site:dateas.com`,
          includeDomains: ["dateas.com"],
          priority: 2,
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" España site:dateas.com`,
        includeDomains: ["dateas.com"],
        priority: 4,
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      });
      return queries;
    },
  },
];

export const ES: Playbook = {
  country: "ES",
  label: "Spain",
  recipes,
};
