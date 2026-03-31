# Changelog

All notable changes to **openspec-wrapper** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.2.4] — 2026-03-31

### Fixed
- **GPT-4o narration bug** — the agent now detects when the model narrates a plan in plain
  text instead of calling a tool, and injects a one-time "nudge" correction turn that
  instructs the model to emit a `<tool_call>` block immediately.  A `nudgedLastTurn` flag
  prevents infinite nudge cycles — if the model still narrates after the nudge the response
  is treated as the final answer.
- **Code-block tool-call fallback** — `parseToolCall` now recognises the ` ```json ` code
  fence format that GPT-4o sometimes emits instead of the primary `<tool_call>` XML tags.

### Changed
- `buildToolSystemPrompt` rewritten with explicit anti-narration rules, a worked example,
  and numbered constraints to make the tool-calling protocol harder to ignore across all
  providers.
- `maxTokens` raised from 4 096 to 8 192 to accommodate longer artifact content.
- `parseToolCall` exported (was private) to enable direct unit testing.

### Added
- `looksLikePlanning(text)` — exported helper function that returns `true` when the model
  response matches common narration patterns (`I will`, `I'll`, `Let me`, `First,`, etc.).
- **7 new unit tests** — T-6.1 a/b/c/d (parseToolCall XML, code-block, prose, malformed JSON),
  T-6.2 a/b (looksLikePlanning positive/negative), T-5.5 (nudge integration test).
  Total test count raised from 4 to 11.

---

## [0.2.3] — 2026-03-31

### Fixed
- **Fictional CLI commands removed** — `execute_openspec` now rejects `propose` and `apply`
  (which never existed in the `openspec` binary) and whitelists only real subcommands:
  `new`, `instructions`, `archive`, `list`, `status`, `init`, `validate`, `show`.
- **Missing file-writing capability** — added `write_file` tool that writes UTF-8 content
  to disk, creating parent directories as needed. The `openspec` CLI only generates
  instructions; the agent must now call `write_file` to materialise each artifact.
- **System prompt corrected** — updated `SYSTEM_PROMPT` to describe the real workflow:
  `new` → `instructions` → `write_file` (per artifact) → `archive`.

### Changed
- `ExecuteOpenspecSchema` enum updated from `['propose','apply','archive','status','list','init']`
  to `['new','instructions','archive','list','status','init','validate','show']`.
- `execute_openspec` registry description updated to list real subcommands.
- T-5.2 test updated: asserts `new` precedes `instructions` (was `propose` before `apply`).

### Added
- `WriteFileSchema` and `WriteFileInput` exported types.
- `writeFileTool()` function (exported) — uses `fs/promises.writeFile` + `mkdir({ recursive: true })`.
- `write_file` registered in the global tool registry.

---

## [0.2.2] — 2026-03-31

### Fixed
- **Missing `bin` field** — `open-spec-agent` is now exposed as a CLI binary in
  `package.json`'s `bin` field, pointing to `dist/open-spec-agent.js`.  When
  `@mytechtoday/openspec-wrapper` is installed as a dependency in another repo,
  npm links `openspec-agent` into that project's `node_modules/.bin/` so it can
  be invoked via `npx openspec-agent` or referenced in the host project's npm
  scripts as `"openspec:agent": "openspec-agent"`.  Previously, the agent scripts
  existed only in `openspec-wrapper`'s own `package.json` and were inaccessible
  to consuming projects.

### Added
- **Shebang line** (`#!/usr/bin/env node`) added as the first line of
  `open-spec-agent.ts`; TypeScript preserves it in the compiled `dist/open-spec-agent.js`
  output, making the binary directly executable on macOS, Linux, and WSL.

---

## [0.2.1] — 2026-03-31

### Changed
- **Registry migrated to public npmjs.com** — package is now published at
  `https://registry.npmjs.org` with public access; no GitHub PAT or `.npmrc`
  changes needed to install.
- **README.md** restructured for npm consumers: `npm install` is now the
  primary installation path (no auth required); clone-the-repo instructions
  moved to the new "Contributing / Local Development" section.
- Installation section simplified to two steps: `npm install` + `npm install -g openspec`.
- Uninstall section simplified: removed `.npmrc` cleanup and PAT revocation
  steps (no longer required for a public package).
- Publishing workflow updated: `npm login` to npmjs instead of GitHub PAT.
- Badge updated to the live npmjs version shield.
- `publishConfig.registry` changed from `https://npm.pkg.github.com` to
  `https://registry.npmjs.org`; `access` changed from `restricted` to `public`.
- `.npmrc` updated to remove GitHub Packages auth lines.
- Version bumped `0.2.0` → `0.2.1` across `package.json`, `VERSION`, and
  `README.md` badge.

### Added
- First public release to npmjs.com
  (`https://www.npmjs.com/package/@mytechtoday/openspec-wrapper`).
- Package renamed from `@mytech-today-now/openspec-wrapper` to
  `@mytechtoday/openspec-wrapper` to match the npm username `mytechtoday`.

---

## [0.2.0] — 2026-03-31

### Added
- **Provider-agnostic LLM support** via the `ai-powered` library.  The agent
  now works with OpenAI, Anthropic, xAI, Venice, and local Ollama instances —
  set `AI_PROVIDER` in `.env` to switch providers with no code changes.
- `AiClientLike` interface exported from `open-spec-agent.ts` — a minimal
  surface (`generateText`) that tests can mock without importing `ai-powered`.
- `buildToolSystemPrompt()` — serialises all registered tools into a
  system-prompt section that instructs the LLM to use the `<tool_call>` XML
  protocol for tool invocation.
- `parseToolCall()` — extracts and parses the first `<tool_call>…</tool_call>`
  block from an LLM text response.
- `mapProvider()` — maps `AI_PROVIDER` values to `ai-powered` provider names
  (`ollama` → `custom`, unknown → `openai` with a warning).
- `.env.example` template documenting all 8 environment variables with defaults
  and inline comments.
- `.gitignore` entries for `*.tsbuildinfo`, `*.log`, editor config directories,
  and proper `.env` / `.env.*` / `!.env.example` handling.
- `CHANGELOG.md` (this file) — full version history.
- `VERSION` — plain-text version file mirroring `package.json`.
- Complete `README.md` with setup, init, usage, configuration reference,
  development guide, uninstall, and troubleshooting sections.
- GitHub Packages publish configuration (`publishConfig.registry`).

### Changed
- `buildToolSchema()` now returns a provider-agnostic
  `{ name, description, parameters }` descriptor (plain JSON Schema) instead of
  an Anthropic SDK `Tool` object.
- `runAgent()` rewritten to use `ai-powered`'s `generateText()` and the
  text-based `<tool_call>` tool-calling protocol instead of the Anthropic
  Messages API structured tool-use protocol.
- `AnthropicClientLike` interface replaced by `AiClientLike` — tests updated
  accordingly.
- Conversation history is now maintained as an accumulated multi-turn prompt
  string (`Human:` / `Assistant:` / `Tool Result:` sections) rather than an
  array of `Anthropic.MessageParam` objects.
- Package name scoped to `@mytech-today-now/openspec-wrapper` for npm registry
  publishing (later renamed to `@mytechtoday/openspec-wrapper` in v0.2.1).
- Version bumped from `0.1.0` to `0.2.0`.

### Removed
- Direct dependency on `@anthropic-ai/sdk` (moved to optional devDependency for
  legacy reference only; no longer required at runtime or in tests).

### Fixed
- Agent startup banner now shows the actual `AI_PROVIDER` value instead of
  always printing `provider: anthropic`.

---

## [0.1.0] — 2026-03-15

### Added
- Initial release of `openspec-wrapper`.
- `open-spec-agent.ts` — single-file TypeScript ReAct agent implementing the
  Think → Act → Observe loop using the Anthropic Messages API.
- `execute_openspec` tool: drives `propose`, `apply`, `archive`, `status`,
  `list`, and `init` subcommands via the OpenSpec CLI.
- `resolveConfig()` — reads all agent configuration from environment variables
  and validates required fields at startup (fast-fail on missing `AI_API_KEY`).
- `checkOpenspecCLI()` — verifies the OpenSpec CLI is on `PATH` before any LLM
  call is made.
- `shellQuote()` — escapes flag values before CLI assembly (injection prevention).
- `scrubStderr()` — redacts API keys and bearer tokens from CLI stderr output
  before returning it to the LLM.
- `dispatchTool()` — looks up, Zod-validates, and executes registered tools.
- `buildToolSchema()` / `zodToJsonSchema()` — converts Zod schemas to JSON Schema.
- DEBUG mode (`DEBUG=true`): prints full LLM request and response payloads to
  stderr for diagnostics.
- Test suite: T-2.5 (ai-powered smoke), T-5.2 (ReAct order), T-5.3 (missing key
  fast-fail), T-5.4 (DEBUG payloads).
- `package.json` with `openspec:agent`, `typecheck`, `test`, and build scripts.
- `tsconfig.json` targeting ES2022 / Node16 module resolution.

---

[Unreleased]: https://github.com/mytech-today-now/openspec-wrapper/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/mytech-today-now/openspec-wrapper/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/mytech-today-now/openspec-wrapper/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mytech-today-now/openspec-wrapper/releases/tag/v0.1.0

