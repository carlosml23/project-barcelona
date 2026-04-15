# Project Barcelona

## Project Overview

<!-- Describe what this project does and its primary goals -->

## Tech Stack

<!-- List the main technologies, frameworks, and languages used -->
- Language: 
- Framework: 
- Database: 
- Package manager: 

## Architecture

<!-- Describe the high-level architecture and key directories -->

## Development Workflow

### Running the project

```bash
# Start dev server

# Run tests

# Build
```

### Key commands

| Command | Purpose |
|---------|---------|
| `/plan` | Break down a feature before implementing |
| `/tdd` | Write tests first, then implementation |
| `/code-review` | Quality review before committing |
| `/build-fix` | Fix build or type errors |
| `/e2e` | Generate and run end-to-end tests |
| `/security-review` | Scan for vulnerabilities |

## Conventions

- No `console.log` in committed code (enforced by Stop hook)
- No `--no-verify` on git commands (enforced by PreToolUse hook)
- Commit message format: `type(scope): description`

## Context Window Management

- Run `/compact` manually when nearing limits, or let the suggest-compact hook guide you
- Disable unused MCPs per session via `/plugins`
- Keep active MCPs under 10, active tools under 80
