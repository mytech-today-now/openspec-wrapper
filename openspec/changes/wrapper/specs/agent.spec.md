# Behavioral Specification: OpenSpec AI Agent (`runAgent`)

**Change:** `wrapper`
**Artifact:** `specs/agent.spec.md`
**Version:** 1.0

---

## Overview

`runAgent(request, config)` is the top-level orchestration function. It converts a
natural-language feature request into a sequence of real OpenSpec CLI invocations by
running a bounded ReAct (Reason + Act) loop powered by the configured LLM provider.

---

## Preconditions

Before `runAgent` is called, the following MUST be true:

1. `config` has been produced by `resolveConfig()` and has passed validation.
2. The `openspec` CLI binary is discoverable on `PATH` (or `OPENSPEC_CWD` is set).
3. The `registry` map contains at least the `execute_openspec` tool definition.
4. `request` is a non-empty string from `process.argv[2]`.

---

## Behavioral Specifications

### SPEC-AGENT-001 — System prompt is prepended to every conversation

**Given** `runAgent` is called with any `request`
**When** the first LLM call is made
**Then** `messages[0]` MUST be a `system` role message containing the full system prompt
  constant, and `messages[1]` MUST be a `user` role message containing `request`.

---

### SPEC-AGENT-002 — Loop is bounded by `maxIterations`

**Given** the LLM continues requesting tool calls indefinitely
**When** the iteration counter reaches `config.maxIterations`
**Then** the loop MUST exit gracefully, printing:
  `⚠️  Max iterations (N) reached. Stopping agent.`
**And** `process.exitCode` MUST be set to `0` (not a crash).

---

### SPEC-AGENT-003 — Tool calls are dispatched and results appended

**Given** the LLM response has `stopReason === "tool_use"`
**When** one or more tool calls are present in `response.toolCalls`
**Then** for EACH tool call:
  1. `dispatchTool(toolCall)` is called.
  2. An `assistant` message containing the tool call is appended to `messages`.
  3. A `tool` result message with the string result is appended to `messages`.
**And** the loop MUST continue to the next iteration.

---

### SPEC-AGENT-004 — Final answer terminates the loop

**Given** the LLM response has `stopReason === "end_turn"` (or equivalent)
**When** no tool calls are present
**Then** the agent MUST print the response content to `stdout` and `break` from the loop.

---

### SPEC-AGENT-005 — Unknown tool name is a fatal agent error

**Given** the LLM requests a tool call with a name not present in `registry`
**When** `dispatchTool` is called
**Then** an `Error` MUST be thrown with message: `Unknown tool: <name>`
**And** the error MUST propagate to `main()`, be printed to `stderr`, and exit with code 1.

---

### SPEC-AGENT-006 — DEBUG mode logs every LLM request and response

**Given** `config.debug === true`
**When** any LLM call is made or a response is received
**Then** the full request payload and full response payload MUST be printed to `stderr`
  with a `[DEBUG]` prefix before processing continues.

---

### SPEC-AGENT-007 — No request proceeds without a `request` argument

**Given** `process.argv[2]` is `undefined` or empty
**When** `main()` is called
**Then** the agent MUST print a usage hint and exit with code 1:
  ```
  Usage: npm run openspec:agent "<feature description>"
  ```
**And** no LLM call is made.

---

### SPEC-AGENT-008 — Config validation failure exits before any LLM call

**Given** `AI_API_KEY` is not set and `AI_PROVIDER !== "ollama"`
**When** `resolveConfig()` is called
**Then** the agent MUST print:
  `❌ AI_API_KEY is required for provider "<provider>". Set it in your environment.`
**And** exit with code 1 before making any network call.

---

### SPEC-AGENT-009 — Console output uses consistent emoji prefix format

**Given** the agent is running
**When** any status message is printed to `stdout`
**Then** messages MUST use the prefix format:
  - `🤔` — LLM thinking / reasoning step
  - `🔧 Tool: <name>` — before tool dispatch
  - `📄 Result:` — after tool result received
  - `✅` — successful completion
  - `⚠️` — warnings (e.g., max iterations)
  - `❌` — errors

---

### SPEC-AGENT-010 — Provider switch requires no code change

**Given** `AI_PROVIDER=anthropic` is set in the environment
**When** `runAgent` initializes the `ai-powered` client
**Then** the Anthropic provider MUST be used for all LLM calls
**And** no code change in `open-spec-agent.ts` is required.

