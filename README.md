# openspec-wrapper

> AI agent wrapper that drives the [OpenSpec](https://npmjs.com/package/openspec) CLI
> via natural language.  One command drives the full
> `propose → review → apply → archive` workflow autonomously.

[![Version](https://img.shields.io/badge/version-0.2.1-blue)](CHANGELOG.md)
[![npm](https://img.shields.io/npm/v/%40mytech-today-now%2Fopenspec-wrapper?label=npm)](https://www.npmjs.com/package/@mytech-today-now/openspec-wrapper)
[![Node](https://img.shields.io/badge/node-%E2%89%A520%20LTS-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Private-lightgrey)](#license)

**Ticket:** FEAT-1423

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Initialization](#initialization)
5. [Environment Setup](#environment-setup)
6. [Usage](#usage)
7. [NPM Scripts](#npm-scripts)
8. [Configuration Reference](#configuration-reference)
9. [Project Structure](#project-structure)
10. [Contributing / Local Development](#contributing--local-development)
11. [Uninstall](#uninstall)
12. [Troubleshooting](#troubleshooting)
13. [Changelog](#changelog)
14. [License](#license)

---

## Overview

`openspec-wrapper` is a single-file TypeScript [ReAct](https://arxiv.org/abs/2210.03629)
agent that accepts a natural-language feature request and executes the OpenSpec CLI on
your behalf.  It is **provider-agnostic**: the same agent works with OpenAI, Anthropic,
xAI, Venice, or a local Ollama instance — just set `AI_PROVIDER` in your `.env`.

```
npm run openspec:agent "Add a dark mode toggle that persists to localStorage"
```

The agent will:

1. **Think** — reason about the request using the configured LLM
2. **Act** — call `openspec propose` to generate a specification
3. **Observe** — read the CLI output and present it to you
4. **Act** — call `openspec apply` after your implicit or explicit confirmation
5. **Respond** — summarise what was done and what comes next

---

## Prerequisites

| Requirement  | Version    | How to obtain                             |
|--------------|------------|-------------------------------------------|
| Node.js      | ≥ 20 LTS  | <https://nodejs.org> or `nvm install --lts` |
| npm          | ≥ 10       | Included with Node.js ≥ 20               |
| OpenSpec CLI | any        | `npm install -g openspec`                 |
| LLM API key  | —          | See [Environment Setup](#environment-setup) |

> **Ollama users:** No API key is needed.  Set `AI_PROVIDER=ollama` and
> `AI_BASE_URL=http://localhost:11434/v1` in your `.env`.

---

## Installation

The package is published publicly to **npmjs.com**.

### Step 1 — Install the package

```bash
npm install @mytech-today-now/openspec-wrapper
```

No authentication or `.npmrc` changes are needed — it is a public package.

### Step 2 — Install the OpenSpec CLI

```bash
npm install -g openspec
```

---

## Initialization

After installing dependencies, initialise the OpenSpec workspace inside your
project directory:

```bash
# Initialise OpenSpec in the current directory (creates openspec/config.yaml)
openspec init

# Optionally set a custom working directory for all CLI calls
export OPENSPEC_CWD=/path/to/your/project
```

Then copy the environment template and fill in your credentials:

```bash
cp .env.example .env
# Edit .env with your preferred editor
```

---

## Environment Setup

Create a `.env` file in the repository root — **never commit it** (it is listed
in `.gitignore`).

```env
# ── Required ────────────────────────────────────────────────────────────────
# API key for your LLM provider.
# Not required when AI_PROVIDER=ollama (Ollama runs locally).
AI_API_KEY=sk-your-key-here

# ── Provider ─────────────────────────────────────────────────────────────────
# Supported: openai | anthropic | xai | venice | ollama
# Default: openai
AI_PROVIDER=openai

# ── Model ────────────────────────────────────────────────────────────────────
# Leave blank to use the provider's default model.
# Examples: gpt-4o | claude-3-5-sonnet-latest | grok-beta | llama3
AI_MODEL=

# ── Base URL override ─────────────────────────────────────────────────────────
# Use this for proxies, self-hosted endpoints, or Ollama.
# Example (Ollama): AI_BASE_URL=http://localhost:11434/v1
AI_BASE_URL=

# ── Agent behaviour ───────────────────────────────────────────────────────────
AI_TEMPERATURE=0.2          # Sampling temperature  (0.0 – 1.0)
AI_MAX_ITERATIONS=10        # Max ReAct loop iterations before the agent stops

# ── OpenSpec CLI ──────────────────────────────────────────────────────────────
# Working directory passed to every openspec CLI invocation.
# Defaults to the directory from which the agent is launched.
OPENSPEC_CWD=

# ── Debugging ─────────────────────────────────────────────────────────────────
# Set to "true" to print full LLM request/response payloads to stderr.
DEBUG=false
```

> **Tip:** The file `.env.example` in this repository contains this template
> with all defaults pre-filled.  Run `cp .env.example .env` to get started.

---

## Usage

### Basic invocation

```bash
npm run openspec:agent "<natural language request>"
```

### Examples

**Propose and apply a new feature**

```bash
npm run openspec:agent "Add a dark mode toggle that respects system preference and persists to localStorage"
```

The agent calls `openspec propose`, presents the generated spec, then calls
`openspec apply` to scaffold the code.

**List all current proposals**

```bash
npm run openspec:agent "List all current proposals"
```

**Check the status of a specific change**

```bash
npm run openspec:agent "What is the status of the dark-mode-toggle change?"
```

**Archive a completed change**

```bash
npm run openspec:agent "Archive the dark-mode-toggle change"
```

**Run with a specific provider (override `.env`)**

```bash
AI_PROVIDER=anthropic AI_MODEL=claude-3-5-sonnet-latest \
  npm run openspec:agent "Add input validation to the login form"
```

**Run with a local Ollama model (no API key)**

```bash
AI_PROVIDER=ollama AI_BASE_URL=http://localhost:11434/v1 AI_MODEL=llama3 \
  npm run openspec:agent "Refactor the auth module"
```

**Inspect raw LLM payloads (debug mode)**

```bash
DEBUG=true npm run openspec:agent "List proposals" 2>debug.log
# Then inspect debug.log for full request/response JSON
```

---

## NPM Scripts

| Script                         | Purpose                                                          |
|--------------------------------|------------------------------------------------------------------|
| `npm run openspec:agent`       | Run the agent directly (no compile step, uses `--experimental-strip-types`) |
| `npm run openspec:agent:build` | Compile TypeScript to `dist/` with `tsc`                        |
| `npm run openspec:agent:run`   | Run the compiled `dist/open-spec-agent.js` via `node`           |
| `npm run typecheck`            | Type-check with `tsc --noEmit --strict`                         |
| `npm test`                     | Run the full test suite                                          |

---

## Configuration Reference

All configuration is read from environment variables at startup.  The agent
exits immediately with a clear error message if a required value is missing.

| Variable            | Required | Default           | Description                                                    |
|---------------------|----------|-------------------|----------------------------------------------------------------|
| `AI_API_KEY`        | Yes*     | —                 | LLM API key. *Not required when `AI_PROVIDER=ollama`.         |
| `AI_PROVIDER`       | No       | `openai`          | LLM provider: `openai`, `anthropic`, `xai`, `venice`, `ollama` |
| `AI_MODEL`          | No       | *(provider default)* | Model name. Leave blank to use the provider's recommended model. |
| `AI_BASE_URL`       | No       | —                 | Base URL for proxies, self-hosted, or Ollama.                  |
| `AI_TEMPERATURE`    | No       | `0.2`             | Sampling temperature (0.0 – 1.0). Lower = more deterministic. |
| `AI_MAX_ITERATIONS` | No       | `10`              | Maximum ReAct loop iterations before the agent exits gracefully. |
| `OPENSPEC_CWD`      | No       | `process.cwd()`   | Working directory for every `openspec` CLI invocation.         |
| `DEBUG`             | No       | `false`           | Set to `true` to print raw LLM payloads to stderr.            |

---

## Project Structure

```
openspec-wrapper/
├── open-spec-agent.ts        # Single-file agent (entry point + all logic)
├── open-spec-agent.test.ts   # Test suite (T-2.5, T-5.2, T-5.3, T-5.4)
├── package.json              # Dependencies, scripts, publish config
├── tsconfig.json             # TypeScript compiler settings
├── .env.example              # Environment variable template
├── .gitignore                # Git ignore rules
├── CHANGELOG.md              # Version history
├── VERSION                   # Plain-text current version
├── openspec/
│   ├── config.yaml           # OpenSpec workspace configuration
│   ├── changes/              # Feature proposals (generated by openspec propose)
│   └── specs/                # Approved specifications
└── scripts/
    └── beads-helpers.ps1     # Task management helpers (PowerShell)
```

---

## Contributing / Local Development

### Clone the repository

```bash
git clone https://github.com/mytech-today-now/openspec-wrapper.git
cd openspec-wrapper
npm install
cp .env.example .env   # fill in your API key
```

### Running tests

```bash
npm test
```

All four tests must pass:

| Test ID | Description                                              |
|---------|----------------------------------------------------------|
| T-2.5   | Smoke-test: ai-powered mock client returns a text result |
| T-5.2   | ReAct loop: `propose` precedes `apply` in console output |
| T-5.3   | Missing API key: exits with code 1 and clear stderr msg  |
| T-5.4   | DEBUG mode: LLM payloads printed to stderr               |

### Type-checking

```bash
npm run typecheck
```

### Publishing a new version

```bash
# 1. Bump version in package.json, VERSION, and CHANGELOG.md
# 2. Commit and push
git add . && git commit -m "chore(release): vX.Y.Z" && git push origin main

# 3. Log in to npmjs.com (one-time setup), then publish
npm login
npm publish
```

### Adding a new tool

1. Define a Zod schema for the tool's input.
2. Implement the `execute` function that returns a `string` result.
3. Register the tool in the `registry` Map in `open-spec-agent.ts`.
4. Add a test that verifies the tool's output format.

### Architecture

The agent uses the [ReAct](https://arxiv.org/abs/2210.03629) pattern:

```
User request
     │
     ▼
┌─────────────┐     <tool_call> found      ┌─────────────────┐
│  LLM call   │ ─────────────────────────► │  dispatchTool() │
│ (generateText)◄────────────────────────  │  (openspec CLI) │
└─────────────┘    Tool Result appended    └─────────────────┘
     │
     │  No <tool_call> in response
     ▼
Final answer printed → exit 0
```

Tool calling is implemented via a **text-based protocol**: tool schemas are
embedded in the system prompt, and the LLM outputs
`<tool_call>{"name":"…","input":{…}}</tool_call>` markers that the agent
parses and dispatches.  This works with **any** LLM provider.

---

## Uninstall

### Remove the package from your project

```bash
npm uninstall @mytech-today-now/openspec-wrapper
```

### Remove the OpenSpec CLI

```bash
npm uninstall -g openspec
```

### Remove your `.env` file

Your `.env` file contains your API key and is **not** tracked by Git.
Delete it manually when no longer needed:

```bash
rm .env                          # macOS / Linux / Git Bash
Remove-Item .env                 # PowerShell
```

---

## Troubleshooting

### `❌ AI_API_KEY is required for provider "openai"`

The agent requires `AI_API_KEY` to be set for all providers except Ollama.
Set it in your `.env` file or export it in your shell:

```bash
export AI_API_KEY=sk-your-key-here
```

### `❌ openspec CLI not found on PATH`

Install the CLI globally:

```bash
npm install -g openspec
```

Then verify it is on your PATH:

```bash
openspec --version
```

### `Error: Cannot find module 'ai-powered'`

Run `npm install` in the repository root to restore node_modules:

```bash
npm install
```

### The agent loops without producing a final answer

Increase `AI_MAX_ITERATIONS` in your `.env` (default is 10), or enable
`DEBUG=true` to inspect the raw LLM payloads and identify where reasoning
gets stuck.

### Ollama: `fetch failed` or `ECONNREFUSED`

Ensure the Ollama server is running:

```bash
ollama serve          # Start Ollama
ollama pull llama3    # Pull the model if not already downloaded
```

Then confirm `AI_BASE_URL=http://localhost:11434/v1` is set in your `.env`.

### Type errors after editing `open-spec-agent.ts`

```bash
npm run typecheck
```

This runs `tsc --noEmit --strict` and lists all type errors without producing
output files.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## License

Private — all rights reserved.  See repository settings for access controls.

Package registry: [npmjs.com — @mytech-today-now/openspec-wrapper](https://www.npmjs.com/package/@mytech-today-now/openspec-wrapper)

