JIRA Ticket
Ticket Key: FEAT-1423
Summary: Create OpenSpec AI Agent Wrapper powered by ai-powered package for intelligent execution of OpenSpec workflows
Description:
As an engineer working in this repository, I want a clean, reusable, and production-ready AI Agent wrapper that executes real OpenSpec CLI commands (openspec propose, openspec apply, openspec archive, etc.) through an intelligent agent.
This wrapper should be powered entirely by the ai-powered package as the LLM client and tool-calling engine. The agent must understand natural language feature requests and intelligently drive the full OpenSpec workflow inside the existing repository (which already has openspec init completed).
Business / Development Value

Enable natural language driven development using OpenSpec methodology.
Reduce context switching between IDE, terminal, and AI.
Create a consistent, repeatable way to invoke OpenSpec via AI agents.
Make the process more intelligent than simple CLI calls.

Detailed Requirements
1. Core Implementation

Create a main file: open-spec-agent.ts (TypeScript preferred) or open-spec-agent.js
Use ai-powered for all LLM interactions (supporting OpenAI, Anthropic, Grok/xAI, Ollama, and other providers via config).
Implement a ReAct-style reasoning loop that supports multiple tool calls and conversation turns.
Create a custom tool named execute_openspec that safely executes any openspec <command> via Node.js child_process.exec in the repository root.

2. Technical Specifications

Use proper function/tool calling supported by ai-powered.
Define tool parameters using Zod schemas for validation and structured output.
Include a strong system prompt that enforces correct OpenSpec workflow order: propose → review proposal → apply → archive.
Support streaming output where the underlying provider allows it.
Comprehensive error handling, logging, and graceful failure recovery.
Run all commands with cwd: process.cwd() to ensure it operates in the current repo root.
Respect environment variables (API keys, model selection, temperature, etc.).

3. Additional Files to Create / Update

Update package.json:
Add required dependencies (ai-powered, zod, @types/node if using TS).
Add npm script: "openspec:agent": "tsx open-spec-agent.ts", "openspec:agent:js": "node open-spec-agent.js"

Add a clear section in README.md under "AI Development Tools" explaining setup and usage.

4. Desired User Experience
After implementation, the following should work seamlessly:
Bashnpm run openspec:agent "Implement dark mode toggle that respects system preference, includes smooth transitions, and persists user choice"
Expected agent behavior:

Analyze the request.
Call openspec propose ... with appropriate title.
Present the generated proposal clearly.
Wait for user confirmation (or proceed based on explicit instructions).
Execute openspec apply when appropriate.
Provide summary and next steps.

Acceptance Criteria

 Agent successfully executes real openspec CLI commands via the tool.
 Agent correctly handles multi-turn reasoning and tool responses.
 Supports configuration via environment variables for provider and model.
 Code is written in clean, well-commented, modular TypeScript (with .d.ts support if needed).
 Includes helpful console output with emojis and clear status messages.
 Proper error handling for missing CLI, failed commands, or LLM errors.
 README section with setup instructions and multiple usage examples.
 Easy to extend with additional tools (git status, file operations, etc.) in the future.
 No hardcoded credentials or provider-specific assumptions.

Technical Notes & Constraints

Do not simulate OpenSpec — always call the real CLI.
Prefer TypeScript with proper types and ESM syntax.
Keep the implementation focused, modular, and avoid unnecessary complexity.
Ensure the agent can be run both as a script and potentially integrated into larger agent frameworks later.

Priority: Medium
Labels: ai-agent, openspec, automation, developer-experience
Assignee: @you
Reporter: layla