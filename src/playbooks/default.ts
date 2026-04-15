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
      can_verify_pairs: [["full_name", "employer"]],
      buildQueries: ({ full_name, country }) => [
        {
          query: `${full_name} site:linkedin.com/in ${country}`,
          includeDomains: ["linkedin.com"],
          priority: 2,
          requires_fields: [],
          target_pairs: [["full_name", "employer"]],
        },
      ],
    },
    {
      id: "web_general",
      label: "General web presence",
      signal_type: "other",
      tool: "tavily",
      can_verify_pairs: [["full_name", "city"]],
      buildQueries: ({ full_name, country }) => [
        {
          query: `"${full_name}" ${country} company director`,
          priority: 3,
          requires_fields: [],
          target_pairs: [["full_name", "city"]],
        },
      ],
    },
    {
      id: "news_generic",
      label: "News mentions",
      signal_type: "news",
      tool: "tavily",
      can_verify_pairs: [],
      buildQueries: ({ full_name }) => [
        {
          query: `"${full_name}" news`,
          priority: 4,
          requires_fields: [],
          target_pairs: [],
        },
      ],
    },
    {
      id: "social_generic",
      label: "Public social presence",
      signal_type: "social",
      tool: "exa",
      can_verify_pairs: [],
      buildQueries: ({ full_name }) => [
        {
          query: `${full_name} Instagram Facebook profile`,
          includeDomains: ["instagram.com", "facebook.com", "twitter.com", "x.com"],
          priority: 5,
          requires_fields: [],
          target_pairs: [],
        },
      ],
    },
  ],
};
