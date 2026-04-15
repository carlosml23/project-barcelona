import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  EXA_API: z.string().min(1),
  TAVILY_API: z.string().min(1),
  FIRECRAWL: z.string().min(1),
  SQLITE_PATH: z.string().default("./data/app.db"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Refiner configuration (agentic refinement loop)
  REFINER_MAX_ITERATIONS: z.coerce.number().int().min(0).default(3),
  REFINER_MAX_TOOL_CALLS: z.coerce.number().int().min(0).default(6),
  // Discovery configuration (agentic discovery via web_search/web_fetch)
  DISCOVERY_ENABLED: z.coerce.boolean().default(true),
  DISCOVERY_MAX_SEARCHES: z.coerce.number().int().min(1).max(20).default(5),
  DISCOVERY_MAX_FETCHES: z.coerce.number().int().min(0).max(10).default(3),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
