# Changelog

All notable changes to **openspec-wrapper** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.2.1] — 2026-03-31

### Changed
- **README.md** restructured for npm consumers: `npm install` is now the
  primary installation path; clone-the-repo instructions moved to the new
  "Contributing / Local Development" section.
- Installation section updated with step-by-step GitHub Packages auth
  (`NODE_AUTH_TOKEN` + `.npmrc`) and install instructions.
- Uninstall section updated: removed "delete the cloned repo" step; added
  PAT revocation guidance and `.npmrc` cleanup instructions.
- Added "Publishing a new version" workflow to the Contributing section.
- Added npm badge pointing to the GitHub Packages registry page.
- Version bumped `0.2.0` → `0.2.1` across `package.json`, `VERSION`, and
  `README.md` badge.

### Added
- First published release to GitHub Packages
  (`https://npm.pkg.github.com/@mytech-today-now/openspec-wrapper`).

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
  publishing.
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

