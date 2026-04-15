import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  EXA_API: z.string().min(1),
  TAVILY_API: z.string().min(1),
  FIRECRAWL: z.string().min(1),
  SQLITE_PATH: z.string().default("./data/app.db"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
