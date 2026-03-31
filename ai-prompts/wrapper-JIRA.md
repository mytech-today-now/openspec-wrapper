---
Ticket Key:   FEAT-1423
Type:         Feature
Priority:     High
Status:       Open
Reporter:     layla
Assignee:     TBD
Labels:       ai-agent, openspec, automation, developer-experience, typescript
Sprint:       Current
Story Points: 8
Epic:         AI-Powered Developer Tooling
---

# FEAT-1423 — OpenSpec AI Agent Wrapper

## Summary

Build a production-ready, provider-agnostic AI agent wrapper (`open-spec-agent.ts`) that
accepts natural language feature requests and autonomously drives the full OpenSpec CLI
workflow — `propose → review → apply → archive` — using
[ai-powered](https://github.com/mytech-today-now/ai-powered.git) as the LLM client and
tool-calling engine.

---

## Background & Motivation

OpenSpec enforces a structured, spec-first development methodology. Today, engineers must
manually translate a feature idea into a properly formatted `openspec propose` invocation,
review the generated proposal file, decide when to `apply`, and later `archive` completed
specs — all while switching between their editor, terminal, and an AI chat window.

This ticket eliminates that context switching by embedding an AI agent directly into the
repository's npm scripts. The agent understands natural language, reasons over the correct
workflow sequence, and calls the real OpenSpec CLI — never simulating or mocking it.

**Why ai-powered?**
`ai-powered` provides a unified, provider-agnostic LLM client (OpenAI, Anthropic, xAI/Grok,
Ollama, Venice, and custom endpoints) with first-class support for structured tool/function
calling, streaming, and environment-variable-driven configuration. This avoids a hard
dependency on any single provider and lets each engineer use their preferred model.

---

## User Stories

**US-1 — Feature proposal via natural language**
> As an engineer, I want to describe a feature in plain English so that the agent generates
> and submits a formal OpenSpec proposal without me writing the CLI command.

**US-2 — Guided workflow execution**
> As an engineer, I want the agent to walk me through the `propose → apply → archive` lifecycle
> with clear status messages at each step so I always know what was done and what comes next.

**US-3 — Provider flexibility**
> As a team lead, I want each engineer to configure their own LLM provider and API key via
> environment variables so there are no hardcoded secrets and no provider lock-in.

**US-4 — Extensibility**
> As a future maintainer, I want the tool-calling layer to be modular so I can add new tools
> (e.g., `git_status`, `read_file`, `run_tests`) without refactoring the agent core.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  npm run openspec:agent "<natural language request>"         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  open-spec-agent.ts                                          │
│                                                              │
│  ┌──────────────┐    ┌─────────────────────────────────┐    │
│  │ Config Layer │    │ ReAct Reasoning Loop             │    │
│  │ (env vars)   │───▶│  1. Think  (LLM call)           │    │
│  └──────────────┘    │  2. Act    (tool call)          │    │
│                      │  3. Observe (tool result)       │    │
│  ┌──────────────┐    │  4. Repeat until FINAL_ANSWER   │    │
│  │  ai-powered  │◀───│                                 │    │
│  │  LLM client  │    └─────────────────────────────────┘    │
│  └──────────────┘                │                           │
│                                  ▼                           │
│                     ┌────────────────────────┐              │
│                     │  Tool Registry          │              │
│                     │  • execute_openspec     │              │
│                     │  • (future tools …)     │              │
│                     └────────────┬───────────┘              │
└──────────────────────────────────│──────────────────────────┘
                                   │ child_process.exec
                                   ▼
                        ┌──────────────────────┐
                        │  OpenSpec CLI         │
                        │  openspec propose … │
                        │  openspec apply   … │
                        │  openspec archive … │
                        └──────────────────────┘
```

---

## Detailed Requirements

### 1. Repository / File Structure

The following files must be created or updated. No other files should be modified.

```
openspec-wrapper/
├── open-spec-agent.ts        ← new: main agent entrypoint (TypeScript, ESM)
├── package.json              ← update: add deps + npm scripts
└── README.md                 ← update: add "AI Development Tools" section
```

**Design decision — single-file entrypoint:**
Keep the agent in one well-commented file to minimise maintenance overhead and make it easy
to audit. Internal helpers (config resolution, tool registration, ReAct loop) are organised
as clearly labelled sections within the file, not separate modules, until the complexity
justifies splitting.

---

### 2. Core Agent Implementation (`open-spec-agent.ts`)

#### 2a. Language & Module Format

- **TypeScript** (strict mode, `"moduleResolution": "bundler"` or `"node16"`).
- **ESM** (`"type": "module"` in `package.json`). Import paths must include `.js` extensions
  as required by Node.js ESM resolution.
- Run via `tsx` in development (`npm run openspec:agent`) for zero-compile-step DX.

**Why TypeScript over plain JS?**
Type safety catches tool-schema mismatches at author-time, not at runtime when the agent
is mid-workflow. The Zod schemas and ai-powered types compose cleanly with TypeScript
generics, providing full IDE autocompletion on every tool input/output.

#### 2b. Configuration Resolution

All runtime configuration is resolved from environment variables with sane defaults.
No config file is required; engineers set variables in `.env` or their shell profile.

| Variable              | Required | Default         | Description                                    |
|-----------------------|----------|-----------------|------------------------------------------------|
| `AI_PROVIDER`         | No       | `openai`        | LLM provider: `openai`, `anthropic`, `xai`, `ollama`, `venice` |
| `AI_MODEL`            | No       | provider default | Model identifier, e.g. `gpt-4o`, `claude-opus-4-5` |
| `AI_API_KEY`          | Yes*     | —               | API key for the selected provider (*not needed for Ollama) |
| `AI_BASE_URL`         | No       | provider default | Custom base URL (Ollama, proxies, Azure OpenAI) |
| `AI_TEMPERATURE`      | No       | `0.2`           | Sampling temperature. Low value keeps workflow decisions deterministic |
| `AI_MAX_ITERATIONS`   | No       | `10`            | Max ReAct loop iterations before forced exit   |
| `OPENSPEC_CWD`        | No       | `process.cwd()` | Override the working directory for CLI commands |
| `DEBUG`               | No       | `false`         | Print full LLM request/response payloads       |

Configuration is resolved once at startup and validated. Missing required keys surface a
clear error message before any LLM call is made.

#### 2c. System Prompt Design

The system prompt must be explicit, concise, and workflow-enforcing. It should not rely on
the model "knowing" what OpenSpec is — define the workflow inline.

Key principles:
- State the agent's identity and sole purpose in the first sentence.
- Define the four workflow stages and their correct order.
- Mandate that `execute_openspec` is the only way to run CLI commands.
- Instruct the model to present intermediate results to the user before proceeding.
- Prohibit fabricating command output; if a command fails, report the error verbatim.

**System prompt skeleton (implement exactly this structure):**

```
You are an OpenSpec AI Agent. Your sole purpose is to help engineers execute OpenSpec
workflows by calling the execute_openspec tool.

OpenSpec workflow (always in this order):
  1. propose  — generate a specification file from a feature description
  2. review   — present the generated proposal to the user for confirmation
  3. apply    — scaffold code from the approved proposal
  4. archive  — mark the proposal as complete after implementation

Rules:
- Never skip a step. Always show the user the proposal output before calling apply.
- Never simulate or fabricate CLI output. Use the tool exclusively.
- If a command fails, report the exact stderr and stop.
- Ask for clarification before proceeding if the user's intent is ambiguous.
- End each turn with a clear statement of what was done and what the next step is.
```

#### 2d. ReAct Reasoning Loop

Implement a `while` loop (bounded by `AI_MAX_ITERATIONS`) with the following structure:

```typescript
while (iterations < maxIterations) {
  const response = await client.chat({ messages, tools });

  if (response.stopReason === "tool_use") {
    for (const toolCall of response.toolCalls) {
      const result = await dispatchTool(toolCall);
      messages.push(assistantMessage(response));
      messages.push(toolResultMessage(toolCall.id, result));
    }
  } else {
    // stop_reason === "end_turn" → final answer
    printFinalAnswer(response.content);
    break;
  }

  iterations++;
}
```

**Why a bounded loop?**
Unbounded ReAct loops can burn tokens indefinitely if the model enters a reasoning cycle.
`AI_MAX_ITERATIONS` (default 10) is sufficient for the four-step OpenSpec workflow while
preventing runaway costs.

---

### 3. Tool Definitions

#### 3a. `execute_openspec` (required)

The agent's sole mechanism for running OpenSpec CLI commands.

**Zod schema:**

```typescript
const ExecuteOpenspecSchema = z.object({
  command: z
    .enum(["propose", "apply", "archive", "status", "list", "init"])
    .describe("The openspec subcommand to run."),
  args: z
    .array(z.string())
    .optional()
    .describe("Positional arguments passed after the subcommand."),
  flags: z
    .record(z.string())
    .optional()
    .describe("Named flags as key-value pairs, e.g. { title: 'Dark Mode Toggle' }."),
});
```

**Implementation contract:**
- Build the full command string: `openspec <command> [args] [--flag value …]`
- Execute with `child_process.exec` (async, promise-wrapped) with a 60-second timeout.
- Capture both `stdout` and `stderr`.
- Return a structured result: `{ success: boolean; stdout: string; stderr: string; command: string }`.
- Log the assembled command to the console before execution so the user can see what ran.
- On non-zero exit code, set `success: false` and include the full `stderr` in the result.
  Do NOT throw — let the agent reason about the failure.

**Example tool invocation the LLM will generate:**

```json
{
  "name": "execute_openspec",
  "input": {
    "command": "propose",
    "flags": {
      "title": "Dark Mode Toggle with System Preference and Persistence"
    }
  }
}
```

Which assembles to:

```bash
openspec propose --title "Dark Mode Toggle with System Preference and Persistence"
```

#### 3b. Future Tools (not in scope — document for extensibility)

The tool registry should be a plain `Map<string, ToolDefinition>` so future tools can be
registered without touching the agent core. Anticipated additions:

| Tool name      | Purpose                                      |
|----------------|----------------------------------------------|
| `git_status`   | Read current git status to inform proposals  |
| `read_file`    | Read a source file for context               |
| `list_specs`   | List existing OpenSpec proposal files        |

---

### 4. `package.json` Updates

Add the following dependencies (use exact versions unless a range is intentional):

```json
"dependencies": {
  "ai-powered": "github:mytech-today-now/ai-powered",
  "zod": "^3.23.0"
},
"devDependencies": {
  "tsx": "^4.19.0",
  "@types/node": "^22.0.0",
  "typescript": "^5.7.0"
}
```

Add the following npm scripts:

```json
"scripts": {
  "openspec:agent": "tsx open-spec-agent.ts",
  "openspec:agent:build": "tsc --outDir dist --declaration",
  "openspec:agent:run": "node dist/open-spec-agent.js"
}
```

---

### 5. Invocation Examples

**Example 1 — New feature (full workflow):**
```bash
npm run openspec:agent "Add a dark mode toggle that respects system preference, \
  uses a smooth CSS transition, and persists the user's choice in localStorage."
```

Expected agent behavior:
1. 🤔 Thinks: need to propose with a clean title derived from the description.
2. 🔧 Calls `execute_openspec` → `propose --title "Dark Mode Toggle"`.
3. 📄 Presents the generated proposal file contents to the user.
4. ✅ Asks: "Shall I apply this proposal?" (or proceeds if `--yes` flag is passed).
5. 🔧 Calls `execute_openspec` → `apply`.
6. 🏁 Reports scaffolded files and prompts to `archive` after implementation.

**Example 2 — Direct subcommand pass-through:**
```bash
npm run openspec:agent "List all current proposals"
```

Expected agent behavior:
1. 🔧 Calls `execute_openspec` → `list`.
2. 📋 Formats and presents the output.

**Example 3 — Ambiguous request (agent asks for clarification):**
```bash
npm run openspec:agent "update the auth"
```

Expected agent behavior:
1. 🤔 Recognises the request is too vague to produce a good proposal title.
2. ❓ Responds: "Could you describe the specific authentication change you want to make?
   For example: 'Add OAuth2 login with Google' or 'Replace JWT with session-based auth'."

---

## Acceptance Criteria

All criteria must be verifiable by a reviewer running the agent locally.

- [ ] **AC-1** — `npm run openspec:agent "…"` executes without errors on a machine with the
      OpenSpec CLI installed and `AI_API_KEY` set.
- [ ] **AC-2** — The agent calls `openspec propose` before `openspec apply` in every run.
      It never calls `apply` without first presenting the proposal output.
- [ ] **AC-3** — A failing CLI command (non-zero exit) is surfaced to the user with the
      exact `stderr` text; the agent does not silently continue.
- [ ] **AC-4** — All provider/model/key configuration is read exclusively from environment
      variables. Changing `AI_PROVIDER=anthropic` switches providers with no code change.
- [ ] **AC-5** — The agent terminates cleanly within `AI_MAX_ITERATIONS` iterations even if
      the LLM continues requesting tool calls.
- [ ] **AC-6** — `DEBUG=true npm run openspec:agent "…"` prints each LLM request and
      response payload to stderr for troubleshooting.
- [ ] **AC-7** — The TypeScript source compiles with zero errors under `tsc --noEmit --strict`.
- [ ] **AC-8** — The tool registry accepts a new tool definition without modifying the
      agent's ReAct loop or system prompt (verified by code review).
- [ ] **AC-9** — Console output uses status emojis and a consistent prefix format so
      progress is scannable at a glance.
- [ ] **AC-10** — README "AI Development Tools" section includes: prerequisites, environment
       variable table, at least three invocation examples, and a troubleshooting FAQ.

---

## Definition of Done

- [ ] Code merged to `main` via approved PR.
- [ ] All acceptance criteria above are met and checked off by the reviewer.
- [ ] No TypeScript errors (`tsc --noEmit --strict` exits 0).
- [ ] No hardcoded API keys, model names, or provider URLs in committed code.
- [ ] README updated.
- [ ] PR description includes a screen recording or terminal output demonstrating
      a successful end-to-end `propose → apply` run.

---

## Non-Functional Requirements

| Concern          | Requirement                                                                 |
|------------------|-----------------------------------------------------------------------------|
| Performance      | First LLM response must begin streaming within 5 seconds on a standard connection |
| Token efficiency | System prompt must be ≤ 400 tokens; avoid bloating context with raw file dumps |
| Portability      | Must run on macOS, Linux, and Windows (PowerShell + WSL)                    |
| Node.js version  | Minimum Node.js 20 LTS (native ESM, `fetch`, `structuredClone`)             |

---

## Security Considerations

- **No credentials in source.** `AI_API_KEY` must only be read from `process.env`. Add
  `*.env` and `.env*` to `.gitignore` if not already present.
- **Command injection prevention.** The `execute_openspec` tool must build the CLI command
  from a whitelist of known subcommands (`z.enum([…])`). User-supplied strings must only
  be placed in flag values, never interpolated into the command name or subcommand position.
- **Stderr scrubbing.** Before printing `stderr` to the console, strip any line that
  matches common API key patterns (`sk-…`, `Bearer …`) to avoid accidental key exposure in
  shared terminal logs.

---

## Dependencies & Prerequisites

| Dependency         | Version    | Purpose                                      |
|--------------------|------------|----------------------------------------------|
| `ai-powered`       | latest     | LLM client + tool-calling engine             |
| `zod`              | `^3.23`    | Runtime schema validation for tool inputs    |
| `tsx`              | `^4.19`    | Zero-config TypeScript execution (dev)       |
| `typescript`       | `^5.7`     | Type checking and build                      |
| `@types/node`      | `^22`      | Node.js type definitions                     |
| OpenSpec CLI       | any        | Must be installed globally (`npm i -g openspec`) |

---

## Risks & Mitigations

| Risk                                          | Likelihood | Impact | Mitigation                                                       |
|-----------------------------------------------|------------|--------|------------------------------------------------------------------|
| LLM skips `propose` and calls `apply` directly | Medium    | High   | System prompt explicitly prohibits this; AC-2 validates it       |
| Provider API outage                           | Low        | High   | `AI_PROVIDER` env var makes switching providers a one-liner      |
| Runaway token consumption in loop             | Low        | Medium | `AI_MAX_ITERATIONS` hard cap + per-iteration logging             |
| OpenSpec CLI not installed                    | Medium     | High   | Startup check: `which openspec` / `where openspec`; clear error message |
| Command injection via crafted feature request | Low        | High   | Zod `z.enum` on subcommand; flag values are shell-escaped        |

---

## Implementation Notes for the Assignee

1. **Start with config resolution and a smoke-test** — wire up `ai-powered`, print the
   resolved provider/model to the console, and make one simple `generateText` call before
   building the full ReAct loop.

2. **Build `execute_openspec` next** — test it in isolation by calling it directly with
   hardcoded arguments to confirm CLI output is captured correctly.

3. **Add the ReAct loop last** — only after both the LLM client and the tool are verified
   independently. This keeps each piece debuggable on its own.

4. **Streaming is optional for the initial implementation.** Wire up non-streaming
   `chat()` first; add streaming as a follow-up if the provider supports it cleanly.

5. **Do not add interactive prompts (readline/inquirer) in this ticket.** The `--yes` /
   auto-proceed behaviour is out of scope. The agent should print what it would do next
   and exit; interactive confirmation is a follow-up ticket.

---

*Reporter: layla — Please assign, confirm story points, and add to the current sprint.*