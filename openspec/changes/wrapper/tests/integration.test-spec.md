# Integration Test Specifications: OpenSpec AI Agent Wrapper

**Change:** `wrapper`
**Artifact:** `tests/integration.test-spec.md`
**Type:** End-to-end scenarios — require real `openspec` CLI and a valid `AI_API_KEY`

---

## Prerequisites

- `openspec` CLI installed globally (`npm i -g openspec`).
- `AI_API_KEY` set in environment (any supported provider).
- `npm install` has been run in this repo.
- Each test is run from the repo root: `npm run openspec:agent "<request>"`.

---

## Scenario IT-001 — Full propose → apply workflow (Happy Path)

**Acceptance Criteria:** AC-1, AC-2

```
Given: AI_PROVIDER=openai, AI_API_KEY is valid, openspec CLI is installed
When:  npm run openspec:agent "Add a dark mode toggle that persists to localStorage"
Then:
  1. Agent calls execute_openspec with command="propose" (verified in console output).
  2. Agent prints the proposal output BEFORE calling apply.
  3. Agent calls execute_openspec with command="apply" after presenting proposal.
  4. Agent terminates with exit code 0.
  5. No apply call appears in output BEFORE a propose call.
```

---

## Scenario IT-002 — Direct list subcommand (pass-through)

**Acceptance Criteria:** AC-1

```
Given: openspec CLI is installed
When:  npm run openspec:agent "List all current proposals"
Then:
  1. Agent calls execute_openspec with command="list".
  2. Output of the list command is printed to stdout.
  3. Agent terminates with exit code 0.
```

---

## Scenario IT-003 — Ambiguous request triggers clarification (no tool call)

**Acceptance Criteria:** AC-1

```
Given: AI_PROVIDER=openai, AI_API_KEY is valid
When:  npm run openspec:agent "update the auth"
Then:
  1. Agent does NOT call execute_openspec.
  2. Agent prints a clarifying question mentioning specifics (e.g., "OAuth", "JWT", "session").
  3. Agent terminates with exit code 0.
```

---

## Scenario IT-004 — CLI failure is surfaced verbatim (no silent continue)

**Acceptance Criteria:** AC-3

```
Given: openspec CLI is installed but OPENSPEC_CWD points to a directory with no config
When:  npm run openspec:agent "apply the dark mode proposal"
Then:
  1. execute_openspec returns success=false with the exact stderr from the CLI.
  2. The exact stderr text appears in the agent's console output.
  3. Agent does NOT proceed to any subsequent workflow step.
  4. Agent terminates with exit code 0 (agent managed the failure; did not crash).
```

---

## Scenario IT-005 — Provider switch via environment variable

**Acceptance Criteria:** AC-4

```
Given: AI_PROVIDER=anthropic, AI_API_KEY=<valid Anthropic key>
When:  npm run openspec:agent "List all proposals"
Then:
  1. Agent initializes with Anthropic provider (printed in config summary line).
  2. A successful LLM response is received.
  3. Agent terminates with exit code 0.
  4. No code change to open-spec-agent.ts was required.
```

---

## Scenario IT-006 — Max iterations cap prevents runaway loop

**Acceptance Criteria:** AC-5

```
Given: AI_MAX_ITERATIONS=2
       LLM (mocked or real) always responds with a tool_use stop reason
When:  npm run openspec:agent "List proposals"
Then:
  1. After 2 iterations, the agent prints the max-iterations warning.
  2. Agent terminates with exit code 0 (not a crash or infinite loop).
```

---

## Scenario IT-007 — DEBUG mode prints full payloads

**Acceptance Criteria:** AC-6

```
Given: DEBUG=true
When:  npm run openspec:agent "List proposals" 2>debug.log
Then:
  1. debug.log contains at least one [DEBUG] prefixed entry.
  2. The entry contains the raw LLM request or response JSON.
  3. stdout still shows the normal agent output.
```

---

## Scenario IT-008 — Missing API key exits cleanly before any LLM call

**Acceptance Criteria:** AC-4

```
Given: AI_PROVIDER=openai, AI_API_KEY is NOT set
When:  npm run openspec:agent "Propose a feature"
Then:
  1. Agent prints an error message containing "AI_API_KEY is required".
  2. Agent exits with code 1.
  3. No HTTP request to the LLM provider is made (verify via network monitor or mock).
```

---

## Scenario IT-009 — New tool registerable without modifying agent core

**Acceptance Criteria:** AC-8

```
Given: A developer adds a new ToolDefinition "git_status" to the registry
       via registry.set("git_status", gitStatusTool) BEFORE runAgent()
When:  The modified agent is run
Then:
  1. The LLM can call "git_status" as a tool.
  2. No lines were changed in the ReAct loop, dispatchTool, or system prompt constant.
  (Verified by code review / diff showing only registry.set() line was added.)
```

---

## Scenario IT-010 — Console output uses consistent emoji prefixes

**Acceptance Criteria:** AC-9

```
Given: A standard run with propose + apply workflow
When:  Output is captured
Then:
  - At least one line starts with "🤔" (reasoning step).
  - At least one line starts with "🔧 Tool:" (tool dispatch).
  - At least one line starts with "📄 Result:" (tool result).
  - At least one line starts with "✅" (completion).
```

---

## Test Data & Environment Setup

```bash
# Minimum .env for integration tests
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_TEMPERATURE=0.2
AI_MAX_ITERATIONS=10
DEBUG=false
```

To run a quick smoke test confirming the CLI and LLM are wired correctly:

```bash
npm run openspec:agent "List all proposals"
```

Expected output includes a `🔧 Tool: execute_openspec` line and the CLI's list output.

