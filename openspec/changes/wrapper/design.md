# Design: OpenSpec AI Agent Wrapper

**Change:** `wrapper`
**Ticket:** FEAT-1423
**Status:** Draft

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  npm run openspec:agent "<natural language request>"          │
└───────────────────────┬──────────────────────────────────────┘
                        │  process.argv[2]
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  open-spec-agent.ts                                           │
│                                                               │
│  ┌─────────────────┐   ┌───────────────────────────────────┐ │
│  │  Config Layer   │   │  ReAct Reasoning Loop             │ │
│  │                 │   │                                   │ │
│  │  AI_PROVIDER    │──▶│  while (i < maxIterations) {      │ │
│  │  AI_MODEL       │   │    response = client.chat(...)    │ │
│  │  AI_API_KEY     │   │    if (tool_use) dispatch(tool)   │ │
│  │  AI_BASE_URL    │   │    else printFinal(); break;      │ │
│  │  AI_TEMPERATURE │   │  }                                │ │
│  │  AI_MAX_ITER    │   └──────────────┬────────────────────┘ │
│  │  OPENSPEC_CWD   │                 │                       │
│  │  DEBUG          │                 ▼                       │
│  └─────────────────┘   ┌───────────────────────────────────┐ │
│                        │  Tool Registry (Map)               │ │
│  ┌─────────────────┐   │                                   │ │
│  │   ai-powered    │◀──│  execute_openspec                 │ │
│  │   LLM client    │   │  (future: git_status, read_file)  │ │
│  └─────────────────┘   └──────────────┬────────────────────┘ │
└─────────────────────────────────────── │ ─────────────────────┘
                                         │ child_process.exec
                                         ▼
                             ┌────────────────────────┐
                             │  openspec CLI           │
                             │  propose / apply /      │
                             │  archive / list / status│
                             └────────────────────────┘
```

---

## Technology Choices

### TypeScript + Strict Mode
**Decision:** TypeScript with `"strict": true`, ESM module format.
**Rationale:** Tool schema definitions use Zod generics that compose directly with
TypeScript types, giving full IDE autocompletion on every `input` field. Type errors
at schema boundaries are caught at author-time, not mid-workflow at runtime.
`"type": "module"` in `package.json` is required for ai-powered's ESM-only exports.

### `tsx` for Development Execution
**Decision:** Run `open-spec-agent.ts` directly via `tsx` (no compile step in dev).
**Rationale:** Eliminates the `tsc → node dist/` round trip during iteration. `tsx`
strips types at runtime using esbuild — no tsconfig changes needed. A separate
`openspec:agent:build` script uses `tsc` for producing a distributable `dist/`.

### `ai-powered` as LLM Client
**Decision:** All LLM calls go through `ai-powered` exclusively.
**Rationale:** Provides a single, stable interface across OpenAI, Anthropic, xAI, Ollama,
and Venice. Tool/function calling, structured output, and streaming are all handled by
the library, keeping provider-specific adapter code out of this agent entirely.

### Zod for Tool Schema Validation
**Decision:** Define every tool's input shape as a `z.object(…)` schema.
**Rationale:** Zod schemas serve dual purpose — they are the runtime validators for
tool inputs AND the source of truth for TypeScript types (via `z.infer`). This prevents
schema/type drift. The `z.enum` on the `command` field is also the injection-prevention
boundary: only whitelisted subcommands can be assembled into CLI strings.

### Single-File Entrypoint
**Decision:** All agent logic in `open-spec-agent.ts` with clearly labelled sections.
**Rationale:** Avoids premature abstraction. The file is ~300 lines and has four distinct
sections (config, tools, ReAct loop, main). Splitting into modules is deferred until the
file grows past ~600 lines or a second agent is needed. One file is easy to audit, copy,
and paste into another repo.

---

## Module Sections (internal structure of `open-spec-agent.ts`)

```
Section 1 — Imports & type declarations
Section 2 — Config resolution (resolveConfig)
Section 3 — Tool registry & execute_openspec implementation
Section 4 — ReAct loop (runAgent)
Section 5 — main() entry point
```

---

## Config Resolution

Config is resolved once at startup by `resolveConfig()`. It reads from `process.env`,
applies defaults, and validates required fields before any LLM call is made.

```typescript
interface AgentConfig {
  provider:      string;   // AI_PROVIDER       default: "openai"
  model:         string;   // AI_MODEL          default: provider default
  apiKey:        string;   // AI_API_KEY        required (except Ollama)
  baseUrl?:      string;   // AI_BASE_URL       optional
  temperature:   number;   // AI_TEMPERATURE    default: 0.2
  maxIterations: number;   // AI_MAX_ITERATIONS default: 10
  cwd:           string;   // OPENSPEC_CWD      default: process.cwd()
  debug:         boolean;  // DEBUG             default: false
}
```

Validation: if `apiKey` is missing and `provider !== "ollama"`, the agent prints a
clear error message and exits with code 1 before making any network call.

---

## System Prompt Design

The system prompt is ≤ 400 tokens. It defines the agent's identity, the four workflow
stages in order, and hard behavioral rules. It does NOT assume the model knows OpenSpec.

**Key rules enforced by the prompt:**
- Never skip `propose` before `apply`.
- Never fabricate or simulate CLI output — use `execute_openspec` exclusively.
- Report exact `stderr` on failure; do not continue past a failed command.
- Ask for clarification when the request is ambiguous before calling any tool.
- End each response with: what was done + what the next step is.

---

## ReAct Loop

The loop is bounded by `AI_MAX_ITERATIONS` (default: 10). The four-step OpenSpec
workflow typically completes in 4–6 iterations. The cap prevents runaway cost.

**Loop invariants:**
- `messages` array grows by 2 on each tool call (assistant message + tool result).
- The loop exits on `stopReason === "end_turn"` (final answer) or on hitting the cap.
- On cap hit, the agent prints a warning and exits gracefully (no throw, no crash).

**Tool dispatch:**
```typescript
async function dispatchTool(toolCall: ToolCall): Promise<string> {
  const tool = registry.get(toolCall.name);
  if (!tool) throw new Error(`Unknown tool: ${toolCall.name}`);
  const input = tool.schema.parse(toolCall.input); // Zod validation
  return tool.execute(input);
}
```

---

## `execute_openspec` Tool

### Command Assembly
```
openspec <command> [positional args…] [--flag "value"…]
```
Flag values are shell-quoted using a lightweight `shellQuote(v: string): string` helper
that wraps values in double quotes and escapes embedded double quotes. This is the
primary injection-prevention mechanism for flag values.

### Result Contract
```typescript
interface ToolResult {
  success: boolean;
  command: string;   // the assembled command string (logged to console)
  stdout:  string;
  stderr:  string;
}
```

Non-zero exit codes set `success: false`. The tool never throws — the agent reasons
about failures from the structured result.

### Timeout
`child_process.exec` is wrapped in a Promise with a 60-second timeout. On timeout,
the process is killed and a descriptive error is returned as the tool result.

---

## Error Taxonomy

| Error Class          | Source                     | Handling                                          |
|----------------------|----------------------------|---------------------------------------------------|
| Config validation    | `resolveConfig()`          | `console.error` + `process.exit(1)` at startup   |
| CLI not found        | `exec` ENOENT              | Returned in tool result as `success: false`       |
| CLI non-zero exit    | `exec` callback            | Returned in tool result as `success: false`       |
| CLI timeout          | 60s exec timeout           | Kill child, return timeout error in tool result   |
| Unknown tool called  | `dispatchTool`             | Thrown — surfaces as unrecoverable agent error    |
| Zod parse failure    | `dispatchTool`             | Thrown — LLM sent malformed tool input            |
| LLM API error        | `ai-powered` client        | Thrown — propagates to `main()`, printed + exit 1 |
| Max iterations hit   | ReAct loop                 | Warning printed, loop exits cleanly               |

---

## Security Design

1. **Subcommand whitelist** — `z.enum(["propose","apply","archive","status","list","init"])`
   prevents the LLM from requesting arbitrary shell execution via the command field.
2. **Shell quoting** — flag values are quoted before assembly; never interpolated raw.
3. **No credentials in source** — all keys via `process.env` only.
4. **Stderr scrubbing** — lines matching `/sk-[A-Za-z0-9]{20,}/` or `/Bearer\s+\S+/`
   are redacted before printing to the console.

---

## Extensibility Contract

The tool registry is a `Map<string, ToolDefinition>`:

```typescript
interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name:        string;
  description: string;
  schema:      T;
  execute:     (input: z.infer<T>) => Promise<string>;
}
```

Adding a new tool requires:
1. Define a `z.object(…)` schema.
2. Implement the `execute` function.
3. Call `registry.set(name, toolDef)` before `runAgent()`.

No changes to the ReAct loop, system prompt, or `dispatchTool` are needed.

