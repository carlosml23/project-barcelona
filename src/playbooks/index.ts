import { ES } from "./ES.js";
import { DEFAULT_PLAYBOOK } from "./default.js";
import type { Playbook } from "./types.js";

const registry: Record<string, Playbook> = {
  ES,
};

export function getPlaybook(country: string): Playbook {
  return registry[country.toUpperCase()] ?? DEFAULT_PLAYBOOK;
}

export { DEFAULT_PLAYBOOK, ES };
export type { Playbook, SourceRecipe, PlaybookCtx } from "./types.js";
