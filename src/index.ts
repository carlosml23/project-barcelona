import { env } from "./config/env.js";
import { getPlaybook } from "./playbooks/index.js";

const sampleCountries = ["ES", "PL", "PT", "RO"];

console.log("project-barcelona — Debtor Intelligence Agent");
console.log(`sqlite: ${env.SQLITE_PATH}`);
console.log("loaded playbooks:");
for (const c of sampleCountries) {
  const pb = getPlaybook(c);
  console.log(`  ${c} → ${pb.label} (${pb.recipes.length} recipes)`);
}
