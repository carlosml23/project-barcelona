import { tavilySearch } from "../tools/tavily.js";
import { exaSearch } from "../tools/exa.js";

interface Query {
  tool: "tavily" | "exa";
  q: string;
  opts?: Record<string, unknown>;
}

const queries: Query[] = [
  // Tavily — broad web searches, NO site: restriction
  { tool: "tavily", q: '"Diego Ignacio Caballero Fuentes"', opts: { searchDepth: "advanced", maxResults: 10 } },
  { tool: "tavily", q: '"Diego Caballero" Oracle Barcelona', opts: { searchDepth: "advanced", maxResults: 10 } },
  { tool: "tavily", q: '"Diego Caballero Fuentes" Barcelona', opts: { maxResults: 10 } },
  { tool: "tavily", q: "diegoignaciocaballero gmail", opts: { maxResults: 10 } },
  { tool: "tavily", q: "Z0572663Z", opts: { maxResults: 10 } },
  { tool: "tavily", q: "+34663967960", opts: { maxResults: 10 } },
  // Exa — neural/semantic (good for people search)
  { tool: "exa", q: "Diego Ignacio Caballero Fuentes Oracle Barcelona", opts: { numResults: 10 } },
  { tool: "exa", q: "Diego Caballero Oracle product manager Barcelona", opts: { numResults: 10, category: "linkedin profile" } },
  { tool: "exa", q: "Diego Caballero Fuentes Barcelona", opts: { numResults: 10 } },
];

async function main() {
  for (const { tool, q, opts } of queries) {
    console.log(`\n========== ${tool.toUpperCase()}: ${q} ==========`);
    try {
      const hits = tool === "tavily"
        ? await tavilySearch(q, opts as any)
        : await exaSearch(q, opts as any);
      if (hits.length === 0) { console.log("  (no results)"); continue; }
      for (const h of hits) {
        console.log(`  [${h.source}] ${h.title}`);
        console.log(`    ${h.url}`);
        console.log(`    ${h.snippet.slice(0, 250)}`);
        console.log();
      }
    } catch (e: unknown) {
      console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main();
