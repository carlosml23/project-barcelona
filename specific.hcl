# Project Barcelona — Debtor Intelligence Agent

build "app" {
  base    = "node"
  command = "npm run build"
}

service "app" {
  build   = build.app
  command = "node dist/index.js"

  dev {
    command = "npx tsx watch src/index.ts"
  }

  env = {
    ANTHROPIC_API_KEY = secret.anthropic_api_key
    EXA_API           = secret.exa_api
    TAVILY_API        = secret.tavily_api
    FIRECRAWL         = secret.firecrawl
    SQLITE_PATH       = "./data/app.db"
    LOG_LEVEL         = config.log_level
  }
}

# --- Secrets (sensitive API keys) ---

secret "anthropic_api_key" {}

secret "exa_api" {}

secret "tavily_api" {}

secret "firecrawl" {}

# --- Config ---

config "log_level" {
  default = "info"
}
