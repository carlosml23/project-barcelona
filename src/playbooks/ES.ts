import type { Playbook, SourceRecipe, PlaybookCtx, SearchGoal } from "./types.js";

type GoalAffinity = "direct" | "external" | "both";

function goalPriority(base: number, affinity: GoalAffinity, goal: SearchGoal): number {
  if (goal === "balanced") return base;
  if (
    (goal === "find_direct_contact" && affinity === "direct") ||
    (goal === "find_external_contact" && affinity === "external") ||
    affinity === "both"
  ) {
    return Math.max(1, base - 1);
  }
  return base + 2;
}

function buildRecipe(
  base: Omit<SourceRecipe, "buildQueries">,
  affinity: GoalAffinity,
  buildFn: (ctx: PlaybookCtx, gp: (base: number) => number) => ReturnType<SourceRecipe["buildQueries"]>,
): SourceRecipe {
  return {
    ...base,
    buildQueries: (ctx) => {
      const gp = (b: number) => goalPriority(b, affinity, ctx.search_goal);
      return buildFn(ctx, gp);
    },
  };
}

const recipes: SourceRecipe[] = [
  // ─── Legal / Official (highest priority) ──────────────────────────
  buildRecipe(
    {
      id: "boe_buscon_dni",
      label: "BOE Sede Electrónica — search by DNI",
      signal_type: "legal",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"]],
    },
    "both",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" site:boe.es`,
          includeDomains: ["boe.es"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      if (ctx.dni_no_letter) {
        queries.push({
          query: `"${ctx.dni_no_letter}" "${ctx.full_name}" site:boe.es`,
          includeDomains: ["boe.es"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      return queries;
    },
  ),
  buildRecipe(
    {
      id: "boe_buscon_name",
      label: "BOE — search by name (embargos, multas, herencias)",
      signal_type: "legal",
      tool: "tavily",
      can_verify_pairs: [["full_name", "provincia"]],
    },
    "both",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" embargo multa herencia site:boe.es`,
        includeDomains: ["boe.es"],
        priority: gp(2),
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      },
    ],
  ),
  buildRecipe(
    {
      id: "bdns_subvenciones",
      label: "BDNS — Base de Datos Nacional de Subvenciones",
      signal_type: "subsidy",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "provincia"]],
    },
    "both",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" site:pap.hacienda.gob.es`,
          includeDomains: ["pap.hacienda.gob.es"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" subvención beneficiario ${ctx.provincia ?? ""}`,
        includeDomains: ["pap.hacienda.gob.es", "infosubvenciones.es"],
        priority: gp(ctx.has_dni ? 3 : 2),
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      });
      return queries;
    },
  ),
  buildRecipe(
    {
      id: "telemaco_bop",
      label: "Boletines Oficiales Provinciales",
      signal_type: "legal",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "provincia"]],
    },
    "both",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" boletín oficial provincial`,
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" boletín oficial ${ctx.provincia ?? ""} edicto notificación`,
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      });
      return queries;
    },
  ),

  // ─── Property / Registry ──────────────────────────────────────────
  buildRecipe(
    {
      id: "registradores_propiedad",
      label: "Índice Único de la Propiedad — Registradores",
      signal_type: "registry",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"]],
    },
    "both",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" titular propiedad registradores`,
          includeDomains: ["registradores.org", "sede.registradores.org"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" titular propiedad inmueble registro`,
        includeDomains: ["registradores.org", "sede.registradores.org"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      });
      return queries;
    },
  ),
  buildRecipe(
    {
      id: "catastro",
      label: "Sede Electrónica del Catastro",
      signal_type: "asset",
      tool: "tavily",
      can_verify_pairs: [["full_name", "city"]],
    },
    "both",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" ${ctx.city ?? ctx.provincia ?? ""} catastro titular`,
        includeDomains: ["sedecatastro.gob.es", "catastro.meh.es"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  ),

  // ─── Business / Mercantile ────────────────────────────────────────
  buildRecipe(
    {
      id: "axesor_dni",
      label: "Axesor — business intelligence by DNI",
      signal_type: "business",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"]],
    },
    "external",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" administrador apoderado site:axesor.es`,
          includeDomains: ["axesor.es"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" administrador empresa site:axesor.es`,
        includeDomains: ["axesor.es"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      });
      return queries;
    },
  ),
  buildRecipe(
    {
      id: "einforma",
      label: "eInforma — company officer search",
      signal_type: "business",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "employer"]],
    },
    "external",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" cargo empresa site:einforma.com`,
          includeDomains: ["einforma.com"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" administrador cargo ${ctx.employer ?? ""} site:einforma.com`,
        includeDomains: ["einforma.com"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      });
      return queries;
    },
  ),
  buildRecipe(
    {
      id: "infocif",
      label: "Infocif — company network search",
      signal_type: "business",
      tool: "tavily",
      can_verify_pairs: [["full_name", "employer"]],
    },
    "external",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" ${ctx.employer ?? ""} site:infocif.es`,
        includeDomains: ["infocif.es"],
        priority: gp(ctx.has_employer ? 2 : 4),
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      },
    ],
  ),
  buildRecipe(
    {
      id: "borme",
      label: "BORME — Boletín Oficial del Registro Mercantil",
      signal_type: "business",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "employer"]],
    },
    "external",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" BORME registro mercantil`,
          includeDomains: ["boe.es", "borme.es"],
          priority: gp(1),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" BORME administrador consejero ${ctx.employer ?? ""}`,
        includeDomains: ["boe.es", "borme.es"],
        priority: gp(2),
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      });
      return queries;
    },
  ),

  // ─── Professional Registries ──────────────────────────────────────
  buildRecipe(
    {
      id: "colegios_medicos",
      label: "CGCOM — Colegio General de Médicos",
      signal_type: "employment",
      tool: "tavily",
      can_verify_pairs: [["full_name", "provincia"]],
    },
    "external",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" médico colegiado ${ctx.provincia ?? ""}`,
        includeDomains: ["cgcom.es", "colegiodemedicos.com"],
        priority: gp(4),
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      },
    ],
  ),
  buildRecipe(
    {
      id: "colegios_abogados",
      label: "Abogacía — Colegio de Abogados",
      signal_type: "employment",
      tool: "tavily",
      can_verify_pairs: [["full_name", "provincia"]],
    },
    "external",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" abogado colegiado ${ctx.provincia ?? ""}`,
        includeDomains: ["abogacia.es", "icam.es", "reicaz.org"],
        priority: gp(4),
        requires_fields: [],
        target_pairs: [["full_name", "provincia"]],
      },
    ],
  ),

  // ─── Phone / Email Verification ───────────────────────────────────
  buildRecipe(
    {
      id: "tellows_phone",
      label: "Tellows.es — reverse phone lookup",
      signal_type: "social",
      tool: "tavily",
      can_verify_pairs: [["full_name", "phone"]],
    },
    "direct",
    (ctx, gp) => {
      if (!ctx.phone) return [];
      const digits = ctx.phone.replace(/[\s\-\(\)]/g, "");
      return [
        {
          query: `"${digits}" site:tellows.es`,
          includeDomains: ["tellows.es"],
          priority: gp(3),
          requires_fields: ["phone"],
          target_pairs: [["full_name", "phone"]],
        },
      ];
    },
  ),
  buildRecipe(
    {
      id: "listaspam_phone",
      label: "Listaspam — phone database",
      signal_type: "social",
      tool: "tavily",
      can_verify_pairs: [["full_name", "phone"]],
    },
    "direct",
    (ctx, gp) => {
      if (!ctx.phone) return [];
      const digits = ctx.phone.replace(/[\s\-\(\)]/g, "");
      return [
        {
          query: `"${digits}" site:listaspam.com`,
          includeDomains: ["listaspam.com"],
          priority: gp(3),
          requires_fields: ["phone"],
          target_pairs: [["full_name", "phone"]],
        },
      ];
    },
  ),

  // ─── Social Media (direct contact discovery) ──────────────────────
  buildRecipe(
    {
      id: "social_facebook_es",
      label: "Facebook — social profile search",
      signal_type: "social",
      tool: "exa",
      can_verify_pairs: [["full_name", "city"]],
    },
    "direct",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" ${ctx.city ?? ctx.provincia ?? "España"} site:facebook.com`,
        includeDomains: ["facebook.com"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  ),
  buildRecipe(
    {
      id: "social_instagram_es",
      label: "Instagram — social profile search",
      signal_type: "social",
      tool: "exa",
      can_verify_pairs: [["full_name", "city"]],
    },
    "direct",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" ${ctx.city ?? ctx.provincia ?? "España"} site:instagram.com`,
        includeDomains: ["instagram.com"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  ),
  buildRecipe(
    {
      id: "social_twitter_es",
      label: "Twitter/X — social profile search",
      signal_type: "social",
      tool: "exa",
      can_verify_pairs: [["full_name", "city"]],
    },
    "direct",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" ${ctx.city ?? ctx.provincia ?? "España"} site:x.com OR site:twitter.com`,
        includeDomains: ["x.com", "twitter.com"],
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  ),
  buildRecipe(
    {
      id: "google_contact",
      label: "Google — contact info search",
      signal_type: "social",
      tool: "tavily",
      can_verify_pairs: [["full_name", "city"]],
    },
    "direct",
    (ctx, gp) => [
      {
        query: `"${ctx.full_name}" ${ctx.city ?? ctx.provincia ?? ""} contacto email teléfono`,
        priority: gp(3),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  ),

  // ─── Employment / Social ──────────────────────────────────────────
  buildRecipe(
    {
      id: "linkedin_es",
      label: "LinkedIn profile (Spain)",
      signal_type: "employment",
      tool: "exa",
      can_verify_pairs: [["full_name", "employer"], ["full_name", "city"]],
    },
    "external",
    (ctx, gp) => {
      const location = ctx.city ?? "Spain";
      const query = ctx.employer
        ? `"${ctx.full_name}" "${ctx.employer}" ${location} site:linkedin.com/in`
        : `"${ctx.full_name}" ${location} site:linkedin.com/in`;
      return [
        {
          query,
          includeDomains: ["linkedin.com"],
          priority: gp(2),
          requires_fields: [],
          target_pairs: [["full_name", "employer"], ["full_name", "city"]],
        },
      ];
    },
  ),
  buildRecipe(
    {
      id: "dateas",
      label: "Dateas España — aggregated records",
      signal_type: "other",
      tool: "tavily",
      can_verify_pairs: [["full_name", "dni_nie"], ["full_name", "city"]],
    },
    "both",
    (ctx, gp) => {
      const queries = [];
      if (ctx.dni_nie) {
        queries.push({
          query: `"${ctx.dni_nie}" site:dateas.com`,
          includeDomains: ["dateas.com"],
          priority: gp(2),
          requires_fields: ["dni_nie"],
          target_pairs: [["full_name", "dni_nie"]],
        });
      }
      queries.push({
        query: `"${ctx.full_name}" España site:dateas.com`,
        includeDomains: ["dateas.com"],
        priority: gp(4),
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      });
      return queries;
    },
  ),
];

export const ES: Playbook = {
  country: "ES",
  label: "Spain",
  recipes,
};
