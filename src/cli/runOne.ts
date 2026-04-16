import { parseArgs } from "node:util";
import { CaseRowSchema, type CaseRow } from "../state/types.js";
import { runCase } from "../orchestrator/graph.js";
import { newId } from "../util/id.js";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    country: { type: "string", default: "ES" },
    phone: { type: "string" },
    email: { type: "string" },
    dni: { type: "string" },
    provincia: { type: "string" },
    employer: { type: "string" },
    autonomo: { type: "string" },
    city: { type: "string" },
    "postal-code": { type: "string" },
    debt: { type: "string", default: "5000" },
    origin: { type: "string", default: "personal_loan" },
    age: { type: "string", default: "12" },
    attempts: { type: "string", default: "1" },
    outcome: { type: "string", default: "busy" },
    legal: { type: "string", default: "no_assets_found" },
  },
});

if (!values.name) {
  console.error(`usage:
  npm run run:one -- --name "Full Name" [--country ES] [--phone +34...] \\
    [--email user@example.com] [--dni 12345678Z] [--provincia Madrid] \\
    [--employer "Telefonica"] [--autonomo true] [--city Madrid] [--postal-code 28001] \\
    [--debt 5000] [--origin personal_loan] [--age 12] \\
    [--attempts 1] [--outcome busy] [--legal no_assets_found]`);
  process.exit(1);
}

const row: CaseRow = CaseRowSchema.parse({
  case_id: newId("LIVE_"),
  country: values.country!.toUpperCase(),
  debt_eur: Number(values.debt),
  debt_origin: values.origin,
  debt_age_months: Number(values.age),
  call_attempts: Number(values.attempts),
  call_outcome: values.outcome,
  legal_asset_finding: values.legal,
  full_name: values.name!,
  phone: values.phone,
  email: values.email,
  dni_nie: values.dni,
  provincia: values.provincia,
  employer: values.employer,
  autonomo: values.autonomo === "true" ? true : values.autonomo === "false" ? false : undefined,
  city: values.city,
  postal_code: values["postal-code"],
});

const dataFields = [
  row.phone && `phone=${row.phone}`,
  row.email && `email=${row.email}`,
  row.dni_nie && `DNI=${row.dni_nie}`,
  row.provincia && `prov=${row.provincia}`,
  row.employer && `employer=${row.employer}`,
  row.city && `city=${row.city}`,
].filter(Boolean);

console.log(`\n=== Running case ${row.case_id} ===`);
console.log(`debtor: ${row.full_name} (${row.country})  debt: €${row.debt_eur} ${row.debt_origin} (${row.debt_age_months}mo)`);
console.log(`prior: call=${row.call_outcome} legal=${row.legal_asset_finding}`);
console.log(`data points: ${dataFields.length > 0 ? dataFields.join(" | ") : "name only"}\n`);

const state = await runCase(row, {
  onTrace: (m) => console.log(m),
});

console.log("\n=== BRIEFING ===");
console.log(JSON.stringify(state.briefing, null, 2));
