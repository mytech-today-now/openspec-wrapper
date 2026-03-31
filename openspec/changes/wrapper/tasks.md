# Tasks: OpenSpec AI Agent Wrapper

**Change:** `wrapper`
**Ticket:** FEAT-1423
**Total:** 24 tasks across 4 phases

---

## Phase 1 — Project Setup

- [ ] **T-1.1** Add `"type": "module"` to `package.json`.
- [ ] **T-1.2** Install runtime dependencies: `ai-powered` (github), `zod ^3.23`.
- [ ] **T-1.3** Install dev dependencies: `tsx ^4.19`, `typescript ^5.7`, `@types/node ^22`.
- [ ] **T-1.4** Add npm scripts to `package.json`:
  - `openspec:agent` → `tsx open-spec-agent.ts`
  - `openspec:agent:build` → `tsc --outDir dist --declaration`
  - `openspec:agent:run` → `node dist/open-spec-agent.js`
- [ ] **T-1.5** Create `tsconfig.json` with `strict: true`, `module: node16`, `target: es2022`.
- [ ] **T-1.6** Add `.env` and `.env*` to `.gitignore`.

---

## Phase 2 — Config Layer (`open-spec-agent.ts` Section 2)

- [ ] **T-2.1** Define `AgentConfig` TypeScript interface with all 8 env-var fields.
- [ ] **T-2.2** Implement `resolveConfig(): AgentConfig` that reads from `process.env` with defaults.
- [ ] **T-2.3** Add startup validation: exit with code 1 + clear message if `AI_API_KEY` is missing
      and provider is not `"ollama"`.
- [ ] **T-2.4** Add startup check for `openspec` CLI availability (`which`/`where openspec`);
      exit with code 1 + install hint if not found.
- [ ] **T-2.5** Smoke test: wire up `ai-powered` with resolved config, make one `generateText`
      call, print `provider/model` to console, verify no errors.

---

## Phase 3 — Tool Registry & `execute_openspec` (`open-spec-agent.ts` Section 3)

- [ ] **T-3.1** Define `ToolDefinition<T>` generic interface.
- [ ] **T-3.2** Instantiate `registry = new Map<string, ToolDefinition>()`.
- [ ] **T-3.3** Define `ExecuteOpenspecSchema` using Zod (`command` enum, `args`, `flags`).
- [ ] **T-3.4** Implement `shellQuote(v: string): string` helper (wraps in `"`, escapes embedded `"`).
- [ ] **T-3.5** Implement `executeOpenspec(input)` — assemble command string, `exec` with 60s timeout,
      capture `stdout`/`stderr`, return `ToolResult`.
- [ ] **T-3.6** Implement stderr scrubbing: redact lines matching `sk-…` or `Bearer …` patterns.
- [ ] **T-3.7** Register `execute_openspec` in `registry`.
- [ ] **T-3.8** Implement `dispatchTool(toolCall)` — look up registry, Zod-parse input, call `execute`.
- [ ] **T-3.9** Manual integration test: call `executeOpenspec` directly with `{ command: "list" }`;
      confirm CLI output is captured and printed correctly.

---

## Phase 4 — ReAct Loop & Main Entry Point (`open-spec-agent.ts` Sections 4–5)

- [ ] **T-4.1** Define system prompt constant (≤ 400 tokens) following the skeleton in the JIRA ticket.
- [ ] **T-4.2** Implement `buildToolSchema(registry)` — convert registry entries to the format
      expected by `ai-powered`'s `tools` parameter.
- [ ] **T-4.3** Implement `runAgent(request: string, config: AgentConfig)`:
  - Initialize `messages` with the user request.
  - Enter `while (iterations < maxIterations)` loop.
  - On `stopReason === "tool_use"`: dispatch all tool calls, append assistant + tool-result messages.
  - On `stopReason === "end_turn"`: print final answer, break.
  - On iteration cap: print warning, exit gracefully.
- [ ] **T-4.4** Add `DEBUG` logging: when `config.debug`, print LLM request/response to `stderr`.
- [ ] **T-4.5** Implement `main()`:
  - Read `process.argv[2]` as the user request.
  - Exit with usage hint if no argument provided.
  - Call `resolveConfig()`, then `runAgent()`.
  - Catch and print top-level errors, exit code 1.
- [ ] **T-4.6** Use status emojis and consistent prefix in all console output:
      `🤔 Thinking…`, `🔧 Tool:`, `📄 Result:`, `✅ Done`, `❌ Error`.

---

## Phase 5 — Validation & Documentation

- [ ] **T-5.1** Run `tsc --noEmit --strict`; fix all type errors (AC-7).
- [ ] **T-5.2** End-to-end test: `npm run openspec:agent "Add a dark mode toggle"` — verify
      `propose` is called before `apply` and output is presented (AC-1, AC-2).
- [ ] **T-5.3** Failure test: run with a bad `AI_API_KEY`; verify clear error message (AC-3, AC-4).
- [ ] **T-5.4** Debug test: `DEBUG=true npm run openspec:agent "list proposals"` — verify payloads
      printed to stderr (AC-6).
- [ ] **T-5.5** Update `README.md` with "AI Development Tools" section per AC-10.
- [ ] **T-5.6** Open PR; include terminal recording or screenshot of successful end-to-end run.

