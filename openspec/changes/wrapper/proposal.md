# Proposal: OpenSpec AI Agent Wrapper

**Change:** `wrapper`
**Ticket:** FEAT-1423
**Status:** Proposed
**Author:** layla
**Date:** 2026-03-30
**Priority:** High

---

## Problem Statement

Engineers using OpenSpec today must manually translate a feature idea into a correctly
formatted CLI command, monitor intermediate output, decide when to move to the next stage,
and juggle all of this across their editor, a terminal, and a separate AI chat window.

This friction compounds over time:

- A misformatted `openspec propose` command silently generates a poor proposal.
- Engineers skip the `archive` step, leaving orphaned proposal files.
- There is no repeatable, auditable record of which AI helped draft a proposal or why a
  particular apply order was chosen.
- Context switching between tools breaks flow and increases the chance of skipping steps.

---

## Proposed Solution

Create `open-spec-agent.ts` — a single-file, TypeScript AI agent embedded directly in this
repository's npm scripts. The agent:

1. Accepts a natural language feature request as a CLI argument.
2. Uses [ai-powered](https://github.com/mytech-today-now/ai-powered.git) to reason over the
   request via a ReAct (Reason + Act) loop.
3. Calls the real `openspec` CLI at each step — never simulating or fabricating output.
4. Guides the engineer through the mandatory `propose → review → apply → archive` sequence.

The agent is provider-agnostic: any LLM supported by `ai-powered` (OpenAI, Anthropic,
xAI/Grok, Ollama, Venice) can be selected via a single environment variable.

---

## Goals

- **G-1** Eliminate manual CLI invocation for the propose/apply/archive lifecycle.
- **G-2** Enforce correct workflow ordering via system prompt and bounded ReAct loop.
- **G-3** Support all `ai-powered` providers with zero code changes between providers.
- **G-4** Surface CLI errors verbatim — no silent failures, no fabricated output.
- **G-5** Keep the implementation in one auditable file, easy to review and extend.
- **G-6** Make the tool-calling layer open to future extensions (e.g., `git_status`,
  `read_file`) without changing the agent core.

---

## Non-Goals

- **NG-1** Interactive multi-turn conversation (readline/inquirer prompts). The agent runs,
  prints its reasoning, executes the workflow, and exits. Interactive mode is a follow-up.
- **NG-2** Streaming LLM output to the terminal. Non-streaming `chat()` is sufficient for
  the initial implementation; streaming is a nice-to-have follow-on.
- **NG-3** A web UI or REST API surface. This is a CLI/npm-script tool only.
- **NG-4** OpenSpec CLI installation or version management. The CLI must be pre-installed.
- **NG-5** Replacing or wrapping the `openspec` CLI itself. This agent invokes it as-is.

---

## User Impact

| User          | Before                                           | After                                              |
|---------------|--------------------------------------------------|----------------------------------------------------|
| Engineer      | Writes CLI command, monitors output, repeats     | Runs one npm script with a plain-English request   |
| Team lead     | Cannot audit which AI shaped a proposal          | Every tool call and result is logged to console    |
| New joiner    | Must learn OpenSpec CLI syntax before proposing  | Describes the feature naturally; agent handles CLI |
| Future dev    | Adding a new tool means touching agent internals | Registers a new `ToolDefinition` in the registry  |

---

## Success Metrics

- Time from feature idea to applied proposal reduced by ≥ 50% (self-reported, sprint retro).
- Zero `apply` calls in the wild that were not preceded by a `propose` (verifiable via logs).
- Agent used by all engineers in the team within two sprints of merge.
- No provider-specific code paths — switching `AI_PROVIDER` requires no code changes.

---

## Risks

| Risk                                        | Likelihood | Impact | Owner    |
|---------------------------------------------|------------|--------|----------|
| LLM skips `propose` and calls `apply` early | Medium     | High   | Assignee |
| OpenSpec CLI not installed on dev machine   | Medium     | High   | Assignee |
| Runaway token spend in unbounded loop       | Low        | Medium | Assignee |
| Provider API outage blocks workflow         | Low        | High   | Assignee |
| Command injection via crafted feature text  | Low        | High   | Assignee |

All risks have documented mitigations in `design.md`.

---

## Stakeholders

| Role          | Name    | Interest                                  |
|---------------|---------|-------------------------------------------|
| Reporter      | layla   | Feature owner, acceptance sign-off        |
| Assignee      | TBD     | Implementation                            |
| Reviewers     | Team    | Code review, PR approval                  |
| Future users  | All devs| Day-to-day consumer of the npm script     |

