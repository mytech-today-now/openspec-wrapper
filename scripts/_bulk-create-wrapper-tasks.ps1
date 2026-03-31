. "$PSScriptRoot\beads-helpers.ps1"

Write-Host ''
Write-Host '=== Creating OpenSpec AI Agent Wrapper Tasks (FEAT-1423) ===' -ForegroundColor Cyan
Write-Host ''

Write-Host 'Phase 1 - Project Setup' -ForegroundColor Yellow

$t11 = (bd create '[wrapper][P1] T-1.1 Add ESM module type to package.json' -Description 'Set type=module in package.json so Node 20+ LTS treats all .ts/.js files as ESM. Required before any import statements are written. Ref: design.md Technology Decisions.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t11.id)  T-1.1"

$t12 = (bd create '[wrapper][P1] T-1.2 Install runtime dependencies' -Description 'npm install ai-powered zod. ai-powered is the provider-agnostic LLM client covering OpenAI, Anthropic, Ollama and xAI. Zod provides runtime schema validation and TypeScript type inference for tool inputs. Ref: design.md, SPEC-TOOL-001.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t12.id)  T-1.2"

$t13 = (bd create '[wrapper][P1] T-1.3 Install dev dependencies' -Description 'npm install --save-dev tsx typescript and @types/node. tsx enables zero-compile-step execution. typescript 5.7 supports strict ESM. Ref: design.md Technology Decisions.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t13.id)  T-1.3"

$t14 = (bd create '[wrapper][P1] T-1.4 Add npm scripts to package.json' -Description 'Add three scripts: openspec:agent runs tsx open-spec-agent.ts; openspec:agent:build runs tsc --outDir dist --declaration; openspec:agent:run runs node dist/open-spec-agent.js. Ref: README.md NPM Scripts table, AC-10.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t14.id)  T-1.4"

$t15 = (bd create '[wrapper][P1] T-1.5 Create tsconfig.json' -Description 'Create tsconfig.json with strict true, module node16, moduleResolution node16, target es2022, outDir dist. node16 resolution enforces .js import extensions for ESM. Ref: design.md, SPEC-AGENT-007.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t15.id)  T-1.5"

$t16 = (bd create '[wrapper][P1] T-1.6 Add .env files to .gitignore' -Description 'Append .env and .env* patterns to .gitignore so API keys are never committed. Also add dist/ if not already excluded. Ref: design.md Security Design, README.md Setup.' -Priority 3 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t16.id)  T-1.6"

Write-Host 'Phase 2 - Config Layer' -ForegroundColor Yellow

$t21 = (bd create '[wrapper][P2] T-2.1 Define AgentConfig TypeScript interface' -Description 'Define AgentConfig interface with 8 fields: provider, model, apiKey, baseUrl, temperature as number, maxIterations as number, cwd as string, debug as boolean. Ref: design.md Config Interface, SPEC-AGENT-008.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t21.id)  T-2.1"

$t22 = (bd create '[wrapper][P2] T-2.2 Implement resolveConfig function' -Description 'Read 8 env vars: AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL, AI_TEMPERATURE, AI_MAX_ITERATIONS, OPENSPEC_CWD, DEBUG. Apply documented defaults. Parse temperature as float, maxIterations as int. Ref: design.md, UT-CONFIG-001, UT-CONFIG-002.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t22.id)  T-2.2"

$t23 = (bd create '[wrapper][P2] T-2.3 Add API key startup validation' -Description 'After resolveConfig, if provider is not ollama and apiKey is empty, print error message and exit code 1. No LLM call must be made before this check passes. Ref: SPEC-AGENT-008, UT-CONFIG-003, IT-008.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t23.id)  T-2.3"

$t24 = (bd create '[wrapper][P2] T-2.4 Add openspec CLI availability check' -Description 'On startup run where openspec on Windows or which openspec on Unix. If exit code is nonzero, print not found message with npm install -g openspec hint and exit code 1. Ref: design.md Startup Sequence, README.md Troubleshooting.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t24.id)  T-2.4"

$t25 = (bd create '[wrapper][P2] T-2.5 Smoke-test ai-powered client wiring' -Description 'Instantiate ai-powered client with resolved config, make a single generateText call with a trivial prompt, print provider and model to console, verify no errors thrown. Confirms LLM integration before building the full agent loop. Ref: design.md.' -Priority 3 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t25.id)  T-2.5"

Write-Host 'Phase 3 - Tool Registry and execute_openspec' -ForegroundColor Yellow

$t31 = (bd create '[wrapper][P3] T-3.1 Define ToolDefinition generic interface' -Description 'Define generic ToolDefinition interface with Zod type parameter. Fields: name string, description string, schema Zod type, execute async function returning Promise of string. Ref: specs/tool-registry.spec.md, SPEC-REGISTRY-001.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t31.id)  T-3.1"

$t32 = (bd create '[wrapper][P3] T-3.2 Instantiate tool registry Map' -Description 'Declare registry as a Map of string to ToolDefinition at module scope in open-spec-agent.ts. All tools are registered into this map before runAgent is called. Ref: SPEC-REGISTRY-001, SPEC-REGISTRY-002.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t32.id)  T-3.2"

$t33 = (bd create '[wrapper][P3] T-3.3 Define ExecuteOpenspecSchema with Zod' -Description 'Zod schema with command as enum of: propose, apply, archive, status, list, init. Add optional args string array and optional flags string record. The enum whitelist is the primary injection-prevention boundary. Ref: SPEC-TOOL-001, UT-CMD-001 through UT-CMD-004.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t33.id)  T-3.3"

$t34 = (bd create '[wrapper][P3] T-3.4 Implement shellQuote helper function' -Description 'Implement shellQuote that wraps a value in double-quotes and escapes any embedded double-quotes. Used for all flag values in command assembly to prevent shell injection. Ref: SPEC-TOOL-003, UT-QUOTE-001, UT-QUOTE-002, UT-QUOTE-003.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t34.id)  T-3.4"

$t35 = (bd create '[wrapper][P3] T-3.5 Implement executeOpenspec function' -Description 'Assemble command string as openspec cmd args --flag value. Execute with 60-second timeout via child_process exec. Capture stdout and stderr. Return ToolResult with success flag, command string, stdout, stderr. Log assembled command with Tool: prefix before exec. Ref: SPEC-TOOL-002, SPEC-TOOL-004 through SPEC-TOOL-008.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t35.id)  T-3.5"

$t36 = (bd create '[wrapper][P3] T-3.6 Implement stderr scrubbing' -Description 'Before returning ToolResult, replace lines matching sk- API key pattern or Bearer token pattern with REDACTED. Prevents API keys from leaking into LLM tool-result messages. Ref: SPEC-TOOL-006, UT-SCRUB-001, UT-SCRUB-002, UT-SCRUB-003.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t36.id)  T-3.6"

$t37 = (bd create '[wrapper][P3] T-3.7 Register execute_openspec in registry' -Description 'Call registry.set with name execute_openspec, description string sent to the LLM, ExecuteOpenspecSchema as schema, and executeOpenspec as the execute function. Ref: SPEC-REGISTRY-001, SPEC-REGISTRY-002.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t37.id)  T-3.7"

$t38 = (bd create '[wrapper][P3] T-3.8 Implement dispatchTool function' -Description 'Look up tool by name in registry and throw Unknown tool error if missing. Zod-parse the input and throw ZodError if invalid so execute is never called with bad data. Call tool.execute and return string result. Ref: SPEC-DISPATCH-001, UT-DISPATCH-001 through UT-DISPATCH-003.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t38.id)  T-3.8"

$t39 = (bd create '[wrapper][P3] T-3.9 Manual integration test for executeOpenspec list' -Description 'Temporarily call executeOpenspec with command list directly in main and print the ToolResult JSON. Confirm openspec CLI output is captured correctly. Remove temp call before committing. Ref: IT-002.' -Priority 3 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t39.id)  T-3.9"

Write-Host 'Phase 4 - ReAct Loop and Main Entry Point' -ForegroundColor Yellow

$t41 = (bd create '[wrapper][P4] T-4.1 Define system prompt constant' -Description 'Define SYSTEM_PROMPT constant targeting 400 tokens or fewer. Must cover: agent identity, 4-stage workflow propose-apply-archive, and 5 hard rules: no skipping steps, no fabrication, surface exact error text, ask for clarification on ambiguous input, end with status summary. Ref: design.md, SPEC-AGENT-001.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t41.id)  T-4.1"

$t42 = (bd create '[wrapper][P4] T-4.2 Implement buildToolSchema function' -Description 'Convert each ToolDefinition in the registry to the schema format expected by ai-powered tools parameter: name, description, and JSON Schema derived from the Zod schema. Ref: SPEC-REGISTRY-002, design.md Tool Registry.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t42.id)  T-4.2"

$t43 = (bd create '[wrapper][P4] T-4.3 Implement runAgent core ReAct loop' -Description 'Initialize messages with system prompt and user request. Enter bounded loop up to maxIterations. On tool_use: dispatch all tool calls and append assistant and tool-result messages. On end_turn: print final answer and break. On iteration cap: print warning and exit gracefully. Ref: SPEC-AGENT-002 through SPEC-AGENT-005, IT-001.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t43.id)  T-4.3"

$t44 = (bd create '[wrapper][P4] T-4.4 Add DEBUG logging to ReAct loop' -Description 'When debug config is true, print full LLM request payload and response payload to stderr with DEBUG prefix before and after each LLM call. Ref: SPEC-AGENT-006, IT-007.' -Priority 3 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t44.id)  T-4.4"

$t45 = (bd create '[wrapper][P4] T-4.5 Implement main entry point' -Description 'Read process.argv[2] as the user request. If missing, print usage hint and exit with code 1. Call resolveConfig then runAgent. Catch all top-level errors, print to stderr, exit with code 1. Ref: SPEC-AGENT-007, IT-008.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t45.id)  T-4.5"

$t46 = (bd create '[wrapper][P4] T-4.6 Apply consistent emoji prefix format to all output' -Description 'Audit all console output and apply prefix format: thinking for reasoning, Tool: name for dispatch, Result: for tool output, checkmark for success, warning for max-iterations cap, X for errors. Ref: SPEC-AGENT-009, IT-010, AC-9.' -Priority 3 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t46.id)  T-4.6"

Write-Host 'Phase 5 - Validation and Documentation' -ForegroundColor Yellow

$t51 = (bd create '[wrapper][P5] T-5.1 Run tsc --noEmit --strict and fix all type errors' -Description 'Run npx tsc --noEmit --strict. Zero errors required per AC-7. Common issues: missing return types, implicit any in callbacks, untyped exec promisify, Zod infer generics. Fix all before marking complete.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t51.id)  T-5.1"

$t52 = (bd create '[wrapper][P5] T-5.2 End-to-end test: verify propose precedes apply' -Description 'Run npm run openspec:agent with a dark mode toggle request. Verify: propose is called before apply in console output, proposal text is presented, exit code is 0. Ref: AC-1, AC-2, IT-001.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t52.id)  T-5.2"

$t53 = (bd create '[wrapper][P5] T-5.3 Failure test: invalid or missing API key' -Description 'Unset AI_API_KEY or set to an invalid value and run the agent. Verify: clear error message on stderr, exit code 1, no HTTP call made to the LLM provider. Ref: AC-3, AC-4, IT-008.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t53.id)  T-5.3"

$t54 = (bd create '[wrapper][P5] T-5.4 Debug mode test: payloads printed to stderr' -Description 'Run with DEBUG=true and redirect stderr to a log file. Verify log contains at least one DEBUG entry with raw LLM request or response JSON. stdout must still show normal agent output. Ref: AC-6, IT-007.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t54.id)  T-5.4"

$t55 = (bd create '[wrapper][P5] T-5.5 Update root README with AI Development Tools section' -Description 'Add AI Development Tools section to root README.md covering prerequisites, .env setup, three or more invocation examples, and a link to openspec/changes/wrapper/README.md for full docs. Ref: AC-10.' -Priority 2 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t55.id)  T-5.5"

$t56 = (bd create '[wrapper][P5] T-5.6 Open PR with end-to-end recording' -Description 'Open PR for the wrapper feature. Include terminal recording or screenshot of full propose-to-apply workflow, checklist confirming all 10 acceptance criteria are met, link to FEAT-1423, and summary of key design decisions. Ref: summary.md, AC-1 through AC-10.' -Priority 1 -Type 'task' --json) | ConvertFrom-Json
Write-Host "  $($t56.id)  T-5.6"

Write-Host ''
Write-Host 'Wiring dependencies...' -ForegroundColor Yellow

bd dep add $t14.id $t11.id; bd dep add $t14.id $t12.id; bd dep add $t14.id $t13.id; bd dep add $t15.id $t11.id
bd dep add $t21.id $t14.id; bd dep add $t21.id $t15.id; bd dep add $t22.id $t21.id
bd dep add $t23.id $t22.id; bd dep add $t24.id $t22.id
bd dep add $t25.id $t22.id; bd dep add $t25.id $t23.id; bd dep add $t25.id $t24.id
bd dep add $t31.id $t21.id; bd dep add $t32.id $t31.id
bd dep add $t33.id $t32.id; bd dep add $t33.id $t12.id
bd dep add $t34.id $t33.id; bd dep add $t35.id $t34.id; bd dep add $t36.id $t35.id
bd dep add $t37.id $t35.id; bd dep add $t37.id $t36.id; bd dep add $t38.id $t37.id; bd dep add $t39.id $t37.id
bd dep add $t41.id $t38.id; bd dep add $t42.id $t38.id
bd dep add $t43.id $t41.id; bd dep add $t43.id $t42.id
bd dep add $t44.id $t43.id; bd dep add $t45.id $t43.id; bd dep add $t45.id $t23.id; bd dep add $t45.id $t24.id
bd dep add $t46.id $t43.id; bd dep add $t46.id $t44.id; bd dep add $t46.id $t45.id
bd dep add $t51.id $t46.id; bd dep add $t52.id $t51.id; bd dep add $t53.id $t51.id; bd dep add $t54.id $t51.id
bd dep add $t55.id $t46.id
bd dep add $t56.id $t52.id; bd dep add $t56.id $t53.id; bd dep add $t56.id $t54.id; bd dep add $t56.id $t55.id

Write-Host ''
Write-Host '=== Done ===' -ForegroundColor Green
Write-Host ''
bd stats
