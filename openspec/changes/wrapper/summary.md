# Summary: OpenSpec AI Agent Wrapper

**Change:** `wrapper` | **Ticket:** FEAT-1423 | **Date:** 2026-03-30

---

## One-Line Description

A single-file TypeScript AI agent (`open-spec-agent.ts`) that accepts a natural-language
feature request and autonomously drives the full OpenSpec `propose → apply → archive`
CLI workflow using the `ai-powered` LLM client.

---

## The Problem

Engineers using OpenSpec must manually: craft CLI commands, switch between terminal and AI
chat, monitor intermediate output, and remember the correct workflow order. This context
switching causes skipped steps (especially `archive`) and inconsistent proposal quality.

---

## The Solution

One npm script. One natural-language request. The agent handles the rest.

```bash
npm run openspec:agent "Add a dark mode toggle that persists to localStorage"
```

The agent reasons over the request via a bounded ReAct loop, calls the real `openspec`
CLI at each step, and presents results before proceeding — enforcing workflow order
through its system prompt design.

---

## Key Design Decisions

| Decision                  | Choice                          | Rationale                                               |
|---------------------------|---------------------------------|---------------------------------------------------------|
| LLM client                | `ai-powered`                    | Provider-agnostic; covers OpenAI, Anthropic, Ollama, xAI |
| Language                  | TypeScript strict + ESM         | Type-safe tool schemas; IDE autocompletion              |
| Dev runtime               | `tsx` (no compile step)         | Fast iteration; zero tsconfig changes needed            |
| Tool schema validation    | Zod                             | Runtime safety + TypeScript type inference              |
| Single file vs modules    | Single file (`open-spec-agent.ts`) | Easy to audit, copy, extend; split later if needed   |
| Loop bound                | `AI_MAX_ITERATIONS` (default 10)| Prevents runaway token spend                            |
| Injection prevention      | `z.enum` on `command` field     | Whitelists subcommands; user text only in flag values   |

---

## What Gets Built

| Deliverable               | Description                                                   |
|---------------------------|---------------------------------------------------------------|
| `open-spec-agent.ts`      | Main agent: config, tool registry, ReAct loop, main()        |
| `package.json` updates    | 3 new npm scripts + 5 dependencies                           |
| `README.md` update        | "AI Development Tools" section with setup & examples         |

---

## Acceptance Summary (10 criteria)

| AC   | Description                                           | Verified By              |
|------|-------------------------------------------------------|--------------------------|
| AC-1 | Agent runs without errors end-to-end                  | IT-001 scenario          |
| AC-2 | `propose` always precedes `apply`                     | IT-001 + system prompt   |
| AC-3 | CLI failures surfaced verbatim                        | IT-004 scenario          |
| AC-4 | All config from env vars; no hardcoded values         | IT-005, IT-008           |
| AC-5 | Terminates within `AI_MAX_ITERATIONS`                 | IT-006 scenario          |
| AC-6 | `DEBUG=true` prints payloads to stderr                | IT-007 scenario          |
| AC-7 | Zero TypeScript errors under `tsc --noEmit --strict`  | T-5.1 task               |
| AC-8 | New tool requires only `registry.set()`               | IT-009 + SPEC-REGISTRY-001 |
| AC-9 | Consistent emoji prefix format in output              | IT-010 scenario          |
| AC-10| README has prereqs, env vars, 3+ examples, FAQ        | README.md                |

---

## Implementation Effort

| Phase | Tasks | Description                             |
|-------|-------|-----------------------------------------|
| 1     | 6     | Project setup (package.json, tsconfig)  |
| 2     | 5     | Config layer + startup validation       |
| 3     | 9     | Tool registry + execute_openspec        |
| 4     | 6     | ReAct loop + main entry point           |
| 5     | 6     | Type checking, E2E validation, PR       |
| **Total** | **32** |                                    |

**Estimate:** 8 story points (as ticketed).

---

## Risks & Mitigations

| Risk                              | Mitigation                                              |
|-----------------------------------|---------------------------------------------------------|
| LLM skips `propose` step          | System prompt explicitly prohibits; AC-2 validates      |
| Runaway loop burns tokens         | `AI_MAX_ITERATIONS` hard cap (default: 10)              |
| OpenSpec CLI not installed        | Startup `which`/`where` check with install hint         |
| Command injection                 | `z.enum` whitelist + `shellQuote` for flag values       |
| Provider API outage               | Switch provider with one env var, no code change        |

---

## Next Steps After Merge

1. ✅ Check off all acceptance criteria and close FEAT-1423.
2. 🗄️  Run `openspec archive wrapper` to mark this change complete.
3. 🔜 Follow-up ticket: interactive confirmation mode (`--yes` flag / readline prompts).
4. 🔜 Follow-up ticket: add `git_status` and `read_file` tools to the registry.
5. 🔜 Follow-up ticket: streaming LLM output to terminal.

