# openspec-wrapper

AI agent wrapper that drives the [OpenSpec](https://npmjs.com/package/openspec) CLI
via natural language.  A single `npm run openspec:agent "<request>"` command drives
the full `propose → review → apply → archive` workflow autonomously.

**Ticket:** FEAT-1423

---

## AI Development Tools

This repository ships `open-spec-agent.ts` — a TypeScript ReAct agent that accepts a
natural-language feature request and executes the OpenSpec CLI on your behalf.

### Prerequisites

| Requirement  | Version  | Install                              |
|--------------|----------|--------------------------------------|
| Node.js      | ≥ 20 LTS | <https://nodejs.org>                 |
| OpenSpec CLI | any      | `npm install -g openspec`            |
| LLM API key  | —        | Set `AI_API_KEY` in your environment |

Install project dependencies:

```bash
npm install
```

### Environment Setup (`.env`)

Create a `.env` file in the repository root — **never commit it**:

```env
# Required (unless AI_PROVIDER=ollama)
AI_API_KEY=sk-your-key-here

# Optional — defaults shown
AI_PROVIDER=openai          # openai | anthropic | xai | ollama | venice
AI_MODEL=gpt-4o             # leave blank to use provider default
AI_TEMPERATURE=0.2          # sampling temperature
AI_MAX_ITERATIONS=10        # max ReAct loop iterations
OPENSPEC_CWD=               # working directory for CLI commands (default: cwd)
DEBUG=false                 # set to true to print raw LLM payloads to stderr
```

> **Tip:** Copy `.env.example` if it exists, then fill in your key.

### Invocation Examples

**Example 1 — Propose a new feature (full workflow)**

```bash
npm run openspec:agent "Add a dark mode toggle that respects system preference and persists to localStorage"
```

The agent will: reason about the request → call `openspec propose` → present the
generated proposal → ask for confirmation before calling `openspec apply`.

**Example 2 — List all current proposals**

```bash
npm run openspec:agent "List all current proposals"
```

**Example 3 — Archive a completed change**

```bash
npm run openspec:agent "Archive the dark-mode-toggle change"
```

**Example 4 — Debug mode (inspect raw LLM payloads)**

```bash
DEBUG=true npm run openspec:agent "List proposals" 2>debug.log
cat debug.log
```

### NPM Scripts

| Script                          | Purpose                                           |
|---------------------------------|---------------------------------------------------|
| `npm run openspec:agent`        | Run the agent with `tsx` (no compile step)        |
| `npm run openspec:agent:build`  | Compile to `dist/` with `tsc`                     |
| `npm run openspec:agent:run`    | Run the compiled output via `node`                |
| `npm run typecheck`             | Type-check with `tsc --noEmit --strict`           |
| `npm test`                      | Run the test suite via `node --experimental-strip-types` |

### Full Documentation

See **[openspec/changes/wrapper/README.md](openspec/changes/wrapper/README.md)** for:

- Complete environment variable reference
- Adding new tools to the registry
- Troubleshooting FAQ
- Architecture overview and design decisions

---

## Project Structure

```
open-spec-agent.ts          # Single-file agent (entry point)
open-spec-agent.test.ts     # End-to-end test suite
tsconfig.json               # TypeScript configuration
package.json                # Dependencies and npm scripts
openspec/
  changes/wrapper/          # Feature design, specs, and tasks
  config.yaml               # OpenSpec workspace configuration
```

---

## License

Private — see repository settings.

