export interface SourceRecipe {
  id: string;
  label: string;
  signal_type: "employment" | "business" | "asset" | "social" | "news" | "other";
  tool: "exa" | "tavily" | "firecrawl";
  buildQuery: (ctx: PlaybookCtx) => { query: string; includeDomains?: string[] };
}

export interface PlaybookCtx {
  full_name: string;
  country: string;
  city?: string;
  phoneHint?: string;
}

export interface Playbook {
  country: string;
  label: string;
  recipes: SourceRecipe[];
}
