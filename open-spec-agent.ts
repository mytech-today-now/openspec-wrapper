#!/usr/bin/env node
// open-spec-agent.ts
// OpenSpec AI Agent Wrapper — single-file TypeScript agent.
// Ticket: FEAT-1423
//
// Section layout:
//   1 — Imports & type declarations
//   2 — Config resolution (resolveConfig + startup validation)   [bd-fst3, bd-1xxf]
//   3 — Tool registry & execute_openspec schema                  [bd-bvzv]
//   4 — ReAct loop (runAgent)                                    [bd-1uu0, bd-xs2x, bd-43cy, bd-ypnq]
//   5 — main() entry point                                       [bd-2gos]

// =============================================================================
// Section 1 — Imports & type declarations
// =============================================================================

import { z } from 'zod';
import { getAiClient } from 'ai-powered';
import { exec } from 'node:child_process';
import { writeFile as fsWriteFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Runtime configuration resolved from environment variables at startup.
 * All LLM calls use this config; it is validated before any network request.
 * Ref: design.md Config Resolution, SPEC-AGENT-008
 */
export interface AgentConfig {
  /** LLM provider identifier (e.g. "openai", "anthropic", "ollama"). */
  provider: string;
  /** Model name; falls back to the provider's default when empty. */
  model: string;
  /** API key — required for every provider except "ollama". */
  apiKey: string;
  /** Optional base URL override (proxy / self-hosted endpoints). */
  baseUrl?: string;
  /** Sampling temperature. Default: 0.2. */
  temperature: number;
  /** Maximum ReAct iterations before the loop exits gracefully. Default: 30. */
  maxIterations: number;
  /** Working directory for openspec CLI invocations. Default: process.cwd(). */
  cwd: string;
  /** When true, full LLM request/response payloads are printed to stderr. */
  debug: boolean;
}

/**
 * Generic tool definition stored in the tool registry Map.
 * Ref: specs/tool-registry.spec.md, SPEC-REGISTRY-001
 */
export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Name used in LLM tool-call responses. Must match the key in `registry`. */
  name: string;
  /** Human-readable description sent to the LLM as the tool description. */
  description: string;
  /** Zod schema — validates input at dispatch time and infers TypeScript types. */
  schema: T;
  /** Executes the tool and returns a string result for the LLM. */
  execute: (input: z.infer<T>) => Promise<string>;
}

/**
 * Structured result returned by execute_openspec and serialised to JSON for
 * the LLM tool-result message.
 * Ref: specs/tool-registry.spec.md ToolResult Interface
 */
export interface ToolResult {
  /** true when the CLI process exited with code 0. */
  success: boolean;
  /** The fully assembled command string (logged before execution). */
  command: string;
  /** Raw stdout from the CLI process. */
  stdout: string;
  /** Scrubbed stderr — API keys and bearer tokens are redacted. */
  stderr: string;
}

// =============================================================================
// Section 2 — Config resolution
// =============================================================================

/**
 * Reads agent configuration from environment variables, applies defaults, and
 * validates required fields.  Exits with code 1 if the API key is missing for
 * any provider that requires it.
 *
 * Env vars consumed:
 *   AI_PROVIDER        — default: "openai"
 *   AI_MODEL           — default: "" (provider picks its own default)
 *   AI_API_KEY         — required unless AI_PROVIDER === "ollama"
 *   AI_BASE_URL        — optional
 *   AI_TEMPERATURE     — float, default: 0.2
 *   AI_MAX_ITERATIONS  — integer, default: 30
 *   OPENSPEC_CWD       — default: process.cwd()
 *   DEBUG              — boolean ("true"), default: false
 *
 * Ref: design.md Config Resolution, UT-CONFIG-001 through UT-CONFIG-003
 */
export function resolveConfig(): AgentConfig {
  const provider      = process.env['AI_PROVIDER']       ?? 'openai';
  const model         = process.env['AI_MODEL']          ?? '';
  const apiKey        = process.env['AI_API_KEY']        ?? '';
  const baseUrl       = process.env['AI_BASE_URL'];
  const temperature   = parseFloat(process.env['AI_TEMPERATURE']     ?? '0.2');
  const maxIterations = parseInt(process.env['AI_MAX_ITERATIONS']    ?? '30', 10);
  const cwd           = process.env['OPENSPEC_CWD']      ?? process.cwd();
  const debug         = process.env['DEBUG'] === 'true';

  // ── Startup validation (bd-fst3) ─────────────────────────────────────────
  // Ollama runs locally and does not require an API key.  All other providers
  // (openai, anthropic, xai, venice, …) must have AI_API_KEY set before any
  // LLM call is made.  We check this here so the agent fails fast with a clear
  // message rather than with an obscure HTTP 401 deep inside the agent loop.
  // Ref: SPEC-AGENT-008, UT-CONFIG-003, IT-008
  if (provider !== 'ollama' && apiKey === '') {
    console.error(
      '❌ AI_API_KEY is required for provider "%s". ' +
      'Set AI_API_KEY in your environment or .env file.',
      provider,
    );
    process.exit(1);
  }

  return { provider, model, apiKey, baseUrl, temperature, maxIterations, cwd, debug };
}

// ── bd-1xxf: checkOpenspecCLI ─────────────────────────────────────────────

/**
 * Verifies that the openspec CLI is reachable on the system PATH.
 *
 * Uses `where openspec` on Windows and `which openspec` on all other
 * platforms (Linux, macOS).  If the lookup exits with a non-zero code the
 * agent cannot invoke the CLI at all, so we fail fast here — before any LLM
 * call is attempted — with a clear, actionable error message.
 *
 * Exported so that tests can validate the fast-fail behaviour without
 * invoking the real shell (by replacing `exec` or calling a wrapper).
 *
 * Ref: bd-1xxf, design.md Startup Sequence, README.md Troubleshooting, T-2.4
 */
export async function checkOpenspecCLI(): Promise<void> {
  const checkCmd =
    process.platform === 'win32' ? 'where openspec' : 'which openspec';

  return new Promise<void>((resolve) => {
    exec(checkCmd, (error) => {
      if (error) {
        console.error(
          '❌ openspec CLI not found on PATH.\n' +
          '   Install it with:  npm install -g openspec\n' +
          '   Then re-run the agent.',
        );
        process.exit(1);
      }
      resolve();
    });
  });
}

// =============================================================================
// Section 3 — Tool registry & execute_openspec schema
// =============================================================================

/**
 * Zod schema for the execute_openspec tool input.
 *
 * The `command` enum is the primary injection-prevention boundary: only the
 * explicitly whitelisted subcommands can be assembled into CLI strings.  Any
 * value outside the enum causes a ZodError in dispatchTool before exec() is
 * ever called.
 *
 * Ref: SPEC-TOOL-001, UT-CMD-001 through UT-CMD-004
 */
export const ExecuteOpenspecSchema = z.object({
  /** OpenSpec subcommand — restricted to the approved whitelist. */
  command: z.enum(['new', 'instructions', 'archive', 'list', 'status', 'init', 'validate', 'show']),
  /** Positional arguments appended after the subcommand (e.g. change slug). */
  args: z.array(z.string()).optional(),
  /**
   * Named flags passed as --key "value" pairs.  Values are shell-quoted by
   * shellQuote() before assembly to prevent injection through flag values.
   */
  flags: z.record(z.string(), z.string()).optional(),
});

/** TypeScript type inferred from ExecuteOpenspecSchema — used by executeOpenspec(). */
export type ExecuteOpenspecInput = z.infer<typeof ExecuteOpenspecSchema>;

/**
 * Tool registry: maps tool name → ToolDefinition.
 * All tools are registered here before runAgent() is called.
 * Ref: SPEC-REGISTRY-001, SPEC-REGISTRY-002
 *
 * Populated by: bd-re1e (register execute_openspec)
 */
export const registry = new Map<string, ToolDefinition>();

// ── bd-b2yg: shellQuote ───────────────────────────────────────────────────

/**
 * Wraps `value` in double quotes and escapes any embedded backslashes and
 * double quotes so it can be safely inserted into a shell command string.
 *
 * This is the primary injection-prevention boundary for flag values: the
 * `command` position is already protected by `z.enum`; flag values pass through
 * here before assembly.
 *
 * Note: Formalised as a standalone export by task bd-b2yg (batch 7). It is
 * implemented here because executeOpenspec (bd-ahr1, batch 4) depends on it.
 *
 * Ref: SPEC-TOOL-004, Security Considerations §Command injection prevention
 */
export function shellQuote(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// ── bd-nkvu: scrubStderr ──────────────────────────────────────────────────

/**
 * Strips lines that contain common API-key or bearer-token patterns from a
 * raw stderr string before it is printed to the console or returned to the LLM.
 *
 * Patterns detected (per line):
 *   - `sk-…` style keys (OpenAI, Anthropic, etc.) with ≥20 trailing chars
 *   - `Bearer <token>` authorization header values with ≥8 token chars
 *
 * Matching lines are replaced with `[REDACTED — potential credential]`.
 *
 * Note: Formalised as a standalone export by task bd-nkvu (batch 8). It is
 * implemented here because executeOpenspec (bd-ahr1, batch 4) depends on it.
 *
 * Ref: Security Considerations §Stderr scrubbing, SPEC-TOOL-008
 */
export function scrubStderr(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      if (
        /sk-[A-Za-z0-9_-]{20,}/.test(line) ||
        /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/.test(line)
      ) {
        return '[REDACTED — potential credential]';
      }
      return line;
    })
    .join('\n');
}

// ── bd-ahr1: executeOpenspec ──────────────────────────────────────────────

/**
 * Executes an OpenSpec CLI command and returns a JSON-serialised ToolResult.
 *
 * Implementation contract (SPEC-TOOL-002, SPEC-TOOL-004 through SPEC-TOOL-008):
 *  - Builds `openspec <command> [args…] [--flag "value"…]` from validated input.
 *  - Logs the assembled command with a `🔧 Tool:` prefix before execution.
 *  - Runs with a 60-second timeout via child_process.exec (promise-wrapped).
 *  - Captures both stdout and stderr; stderr is scrubbed for credentials.
 *  - Returns ToolResult serialised to JSON (2-space indent for LLM readability).
 *  - On non-zero exit sets success:false — does NOT throw; lets the LLM reason.
 *
 * @param input  Validated ExecuteOpenspecInput (Zod-parsed before this is called).
 * @param cwd    Working directory for the CLI process.
 *
 * Ref: bd-ahr1, SPEC-TOOL-002, wrapper-JIRA.md §3a
 */
export async function executeOpenspec(
  input: ExecuteOpenspecInput,
  cwd: string,
): Promise<string> {
  const { command, args = [], flags = {} } = input;

  // Assemble the CLI command from whitelisted parts only.
  // `command` is validated by z.enum — injection via the subcommand position
  // is impossible.  Flag values are shell-quoted to prevent injection there.
  const parts: string[] = ['openspec', command];
  for (const arg of args) {
    parts.push(shellQuote(arg));
  }
  for (const [key, value] of Object.entries(flags)) {
    parts.push(`--${key}`, shellQuote(value));
  }
  const cmd = parts.join(' ');

  // Log with the required prefix so the user sees every CLI invocation.
  console.log(`🔧 Tool: ${cmd}`);

  return new Promise<string>((resolve) => {
    exec(cmd, { cwd, timeout: 60_000 }, (error, stdout, stderr) => {
      const result: ToolResult = {
        success: error === null,
        command: cmd,
        stdout: stdout.trim(),
        stderr: scrubStderr(stderr).trim(),
      };
      resolve(JSON.stringify(result, null, 2));
    });
  });
}

// ── bd-re1e: register execute_openspec ───────────────────────────────────

/**
 * Register the execute_openspec tool in the global registry.
 *
 * The `cwd` is resolved at call time from the environment variable so that
 * OPENSPEC_CWD can be set after module load without requiring re-registration.
 * This is consistent with how resolveConfig() derives the same value.
 *
 * Ref: bd-re1e, SPEC-REGISTRY-001, SPEC-REGISTRY-002
 */
registry.set('execute_openspec', {
  name: 'execute_openspec',
  description:
    'Execute an OpenSpec CLI subcommand. ' +
    'This is the ONLY mechanism for running openspec commands — NEVER simulate output. ' +
    'Returns JSON: { success: boolean, command: string, stdout: string, stderr: string }.\n' +
    '\n' +
    'Command reference (args array / flags object):\n' +
    '  new change <slug>         args:["change","<slug>"]  — create a change directory\n' +
    '  instructions <artifact>   args:["<artifact>"]  flags:{change:"<slug>"}  — get artifact writing instructions + output path\n' +
    '  archive                   flags:{change:"<slug>"}  — mark a change as complete\n' +
    '  list                      (no args)  — list all changes\n' +
    '  status                    (no args)  — show workspace status\n' +
    '  show <slug>               args:["<slug>"]  — show a change or spec; ONE positional arg only.\n' +
    '                            Use flags:{type:"change"} or flags:{type:"spec"} only when ambiguous.\n' +
    '                            NEVER pass "change" or "spec" as a positional arg to show.\n' +
    '  validate                  (no args)  — validate workspace\n' +
    '  init                      (no args)  — initialise workspace',
  schema: ExecuteOpenspecSchema,
  execute: (input) =>
    executeOpenspec(input, process.env['OPENSPEC_CWD'] ?? process.cwd()),
});

// ── write_file tool ───────────────────────────────────────────────────────

/**
 * Zod schema for the write_file tool input.
 *
 * Accepts an absolute path and UTF-8 string content.  The agent receives the
 * target path from the <output> block of `openspec instructions` and must call
 * this tool to materialise each artifact on disk — the openspec CLI does NOT
 * write artifact content automatically.
 */
export const WriteFileSchema = z.object({
  /** Absolute path to the file to create or overwrite. */
  path: z.string(),
  /** UTF-8 content to write to the file. */
  content: z.string(),
});

/** TypeScript type inferred from WriteFileSchema. */
export type WriteFileInput = z.infer<typeof WriteFileSchema>;

/**
 * Writes UTF-8 content to an absolute file path, creating parent directories
 * as needed.  Returns a JSON-serialised result object.
 *
 * Used by the agent after calling `openspec instructions` to materialise each
 * artifact (proposal.md, design.md, etc.) at the path shown in the <output>
 * section of the instructions output.
 */
export async function writeFileTool(input: WriteFileInput): Promise<string> {
  const { path: filePath, content } = input;
  console.log(`🔧 Tool: write_file ${filePath}`);
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await fsWriteFile(filePath, content, 'utf8');
    return JSON.stringify({ success: true, path: filePath, bytes: content.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ success: false, path: filePath, error: msg });
  }
}

registry.set('write_file', {
  name: 'write_file',
  description:
    'Write UTF-8 content to a file on disk. Creates parent directories as needed. ' +
    'Use this AFTER calling `openspec instructions` to write each artifact to the exact path ' +
    'shown in the <output> block of the instructions. ' +
    'Returns JSON: { success: boolean, path: string, bytes?: number, error?: string }.',
  schema: WriteFileSchema,
  execute: (input) => writeFileTool(input),
});

// ── bd-jhsv: dispatchTool ─────────────────────────────────────────────────

/**
 * Dispatches a tool call from the LLM to the registered ToolDefinition.
 *
 * Steps:
 *  1. Look up the tool by name in the registry — throws on unknown name.
 *  2. Parse rawInput against the tool's Zod schema — throws on validation error.
 *  3. Call tool.execute(parsedInput) and return the string result.
 *
 * Errors from tool.execute() are intentionally NOT caught here; callers
 * (runAgent) handle them so the LLM receives a structured error message and
 * can reason about the failure rather than receiving an unhandled exception.
 *
 * Ref: bd-jhsv, SPEC-DISPATCH-001, UT-DISPATCH-001 through UT-DISPATCH-003
 */
export async function dispatchTool(
  name: string,
  rawInput: unknown,
): Promise<string> {
  const tool = registry.get(name);
  if (!tool) {
    const available = [...registry.keys()].join(', ');
    throw new Error(
      `Unknown tool: "${name}". Registered tools: ${available || '(none)'}`,
    );
  }

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      `Invalid input for tool "${name}": ${parsed.error.message}`,
    );
  }

  return tool.execute(parsed.data);
}

// =============================================================================
// Section 4 — ReAct loop
// =============================================================================

/**
 * System prompt for the OpenSpec AI Agent.
 *
 * Design constraints (SPEC-AGENT-001, NFR-TOKEN-001):
 *  - ≤ 400 tokens (tight budget; do not add prose without removing elsewhere).
 *  - Does NOT assume the model knows OpenSpec — the workflow is defined inline.
 *  - Mandates execute_openspec as the ONLY CLI execution mechanism.
 *  - Enforces five hard rules that mirror the acceptance criteria (AC-2, AC-3, AC-9).
 *
 * Ref: design.md System Prompt Design, wrapper-JIRA.md §2c, SPEC-AGENT-001
 */
export const SYSTEM_PROMPT = `\
You are an OpenSpec AI Agent. You help engineers create and manage OpenSpec change artifacts \
by orchestrating the openspec CLI and writing files to disk.

OpenSpec workflow (always follow this order):
  1. execute_openspec new change <slug> [--description "..."]
       Creates the change directory and metadata.
  2. For each artifact (proposal, design, deltas, tasks, etc.):
     a. execute_openspec instructions --change <slug> <artifact>
          Returns the writing instructions AND the exact output file path in an <output> block.
     b. Generate the artifact content using the instructions as your guide.
     c. write_file { path: "<exact path from <output> block>", content: "<generated content>" }
          Writes the artifact to disk.
  3. Repeat step 2 for every artifact the user requested.
  4. execute_openspec archive --change <slug>
       Marks the change as complete when ALL artifacts are written and verified.

Tools:
- execute_openspec — ONLY mechanism for running openspec CLI commands. Never simulate output.
- write_file — ONLY mechanism for writing artifact content to disk.

Rules:
- NEVER fabricate CLI output. Always use execute_openspec.
- NEVER claim a file was written unless write_file returned success for it.
- Always read the <output> path from the instructions result and pass it exactly to write_file.
- If a command fails, reason about why and take corrective action — do NOT halt the workflow.
- Call ONLY ONE tool per response. Never emit more than one <tool_call> block.
- Do NOT emit a final summary until execute_openspec archive has succeeded.
`.trim();

// ── bd-43cy: zodToJsonSchema + buildToolSchema ───────────────────────────

/**
 * Converts a Zod schema to an Anthropic-compatible JSON Schema object.
 *
 * Supported Zod primitives (sufficient for all current tool definitions):
 *   ZodString, ZodEnum, ZodArray, ZodRecord, ZodObject, ZodOptional, ZodDefault.
 * Any unrecognised type maps to `{}` (accept-any), preserving forward-compat.
 *
 * Note: Formalised as a standalone export by task bd-43cy (batch 6). It is
 * implemented here because runAgent (bd-1uu0, batch 4) depends on it.
 *
 * Ref: bd-43cy, SPEC-AGENT-003
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def as Record<string, any>;
  const typeName: string = (def['typeName'] as string) ?? '';
  const description: string | undefined = schema.description;

  switch (typeName) {
    case 'ZodString':
      return description ? { type: 'string', description } : { type: 'string' };

    case 'ZodEnum': {
      const values = def['values'] as string[];
      return description
        ? { type: 'string', enum: values, description }
        : { type: 'string', enum: values };
    }

    case 'ZodArray': {
      const inner = zodToJsonSchema(def['type'] as z.ZodTypeAny);
      return description
        ? { type: 'array', items: inner, description }
        : { type: 'array', items: inner };
    }

    case 'ZodRecord': {
      const valueSchema = zodToJsonSchema(def['valueType'] as z.ZodTypeAny);
      return description
        ? { type: 'object', additionalProperties: valueSchema, description }
        : { type: 'object', additionalProperties: valueSchema };
    }

    case 'ZodObject': {
      const rawShape = def['shape'];
      const shape: Record<string, z.ZodTypeAny> =
        typeof rawShape === 'function'
          ? (rawShape as () => Record<string, z.ZodTypeAny>)()
          : (rawShape as Record<string, z.ZodTypeAny>);

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vTypeName = ((value as any)._def as Record<string, any>)['typeName'] as string;
        const isOptional = vTypeName === 'ZodOptional' || vTypeName === 'ZodDefault';
        properties[key] = zodToJsonSchema(value);
        if (!isOptional) required.push(key);
      }

      const result: Record<string, unknown> = { type: 'object', properties };
      if (required.length > 0) result['required'] = required;
      if (description) result['description'] = description;
      return result;
    }

    case 'ZodOptional':
    case 'ZodDefault':
      // Unwrap — optionality is handled by the parent ZodObject branch.
      return zodToJsonSchema(def['innerType'] as z.ZodTypeAny);

    default:
      // Unknown type — accept any value to avoid breaking future tools.
      return description ? { description } : {};
  }
}

/**
 * Converts a ToolDefinition from the registry into a provider-agnostic JSON
 * Schema descriptor suitable for embedding in the system prompt.
 *
 * Note: Formalised as a standalone export by task bd-43cy (batch 6).
 *
 * Ref: bd-43cy, SPEC-AGENT-003
 */
export function buildToolSchema(tool: ToolDefinition): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  };
}

/**
 * Serialises all registered tools into a system-prompt section that instructs
 * the LLM how to invoke them using the <tool_call> XML protocol.
 *
 * The format is provider-agnostic: the LLM outputs a JSON object wrapped in
 * <tool_call>…</tool_call> tags whenever it wants to call a tool.  The agent
 * parses that marker with parseToolCall() and dispatches via dispatchTool().
 *
 * Language is deliberately forceful to work across providers (especially GPT-4o,
 * which tends to narrate plans in natural language rather than calling tools).
 *
 * Ref: SPEC-AGENT-003, text-based ReAct protocol
 */
function buildToolSystemPrompt(tools: ToolDefinition[]): string {
  const schemas = tools.map(buildToolSchema);
  return [
    '=== TOOL CALLING PROTOCOL (MANDATORY) ===',
    '',
    'You MUST call tools to complete any task. NEVER narrate, plan, or explain what you',
    'are going to do. When action is required, output a <tool_call> block IMMEDIATELY.',
    '',
    'FORMAT — when calling a tool, your entire response must be this and nothing else:',
    '',
    '<tool_call>',
    '{"name": "TOOL_NAME", "input": TOOL_INPUT_JSON}',
    '</tool_call>',
    '',
    'EXAMPLE (creating a change):',
    '<tool_call>',
    '{"name": "execute_openspec", "input": {"command": "new", "args": ["change", "my-feature"]}}',
    '</tool_call>',
    '',
    'RULES (violations cause task failure):',
    '1. ONE tool call per response. Wait for the result before calling the next tool.',
    '2. NEVER say "I will...", "Let me...", "First I need to..." — just call the tool.',
    '3. NEVER simulate or fabricate tool output. Real results come only from tool calls.',
    '4. After ALL tools have been called and results received, write your final summary',
    '   as plain text with no <tool_call> block. That is the ONLY time you write prose.',
    '',
    'Available tools (JSON Schema):',
    JSON.stringify(schemas, null, 2),
  ].join('\n');
}

/**
 * Extracts the first tool call from an LLM response text and parses the
 * embedded JSON.  Returns null when no valid tool call is found.
 *
 * Two formats are recognised (in priority order):
 *  1. <tool_call>JSON</tool_call>  — primary protocol (all providers)
 *  2. ```json\nJSON\n```           — fallback for GPT-4o, which sometimes wraps
 *     its tool-call JSON in a markdown code fence instead of XML tags
 *
 * In both cases the JSON object must have a "name" string field.
 * An optional "input" field holds the tool arguments (defaults to {}).
 *
 * Ref: SPEC-AGENT-004, text-based ReAct protocol
 */
export function parseToolCall(text: string): { name: string; input: unknown } | null {
  // ── Primary: <tool_call>…</tool_call> ─────────────────────────────────
  const xmlMatch = /<tool_call>([\s\S]*?)<\/tool_call>/i.exec(text);
  if (xmlMatch?.[1]) {
    try {
      const obj = JSON.parse(xmlMatch[1].trim()) as { name?: string; input?: unknown };
      if (typeof obj.name === 'string') return { name: obj.name, input: obj.input ?? {} };
    } catch {
      // malformed JSON — fall through to code-block check
    }
  }

  // ── Fallback: ```json … ``` code block (GPT-4o style) ─────────────────
  // Matches optional "json" language tag and captures the object literal.
  const codeMatch = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i.exec(text);
  if (codeMatch?.[1]) {
    try {
      const obj = JSON.parse(codeMatch[1].trim()) as { name?: string; input?: unknown };
      if (typeof obj.name === 'string') return { name: obj.name, input: obj.input ?? {} };
    } catch {
      // malformed JSON — fall through
    }
  }

  return null;
}

/**
 * Returns true when the LLM response looks like narration / planning rather
 * than a genuine final answer.  Used by the nudge mechanism in runAgent to
 * detect when GPT-4o (or any model) described what it *intends* to do instead
 * of immediately calling a tool.
 *
 * Patterns matched: "I will", "I'll", "Let me", "First,", "Next,",
 * "I need to", "I'm going to", "To start", "I should".
 *
 * Deliberately exported so tests can unit-test the heuristic in isolation.
 */
export function looksLikePlanning(text: string): boolean {
  return /\b(I will|I'll|let me|first,|next,|I need to|I'm going to|to start|I should)\b/i.test(
    text,
  );
}

/**
 * Scans a model response for file paths the model claims to have written and
 * returns those that do not actually exist on disk (phantom files).
 *
 * Strategy:
 *  1. Extract paths from the response text using heuristic regexes.
 *  2. Resolve relative paths against `cwd`.
 *  3. Return paths that are NOT in `writtenFiles` and do NOT exist on disk.
 *
 * This catches the hallucination pattern where the model says "I have written
 * proposal.md, design.md, …" without ever having called write_file for them.
 *
 * Deliberately exported so tests can unit-test the heuristic in isolation.
 * Ref: SPEC-AGENT-006 (phantom-file validation)
 */
export function extractPhantomPaths(
  text: string,
  writtenFiles: ReadonlySet<string>,
  cwd: string,
): string[] {
  // Match file paths ending in known extensions or path-separator patterns.
  // Captures: Windows absolute (G:\...\foo.md), Unix absolute (/foo/bar.md),
  // and relative paths (openspec/changes/slug/proposal.md).
  const pathRe =
    /(?:[A-Za-z]:[\\/]|\/)?(?:[\w.\-]+[\\/])*[\w.\-]+\.(?:md|json|yaml|yml|ts|js|txt)/g;
  const candidates = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text)) !== null) {
    const raw = m[0];
    // Resolve relative paths against cwd so existsSync works correctly.
    const abs = raw.match(/^([A-Za-z]:[\\/]|\/)/) ? raw : resolve(cwd, raw);
    candidates.add(abs);
  }

  const phantoms: string[] = [];
  for (const abs of candidates) {
    if (!writtenFiles.has(abs) && !existsSync(abs)) {
      phantoms.push(abs);
    }
  }
  return phantoms;
}

/**
 * Maps the agent's provider string to a ProviderName accepted by ai-powered.
 *
 * ai-powered supports: "openai" | "anthropic" | "xai" | "venice" | "custom" | "mock"
 * "ollama" is mapped to "custom" (OpenAI-compatible endpoint).
 * Any other unknown provider also falls back to "openai" with a warning.
 */
function mapProvider(provider: string): string {
  const supported = new Set(['openai', 'anthropic', 'xai', 'venice', 'custom', 'mock']);
  if (provider === 'ollama') return 'custom';
  if (supported.has(provider)) return provider;
  console.warn(
    `⚠️  Unknown provider "${provider}" — falling back to "openai". ` +
    'Set AI_PROVIDER to one of: openai, anthropic, xai, venice, custom, ollama.',
  );
  return 'openai';
}

// ── bd-1uu0 + bd-ypnq: runAgent ──────────────────────────────────────────

/**
 * Core ReAct reasoning loop for the OpenSpec AI Agent.
 *
 * Implements the Think → Act → Observe pattern (SPEC-AGENT-002 – SPEC-AGENT-005)
 * using the ai-powered library for provider-agnostic LLM calls.
 *
 * Tool calling is implemented via a text-based protocol embedded in the system
 * prompt: the LLM outputs <tool_call>JSON</tool_call> markers which the agent
 * parses with parseToolCall() and dispatches via dispatchTool().
 *
 * Conversation history is accumulated as a formatted multi-turn prompt string
 * (Human/Assistant/Tool Result sections) and passed to generateText() on every
 * iteration so the LLM has full context.
 *
 * Loop flow:
 *  1. Send the accumulated prompt (with system prompt) to the LLM via generateText().
 *  2. If the response contains a <tool_call> block: dispatch the tool, append
 *     the result to history, and repeat.
 *  3. If there is no <tool_call> block: print the final answer and return.
 *  4. If maxIterations reached: emit a warning and exit without throwing.
 *
 * DEBUG mode (bd-ypnq):
 *  When config.debug is true, the full request payload and response are printed
 *  to stderr so engineers can inspect the exact token flow.
 *
 * Ref: bd-1uu0, bd-ypnq, SPEC-AGENT-002 – SPEC-AGENT-005, IT-001, AC-5, AC-6
 */

/**
 * Minimal subset of the ai-powered AiClient surface used by runAgent.
 * Allows tests to inject a mock client without importing the full library.
 * Ref: bd-66f8, T-5.2 testability
 */
export interface AiClientLike {
  generateText(
    prompt: string,
    options?: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  ): Promise<{
    content: string;
    /** Token usage reported by the provider. Used to detect truncated responses. */
    usage?: { completionTokens?: number };
  }>;
}

export async function runAgent(
  request: string,
  config: AgentConfig,
  /** Optional client override — used by tests to inject a mock. */
  clientOverride?: AiClientLike,
): Promise<void> {
  // ── Initialise ai-powered client (or use injected mock) ──────────────────
  let client: AiClientLike;
  if (clientOverride !== undefined) {
    client = clientOverride;
  } else {
    const providerName = mapProvider(config.provider);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overrides: Record<string, any> = {
      apiKey:    config.apiKey   || undefined,
      mock:      false,
      fallback:  false,
    };
    if (config.model)   overrides['model']   = config.model;
    if (config.baseUrl) overrides['baseUrl'] = config.baseUrl;
    if (config.provider === 'ollama') overrides['customProviderType'] = 'ollama';
    client = await getAiClient(providerName, overrides);
  }

  // ── Build combined system prompt (behaviour + tool calling protocol) ──────
  const tools = [...registry.values()];
  const systemPrompt = `${SYSTEM_PROMPT}\n\n${buildToolSystemPrompt(tools)}`;

  // ── Resolve display model label ───────────────────────────────────────────
  const modelLabel = config.model !== '' ? config.model : '(provider default)';
  console.log(`🚀 OpenSpec Agent  provider: ${config.provider}  model: ${modelLabel}`);
  console.log(`📝 Request: ${request}\n`);

  // ── Conversation history as accumulated prompt turns ──────────────────────
  // Each turn is a labelled section joined by blank lines.  The LLM receives
  // the full history on every call so it has complete context.
  const turns: string[] = [`Human: ${request}`];

  // ── ReAct loop ───────────────────────────────────────────────────────────
  let iterations = 0;
  // nudgedForPlanning: set true when a planning-narration nudge fires.
  // Prevents re-nudging the same narration pattern back-to-back.
  // Reset to false whenever a tool call is dispatched.
  let nudgedForPlanning = false;
  // stuckCount: counts consecutive turns that produced no tool call.
  // Limits phantom/archive nudge cycles.  Reset to 0 on any tool call or truncation.
  let stuckCount = 0;
  // changeStarted: true once `execute_openspec new change <slug>` returns success.
  let changeStarted = false;
  // archiveSucceeded: true once `execute_openspec archive` returns success.
  // Required before accepting a final answer when a change was started and files written.
  let archiveSucceeded = false;
  // Tracks absolute paths of files successfully written via write_file during
  // this session.  Used by phantom-file validation to detect hallucinated
  // completion claims.
  const writtenFiles = new Set<string>();

  while (iterations < config.maxIterations) {
    iterations++;
    console.log(`🤔 [Iteration ${iterations}/${config.maxIterations}] Thinking…`);

    const prompt = turns.join('\n\n');
    const callOptions = {
      systemPrompt,
      temperature: config.temperature,
      maxTokens:   8192,
    };

    // ── DEBUG: log raw request payload ────────────────────────────────────
    if (config.debug) {
      console.error('🔍 DEBUG request ────────────────────────────────');
      console.error(JSON.stringify({ prompt, options: callOptions }, null, 2));
    }

    // ── LLM call (with outer retry for transient overload/rate-limit errors) ──
    // The ai-powered library retries 3× internally with ~250–500 ms gaps, which
    // is insufficient when Anthropic returns 529 Overloaded.  This outer loop
    // adds three additional attempts with 10 s → 20 s → 40 s backoff, giving
    // the API time to recover before we give up entirely.
    const OUTER_RETRIES = 3;
    const OVERLOAD_DELAYS_MS = [10_000, 20_000, 40_000];
    let result!: Awaited<ReturnType<typeof client.generateText>>;
    for (let attempt = 0; attempt <= OUTER_RETRIES; attempt++) {
      try {
        result = await client.generateText(prompt, callOptions);
        break; // success — exit retry loop
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient =
          /529|overloaded|rate.?limit|too many requests/i.test(msg);
        if (isTransient && attempt < OUTER_RETRIES) {
          const waitMs = OVERLOAD_DELAYS_MS[attempt] ?? 40_000;
          console.warn(
            `⏳ LLM overloaded (attempt ${attempt + 1}/${OUTER_RETRIES}) — ` +
            `waiting ${waitMs / 1000}s before retry…`,
          );
          await new Promise<void>((res) => setTimeout(res, waitMs));
        } else {
          // Non-transient error or out of retries — propagate.
          throw err;
        }
      }
    }

    // ── DEBUG: log raw response ───────────────────────────────────────────
    if (config.debug) {
      console.error('🔍 DEBUG response ───────────────────────────────');
      console.error(JSON.stringify(result, null, 2));
    }

    const assistantText = result.content.trim();
    turns.push(`Assistant: ${assistantText}`);

    // ── Truncation detection ──────────────────────────────────────────────
    // When the model's response consumed all available tokens the output was
    // cut off before a <tool_call> block could be completed.  Inject a nudge
    // so the model continues from where it was cut rather than hallucinating.
    // NOTE: This check is NOT gated by nudgedForPlanning — truncation can happen
    // at any time and always needs to be handled regardless of prior nudge state.
    const completionTokens = result.usage?.completionTokens ?? 0;
    if (completionTokens > 0 && completionTokens >= callOptions.maxTokens! * 0.99) {
      console.warn(
        `⚠️  Response hit token limit (${completionTokens}/${callOptions.maxTokens}) — nudging to continue.`,
      );
      nudgedForPlanning = false; // allow fresh planning check after resuming
      stuckCount = 0;            // truncation is not a "stuck" turn
      turns.push(
        'Human: Your previous response was cut off because it was too long. ' +
        'Call EXACTLY ONE tool now to continue the task — do not repeat or summarise previous work.',
      );
      continue;
    }

    // ── Parse tool call from response ─────────────────────────────────────
    const toolCall = parseToolCall(assistantText);

    if (toolCall !== null) {
      // Model called a tool — reset per-turn nudge state and dispatch.
      // Note: individual tools (executeOpenspec, writeFileTool) log their own
      // 🔧 lines with the fully-assembled command/path, which is more useful
      // than repeating the bare tool name here.
      nudgedForPlanning = false;
      stuckCount = 0;
      let resultContent: string;

      try {
        resultContent = await dispatchTool(toolCall.name, toolCall.input);
        console.log(`📋 Result: ${resultContent}`);

        // Track successfully written files so we can validate the final answer.
        if (toolCall.name === 'write_file') {
          try {
            const parsed = JSON.parse(resultContent) as { success?: boolean; path?: string };
            if (parsed.success && typeof parsed.path === 'string') {
              writtenFiles.add(parsed.path);
            }
          } catch { /* ignore parse errors — result may not be JSON */ }
        }

        // Track whether `openspec new change <slug>` succeeded — marks workflow start.
        // Track whether `openspec archive` succeeded — required before final answer.
        if (toolCall.name === 'execute_openspec') {
          const inp = toolCall.input as Record<string, unknown>;
          try {
            const parsed = JSON.parse(resultContent) as { success?: boolean };
            if (parsed.success && inp.command === 'new') changeStarted = true;
            if (parsed.success && inp.command === 'archive') archiveSucceeded = true;
          } catch { /* ignore */ }
        }
      } catch (err) {
        resultContent =
          `Error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`❌ Tool error (${toolCall.name}): ${resultContent}`);
      }

      turns.push(`Tool Result (${toolCall.name}):\n${resultContent}`);
      continue;
    }

    // ── No tool call — count this as a stuck turn ────────────────────────
    stuckCount++;
    // Maximum consecutive stuck turns before we stop nudging and accept the
    // response as the genuine final answer (prevents infinite loops).
    const MAX_STUCK = 5;

    // ── Planning narration check (GPT-4o pattern) ─────────────────────────
    // When the model describes what it *plans* to do instead of calling a
    // tool, inject a single correction turn.  nudgedForPlanning ensures we
    // only fire once per stuck run — if the model still narrates after the
    // nudge we fall through so the other checks can still run.
    if (!nudgedForPlanning && looksLikePlanning(assistantText)) {
      console.warn(
        '⚠️  Model narrated a plan instead of calling a tool — nudging it to act.',
      );
      nudgedForPlanning = true;
      turns.push(
        'Human: You described a plan but did not call any tool. ' +
        'You MUST output a <tool_call> block right now — do not explain, just call the tool.',
      );
      continue;
    }

    // ── Phantom-file validation & archive requirement ─────────────────────
    // These checks run INDEPENDENTLY of the planning nudge flag so a prior
    // nudge (e.g. truncation or planning) never silently suppresses them.
    // They are gated only by stuckCount to prevent infinite loops.
    if (stuckCount <= MAX_STUCK) {
      // Scan the response for file paths the model claims to have written.
      // If any are absent from disk, the model hallucinated the completion.
      const phantoms = extractPhantomPaths(assistantText, writtenFiles, config.cwd);
      if (phantoms.length > 0) {
        console.warn(
          `⚠️  Model claimed completion but ${phantoms.length} file(s) are missing — nudging.`,
        );
        turns.push(
          'Human: You claimed the task is complete, but the following files were never written to disk:\n' +
          phantoms.map((p) => `  - ${p}`).join('\n') + '\n' +
          'You MUST call write_file for each missing file. Start with the first one now.',
        );
        continue;
      }

      // ── Archive requirement ─────────────────────────────────────────────
      // The OpenSpec workflow is only complete once `openspec archive` has
      // returned success.  If a change was started and artifacts were written
      // but archive has not been called, the model is claiming completion
      // prematurely — nudge it to finish the workflow.
      if (changeStarted && writtenFiles.size > 0 && !archiveSucceeded) {
        console.warn(
          '⚠️  Workflow incomplete — `openspec archive` has not been called. Nudging.',
        );
        turns.push(
          'Human: You have not yet called `openspec archive`. ' +
          'The OpenSpec workflow is not complete until archive succeeds. Call it now.',
        );
        continue;
      }
    }

    // ── No tool call, all checks passed → genuine final answer ───────────
    console.log('\n✅ Agent response:\n');
    console.log(assistantText);
    return;
  }

  // Warn when the iteration cap is the reason the loop ended.
  if (iterations >= config.maxIterations) {
    console.warn(
      `⚠️  Reached maximum iterations (${config.maxIterations}). ` +
      'The agent did not produce a final answer within the allowed limit.',
    );
  }
}

// =============================================================================
// Section 5 — main() entry point
// =============================================================================

/**
 * Agent entry point.
 *
 * Usage:
 *   npm run openspec:agent "<natural language request>"
 *   tsx open-spec-agent.ts "<natural language request>"
 *
 * Behaviour:
 *  1. Reads the user request from process.argv[2].
 *  2. Prints a usage hint and exits with code 1 when no argument is supplied.
 *  3. Calls resolveConfig() — which itself exits with code 1 on a missing API key.
 *  4. Calls runAgent() with the validated request and resolved config.
 *  5. Catches any unhandled error, prints it to stderr, and exits with code 1.
 *
 * Ref: SPEC-AGENT-007, IT-008, AC-1
 */
async function main(): Promise<void> {
  const userRequest = process.argv[2];

  // ── Guard: require a non-empty request string ────────────────────────────
  if (!userRequest || userRequest.trim() === '') {
    console.error('❌ Usage: npm run openspec:agent "<natural language request>"');
    console.error('   Example: npm run openspec:agent "Add a dark mode toggle"');
    process.exit(1);
  }

  // ── Config resolution (fails fast if API key is missing) ─────────────────
  const config = resolveConfig();

  // ── Verify openspec CLI is on PATH (fails fast with an install hint) ──────
  await checkOpenspecCLI();

  // ── Run agent — propagate all errors to the top-level handler below ───────
  await runAgent(userRequest.trim(), config);
}

// Top-level error boundary: catches LLM API errors and unexpected exceptions.
// Prints a clean message to stderr and exits with code 1 so callers (CI, etc.)
// receive a non-zero status without a raw stack trace polluting stdout.
//
// Guard: only auto-invoke when this file is run directly as the entry point,
// NOT when imported as a library (e.g. by tests). This is the ESM equivalent
// of Python's `if __name__ == '__main__':` pattern.
// import.meta.url  → file:///…/open-spec-agent.ts  (absolute file URL)
// process.argv[1]  → absolute OS path of the entry module
// Comparing the two (normalised to OS path) ensures we only auto-run main()
// when Node executed this file directly, not when it was `import`-ed.
const _entryUrl = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const _argv1    = process.argv[1] ?? '';
const _isEntry  = _entryUrl === _argv1 ||
                  _entryUrl.replace(/\\/g, '/') === _argv1.replace(/\\/g, '/');

if (_isEntry) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Agent error:', message);
    process.exit(1);
  });
}

