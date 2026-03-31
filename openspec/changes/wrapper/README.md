# OpenSpec AI Agent Wrapper — Change README

**Change:** `wrapper` | **Ticket:** FEAT-1423 | **Status:** Proposed

---

## What This Change Does

Adds `open-spec-agent.ts` — a single-file TypeScript AI agent that accepts a
natural-language feature request and autonomously drives the OpenSpec
`propose → review → apply → archive` workflow using the `ai-powered` LLM client.

---

## Prerequisites

| Requirement        | Version   | Install                                   |
|--------------------|-----------|-------------------------------------------|
| Node.js            | ≥ 20 LTS  | https://nodejs.org                        |
| OpenSpec CLI       | any       | `npm install -g openspec`                 |
| `ai-powered`       | latest    | added via `npm install` (see below)       |
| LLM API key        | —         | Set `AI_API_KEY` in your environment      |

---

## Environment Variables

| Variable            | Required | Default          | Description                                         |
|---------------------|----------|------------------|-----------------------------------------------------|
| `AI_PROVIDER`       | No       | `openai`         | `openai`, `anthropic`, `xai`, `ollama`, `venice`    |
| `AI_MODEL`          | No       | provider default | e.g. `gpt-4o`, `claude-opus-4-5`                   |
| `AI_API_KEY`        | Yes*     | —                | API key (*not required for Ollama)                  |
| `AI_BASE_URL`       | No       | provider default | Custom endpoint (Ollama, Azure OpenAI, proxies)     |
| `AI_TEMPERATURE`    | No       | `0.2`            | Sampling temperature (lower = more deterministic)   |
| `AI_MAX_ITERATIONS` | No       | `10`             | Max ReAct loop iterations before forced exit        |
| `OPENSPEC_CWD`      | No       | `process.cwd()`  | Working directory for CLI commands                  |
| `DEBUG`             | No       | `false`          | Print full LLM request/response payloads to stderr  |

Create a `.env` file in the repo root (never commit it):

```env
AI_PROVIDER=openai
AI_API_KEY=sk-your-key-here
AI_MODEL=gpt-4o
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
cp .env.example .env   # then edit .env with your key

# 3. Verify openspec CLI is available
openspec --version
```

---

## Invocation Examples

### Example 1 — Full workflow: propose a new feature

```bash
npm run openspec:agent "Add a dark mode toggle that respects system preference and persists to localStorage"
```

Expected flow:
1. 🤔 Agent reasons about the feature title.
2. 🔧 Calls `openspec propose --title "Dark Mode Toggle …"`.
3. 📄 Presents the generated proposal.
4. ✅ Prompts: "Shall I apply this proposal?"

### Example 2 — Quick list

```bash
npm run openspec:agent "List all current proposals"
```

Expected output: formatted list of proposals from `openspec list`.

### Example 3 — Ambiguous request (agent asks for clarification)

```bash
npm run openspec:agent "update the auth"
```

Expected output: clarifying question — no CLI command is run.

### Example 4 — Debug mode (troubleshooting LLM calls)

```bash
DEBUG=true npm run openspec:agent "List proposals" 2>debug.log
cat debug.log
```

---

## NPM Scripts

| Script                    | Purpose                                         |
|---------------------------|-------------------------------------------------|
| `npm run openspec:agent`  | Run the agent with `tsx` (no compile step)      |
| `npm run openspec:agent:build` | Compile to `dist/` with `tsc`             |
| `npm run openspec:agent:run`   | Run the compiled output via `node`        |

---

## Adding New Tools

The tool registry is a `Map`. To add a new tool without touching the agent core:

```typescript
// In open-spec-agent.ts, before runAgent() is called:
registry.set("git_status", {
  name: "git_status",
  description: "Get the current git status of the repository.",
  schema: z.object({}),
  execute: async () => {
    const { stdout } = await execAsync("git status --short");
    return stdout;
  },
});
```

No changes to the ReAct loop, system prompt, or dispatch logic are needed.

---

## Troubleshooting FAQ

**Q: `AI_API_KEY is required` error on startup.**
A: Set `AI_API_KEY` in your environment or `.env` file. For Ollama, set `AI_PROVIDER=ollama`.

**Q: `openspec: command not found` error.**
A: Install the CLI globally: `npm install -g openspec`, then restart your terminal.

**Q: Agent hits max iterations and stops.**
A: Increase `AI_MAX_ITERATIONS` (e.g., `AI_MAX_ITERATIONS=20`). Check `DEBUG=true` output
   to see if the LLM is stuck in a reasoning loop.

**Q: CORS error when using the web example alongside this agent.**
A: This agent is CLI-only. The CORS fix is in `ai-powered/src/server/index.ts` (separate).

**Q: TypeScript compile errors.**
A: Run `npx tsc --noEmit --strict` and fix all reported errors. Ensure `@types/node` is
   installed and your `tsconfig.json` targets `es2022` or later.

---

## Artifacts in This Change

| File                              | Purpose                                            |
|-----------------------------------|----------------------------------------------------|
| `proposal.md`                     | Problem statement, goals, non-goals, risks         |
| `design.md`                       | Architecture, technology decisions, module design  |
| `tasks.md`                        | Phased implementation checklist (24 tasks)         |
| `specs/agent.spec.md`             | Behavioral specifications for the agent core       |
| `specs/tool-registry.spec.md`     | Interface specifications for the tool registry     |
| `tests/unit.test-spec.md`         | Unit test case specifications                      |
| `tests/integration.test-spec.md`  | End-to-end scenario specifications                 |

