# Interface Specification: Tool Registry & `execute_openspec`

**Change:** `wrapper`
**Artifact:** `specs/tool-registry.spec.md`
**Version:** 1.0

---

## Overview

The Tool Registry is a `Map<string, ToolDefinition>` that decouples tool implementations
from the ReAct loop. Any future tool can be added by calling `registry.set(name, def)`
without modifying the agent core, system prompt, or dispatch logic.

---

## `ToolDefinition<T>` Interface

```typescript
interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name:        string;             // Matches the name used in LLM tool-call responses
  description: string;             // Human-readable purpose (sent to LLM as tool description)
  schema:      T;                  // Zod schema for input validation & TypeScript inference
  execute:     (input: z.infer<T>) => Promise<string>;  // Returns a string result for the LLM
}
```

---

## `ToolResult` Interface (returned by `execute_openspec`)

```typescript
interface ToolResult {
  success: boolean;   // true if exit code === 0
  command: string;    // the full assembled command string (for logging)
  stdout:  string;    // raw stdout from the CLI
  stderr:  string;    // scrubbed stderr (API keys redacted)
}
```

The `execute` function serializes `ToolResult` to JSON string before returning it to
`dispatchTool`, which passes it as the tool result message to the LLM.

---

## `execute_openspec` Specifications

### SPEC-TOOL-001 — Only whitelisted subcommands are accepted

**Given** the LLM requests `execute_openspec` with any `command` value
**When** Zod parses the input
**Then** only `"propose" | "apply" | "archive" | "status" | "list" | "init"` MUST be valid.
**And** any other value MUST cause a Zod parse error (thrown in `dispatchTool`).

---

### SPEC-TOOL-002 — Command is assembled in correct order

**Given** `input = { command: "propose", args: ["my-feature"], flags: { title: "My Feature" } }`
**When** the command string is assembled
**Then** it MUST be: `openspec propose my-feature --title "My Feature"`
**And** flags MUST come after positional args.

---

### SPEC-TOOL-003 — Flag values are shell-quoted

**Given** a flag value contains spaces or special characters
**When** the command string is assembled
**Then** the value MUST be wrapped in double quotes: `--title "Dark Mode Toggle"`
**And** any embedded double quotes in the value MUST be escaped: `\"`

---

### SPEC-TOOL-004 — Non-zero exit code sets `success: false` (no throw)

**Given** the `openspec` CLI exits with a non-zero code
**When** the `exec` callback fires
**Then** the tool MUST return `{ success: false, stdout: "…", stderr: "…", command: "…" }`
**And** the tool MUST NOT throw an error.
**And** the LLM receives the structured result so it can reason about the failure.

---

### SPEC-TOOL-005 — Execution has a 60-second hard timeout

**Given** the `openspec` CLI process hangs
**When** 60 seconds elapse since `exec` was called
**Then** the child process MUST be killed.
**And** the tool MUST return `{ success: false, stderr: "Command timed out after 60s", … }`.

---

### SPEC-TOOL-006 — Stderr is scrubbed before returning

**Given** stderr output contains lines matching API key patterns
**When** `executeOpenspec` prepares the `ToolResult`
**Then** any line matching `/sk-[A-Za-z0-9]{20,}/` MUST be replaced with `[REDACTED]`.
**And** any line matching `/Bearer\s+\S+/` MUST have the token replaced with `[REDACTED]`.

---

### SPEC-TOOL-007 — Assembled command is logged before execution

**Given** `executeOpenspec` is called with any valid input
**When** the command string is assembled
**Then** the full command MUST be printed to `stdout` with the prefix `🔧 Tool: ` before
  `exec` is called.

---

### SPEC-TOOL-008 — `OPENSPEC_CWD` controls execution directory

**Given** `OPENSPEC_CWD` is set to a non-default path
**When** `exec` is called
**Then** the `cwd` option of `exec` MUST be set to the value of `OPENSPEC_CWD`.

---

## Registry Extensibility Specifications

### SPEC-REGISTRY-001 — New tool requires only `registry.set()`

**Given** a developer wants to add a `git_status` tool
**When** they define a `ToolDefinition` and call `registry.set("git_status", def)`
**Then** the tool MUST be available to the LLM in the next `runAgent` call
**And** no changes to `dispatchTool`, the ReAct loop, or the system prompt are required.

---

### SPEC-REGISTRY-002 — All registered tools are included in every LLM call

**Given** `registry` contains N tool definitions
**When** `buildToolSchema(registry)` is called
**Then** the returned array MUST contain exactly N tool schema objects
**And** each entry MUST include `name`, `description`, and a JSON Schema derived from the Zod schema.

---

## `dispatchTool` Specifications

### SPEC-DISPATCH-001 — Zod validation occurs before `execute` is called

**Given** the LLM sends malformed tool input (e.g., wrong type for a field)
**When** `dispatchTool` calls `tool.schema.parse(toolCall.input)`
**Then** a `ZodError` MUST be thrown.
**And** `tool.execute` MUST NOT be called.

