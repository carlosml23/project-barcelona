// Placeholder CLI — will be wired to the orchestrator in the next build step (1–4h + 4–9h).
// For now it loads a CSV, validates the rows, and prints the playbook plan per case.

import { loadCasesFromCsv } from "../data/loadCases.js";
import { getPlaybook } from "../playbooks/index.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run run:case -- <path-to-cases.csv>");
  process.exit(1);
}

const cases = loadCasesFromCsv(path);
console.log(`loaded ${cases.length} cases`);

for (const c of cases.slice(0, 3)) {
  const pb = getPlaybook(c.country);
  console.log(`\n[${c.case_id}] ${c.full_name} (${c.country}) — €${c.debt_eur} ${c.debt_origin}`);
  console.log(`  playbook: ${pb.label}`);
  for (const r of pb.recipes) {
    const q = r.buildQuery({ full_name: c.full_name, country: c.country });
    console.log(`    · ${r.id} [${r.tool}] → "${q.query}"`);
  }
}
