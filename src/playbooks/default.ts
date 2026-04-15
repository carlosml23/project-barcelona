import type { Playbook } from "./types.js";

export const DEFAULT_PLAYBOOK: Playbook = {
  country: "XX",
  label: "Generic (pan-EU fallback)",
  recipes: [
    {
      id: "linkedin_generic",
      label: "LinkedIn profile lookup",
      signal_type: "employment",
      tool: "exa",
      buildQuery: ({ full_name, country }) => ({
        query: `${full_name} site:linkedin.com/in ${country}`,
        includeDomains: ["linkedin.com"],
      }),
    },
    {
      id: "web_general",
      label: "General web presence",
      signal_type: "other",
      tool: "tavily",
      buildQuery: ({ full_name, country }) => ({
        query: `"${full_name}" ${country} company director`,
      }),
    },
    {
      id: "news_generic",
      label: "News mentions",
      signal_type: "news",
      tool: "tavily",
      buildQuery: ({ full_name }) => ({ query: `"${full_name}" news` }),
    },
    {
      id: "social_generic",
      label: "Public social presence",
      signal_type: "social",
      tool: "exa",
      buildQuery: ({ full_name }) => ({
        query: `${full_name} Instagram Facebook profile`,
        includeDomains: ["instagram.com", "facebook.com", "twitter.com", "x.com"],
      }),
    },
  ],
};
