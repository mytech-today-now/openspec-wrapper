/**
 * open-spec-agent.test.ts
 *
 * Test suite for open-spec-agent.ts.
 *
 * Tests:
 *   T-2.5 (bd-8eft) — smoke-test ai-powered client wiring via mock mode.
 *   T-5.2 (bd-66f8) — verify propose precedes apply in the ReAct loop.
 *   T-5.3 (bd-c4ud) — verify missing/invalid API key exits with code 1 and
 *                      emits a clear error on stderr; no LLM call made.
 *   T-5.4 (bd-evku) — verify DEBUG mode emits LLM payloads to stderr.
 *
 * Strategy
 * --------
 * • Use dependency injection — runAgent accepts an optional clientOverride so
 *   we can pass a fully mock Anthropic client without any module patching.
 * • Override the execute_openspec registry entry to capture tool calls in order
 *   without invoking the real openspec CLI or child_process.exec.
 * • Script the mock LLM to emit exactly two tool_use turns then end_turn:
 *     turn 1 → execute_openspec { command: "propose", args: ["dark-mode-toggle"] }
 *     turn 2 → execute_openspec { command: "apply",   args: ["dark-mode-toggle"] }
 *     turn 3 → end_turn (final answer)
 * • Capture console.log lines and assert "propose" appears before "apply".
 * • For T-5.4: capture console.error lines and assert DEBUG headers + JSON payloads
 *   are present while console.log (stdout) still shows the normal agent output.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiClient } from 'ai-powered';

// Static import — agent module does NOT auto-invoke main() when imported
// because of the import.meta.url guard added for testability.
import {
  runAgent,
  resolveConfig,
  registry,
  ExecuteOpenspecSchema,
  type AgentConfig,
  type AiClientLike,
  type ToolResult,
} from './open-spec-agent.ts';

// ── Shared test helper ─────────────────────────────────────────────────────

/**
 * Sentinel error thrown by the process.exit mock in T-5.3.
 * Allows resolveConfig() to "exit" without actually killing the test runner;
 * the mock throws this so execution stops at the call site, mirroring the
 * real behaviour of process.exit (which also terminates execution immediately).
 */
class MockExitError extends Error {
  public readonly code: number;
  constructor(code: number) {
    super(`process.exit(${code}) called`);
    this.name = 'MockExitError';
    this.code = code;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Capture all console.log calls during the supplied async thunk. */
async function captureLog(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
    orig(...args); // forward so output is still visible during debug runs
  };
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

// ── Test ───────────────────────────────────────────────────────────────────

test('T-5.2 propose precedes apply in console output', async (t) => {
  // ── 1. Track executed openspec commands in order ───────────────────────
  const executedCommands: string[] = [];

  // Save the real registry entry so we can restore it after the test.
  const originalEntry = registry.get('execute_openspec');
  t.after(() => {
    if (originalEntry !== undefined) {
      registry.set('execute_openspec', originalEntry);
    } else {
      registry.delete('execute_openspec');
    }
  });

  // Replace execute_openspec with a mock that records calls and returns fake
  // ToolResult JSON — no child_process.exec or openspec CLI involved.
  registry.set('execute_openspec', {
    name: 'execute_openspec',
    description: 'mock execute_openspec for testing',
    schema: ExecuteOpenspecSchema,
    execute: async (input) => {
      executedCommands.push(input.command);
      const result: ToolResult = {
        success: true,
        command: `openspec ${input.command}`,
        stdout: `Mock output for: openspec ${input.command}`,
        stderr: '',
      };
      return JSON.stringify(result, null, 2);
    },
  });

  // ── 2. Script the mock LLM (ai-powered AiClientLike) ─────────────────────
  //   Call 0 → <tool_call> propose
  //   Call 1 → <tool_call> apply
  //   Call 2 → plain final answer (no tool_call)
  let callIndex = 0;
  const mockGenerate = t.mock.fn(async (
    _prompt: string,
    _options?: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  ): Promise<{ content: string }> => {
    const i = callIndex++;
    if (i === 0) {
      return {
        content:
          '<tool_call>' +
          '{"name":"execute_openspec","input":{"command":"propose","args":["dark-mode-toggle"]}}' +
          '</tool_call>',
      };
    }
    if (i === 1) {
      return {
        content:
          '<tool_call>' +
          '{"name":"execute_openspec","input":{"command":"apply","args":["dark-mode-toggle"]}}' +
          '</tool_call>',
      };
    }
    return { content: 'Done. Proposed and applied dark-mode-toggle.' };
  });

  const mockClient: AiClientLike = {
    generateText: mockGenerate,
  };

  // ── 3. Run the agent ───────────────────────────────────────────────────
  const config: AgentConfig = {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    apiKey: 'test-key-no-real-call',
    baseUrl: undefined,
    temperature: 0.2,
    maxIterations: 10,
    cwd: process.cwd(),
    debug: false,
  };

  const lines = await captureLog(() =>
    runAgent('Add a dark mode toggle to the website', config, mockClient),
  );

  // ── 4. Assertions ──────────────────────────────────────────────────────

  // LLM must have been called for: propose turn, apply turn, and end_turn.
  assert.ok(
    mockGenerate.mock.calls.length >= 3,
    `LLM must be called ≥3 times, got ${mockGenerate.mock.calls.length}`,
  );

  // propose and apply must both appear in the captured tool call list.
  assert.ok(
    executedCommands.includes('propose'),
    `"propose" must be in executed commands: ${executedCommands.join(', ')}`,
  );
  assert.ok(
    executedCommands.includes('apply'),
    `"apply" must be in executed commands: ${executedCommands.join(', ')}`,
  );

  // propose must precede apply in the recorded execution order.
  const proposePos = executedCommands.indexOf('propose');
  const applyPos   = executedCommands.indexOf('apply');
  assert.ok(
    proposePos < applyPos,
    `"propose" (pos ${proposePos}) must precede "apply" (pos ${applyPos}) ` +
    `in: [${executedCommands.join(', ')}]`,
  );

  // The agent logs "execute_openspec" for each tool call (AC-2: agent emits
  // tool output in the expected order). We verify the tool name appears in the
  // log at least once — the ordering is already proven by executedCommands.
  const hasToolLog = lines.some((l) => l.includes('execute_openspec'));
  assert.ok(hasToolLog, 'console output must log the execute_openspec tool call');

  // Agent must complete with a final answer (equivalent to exit code 0).
  const hasAnswer = lines.some(
    (l) => l.includes('Agent response') || l.includes('Done.'),
  );
  assert.ok(hasAnswer, 'agent must emit a final answer (exit code 0 equivalent)');
});

// =============================================================================
// T-5.3 (bd-c4ud) — Failure test: invalid or missing API key
// =============================================================================
//
// Ref: bd-c4ud, AC-3, AC-4, IT-008
//
// Strategy:
//  • Temporarily delete AI_API_KEY from process.env and set AI_PROVIDER to a
//    non-ollama value (openai) so resolveConfig() triggers its fast-fail path.
//  • Replace process.exit with a mock that throws MockExitError — this lets
//    us inspect the exit code without actually terminating the test runner,
//    and (crucially) it also stops resolveConfig() at the exact same point
//    that real process.exit would, so no code beyond that call is reached.
//  • Capture console.error output to verify the error message references
//    AI_API_KEY and the provider name.
//  • Verify process.exit was called with code 1.
//  • "No HTTP call made" is structurally guaranteed: resolveConfig() throws
//    MockExitError before returning, so runAgent() and the Anthropic SDK are
//    never invoked — no network connection is possible.
// =============================================================================

test('T-5.3 Missing API key: exit code 1 and clear error on stderr, no LLM call', (t) => {
  // ── 1. Save original env values so the test is hermetic ──────────────────
  const savedApiKey   = process.env['AI_API_KEY'];
  const savedProvider = process.env['AI_PROVIDER'];

  t.after(() => {
    // Always restore env vars, even if the test assertion throws.
    if (savedApiKey !== undefined) {
      process.env['AI_API_KEY'] = savedApiKey;
    } else {
      delete process.env['AI_API_KEY'];
    }
    if (savedProvider !== undefined) {
      process.env['AI_PROVIDER'] = savedProvider;
    } else {
      delete process.env['AI_PROVIDER'];
    }
  });

  // ── 2. Configure env: no API key, non-ollama provider ────────────────────
  delete process.env['AI_API_KEY'];
  process.env['AI_PROVIDER'] = 'openai';

  // ── 3. Capture stderr ─────────────────────────────────────────────────────
  const stderrLines: string[] = [];
  const origErr = console.error.bind(console);

  // ── 4. Mock process.exit — record the code and throw so execution stops ───
  let capturedExitCode: number | undefined;
  const origExit = process.exit.bind(process);

  console.error = (...args: unknown[]) => {
    stderrLines.push(args.map(String).join(' '));
  };
  process.exit = ((code?: number) => {
    capturedExitCode = code ?? 0;
    // Throw to abort execution at the exit call site, exactly as real
    // process.exit() would prevent any subsequent code from running.
    throw new MockExitError(code ?? 0);
  }) as typeof process.exit;

  // ── 5. Invoke resolveConfig() and expect it to fast-fail ─────────────────
  try {
    resolveConfig(); // must throw MockExitError; must NOT reach `return`
    // If we reach this line resolveConfig() did not call process.exit(1) — fail.
    assert.fail(
      'resolveConfig() should have called process.exit(1) before returning ' +
      'when AI_API_KEY is missing for a non-ollama provider',
    );
  } catch (err) {
    // Re-throw any error that isn't our sentinel so real failures aren't masked.
    if (!(err instanceof MockExitError)) throw err;
  } finally {
    console.error = origErr;
    process.exit  = origExit;
  }

  // ── 6. Assertions ─────────────────────────────────────────────────────────

  // process.exit must have been called with exactly code 1.
  assert.strictEqual(
    capturedExitCode,
    1,
    `process.exit must be called with code 1; got: ${capturedExitCode}`,
  );

  // stderr must contain a reference to AI_API_KEY so the error is actionable.
  const hasApiKeyRef = stderrLines.some((l) => l.includes('AI_API_KEY'));
  assert.ok(
    hasApiKeyRef,
    `stderr must mention "AI_API_KEY". Captured lines: ${stderrLines.join(' | ')}`,
  );

  // stderr must also name the provider so the engineer knows which one failed.
  const hasProviderRef = stderrLines.some((l) => l.includes('openai'));
  assert.ok(
    hasProviderRef,
    `stderr must name the failing provider "openai". Captured lines: ${stderrLines.join(' | ')}`,
  );

  // No HTTP call was made: resolveConfig() threw MockExitError before returning,
  // so runAgent() and the Anthropic SDK were never reached.  This is a
  // structural guarantee — nothing after the throw can execute in the try block.
});

// =============================================================================
// T-5.4 (bd-evku) — DEBUG mode: LLM payloads printed to stderr
// =============================================================================
//
// Ref: bd-evku, AC-6, IT-007
//
// Strategy:
//  • Set config.debug = true and capture console.error lines.
//  • Use the same single-turn mock LLM (end_turn immediately) — keeps the test
//    fast while still exercising at least one full request/response debug cycle.
//  • Assert that stderr contains the "── DEBUG request" and "── DEBUG response"
//    section headers emitted by runAgent.
//  • Assert that at least one captured error line contains a JSON object start
//    character ('{') — confirming the raw payload was serialised and emitted.
//  • Assert that console.log (stdout) still shows the normal agent output
//    (start banner + final answer) — debug mode must not suppress it.
// =============================================================================

test('T-5.4 DEBUG mode emits LLM request and response payloads to stderr', async (t) => {
  // ── 1. Replace execute_openspec to avoid real CLI calls ───────────────────
  const originalEntry = registry.get('execute_openspec');
  t.after(() => {
    if (originalEntry !== undefined) {
      registry.set('execute_openspec', originalEntry);
    } else {
      registry.delete('execute_openspec');
    }
  });

  registry.set('execute_openspec', {
    name: 'execute_openspec',
    description: 'mock execute_openspec for T-5.4',
    schema: ExecuteOpenspecSchema,
    execute: async (input) => {
      const result: ToolResult = {
        success: true,
        command: `openspec ${input.command}`,
        stdout: `Mock output for: openspec ${input.command}`,
        stderr: '',
      };
      return JSON.stringify(result, null, 2);
    },
  });

  // ── 2. Single-turn mock LLM: no tool_call, returns final answer immediately ─
  //   Only one LLM call is needed — runAgent detects no <tool_call> in iteration
  //   1 and outputs the final answer, which is enough to exercise both the
  //   request and response debug branches.
  const mockGenerate = t.mock.fn(async (
    _prompt: string,
    _options?: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  ): Promise<{ content: string }> => ({
    content: 'No open proposals found.',
  }));

  const mockClient: AiClientLike = {
    generateText: mockGenerate,
  };

  // ── 3. Run with debug: true — capture both stdout and stderr ──────────────
  const config: AgentConfig = {
    provider: 'anthropic',
    model:    'claude-3-5-sonnet-latest',
    apiKey:   'test-key-no-real-call',
    baseUrl:  undefined,
    temperature:   0.2,
    maxIterations: 10,
    cwd:   process.cwd(),
    debug: true,   // ← the flag under test
  };

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  // Capture both channels simultaneously — the only safe approach when
  // captureLog and captureError each restore the original binding in their
  // finally blocks, making them non-composable.
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log   = (...args: unknown[]) => { stdoutLines.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { stderrLines.push(args.map(String).join(' ')); };
  try {
    await runAgent('List all proposals', config, mockClient);
  } finally {
    console.log   = origLog;
    console.error = origErr;
  }

  // ── 4. Assertions — stderr ────────────────────────────────────────────────

  // At least one "── DEBUG request" header must appear in stderr.
  const hasRequestHeader = stderrLines.some((l) => l.includes('DEBUG request'));
  assert.ok(
    hasRequestHeader,
    `stderr must contain a "DEBUG request" header. Got: ${stderrLines.slice(0, 5).join(' | ')}`,
  );

  // At least one "── DEBUG response" header must appear in stderr.
  const hasResponseHeader = stderrLines.some((l) => l.includes('DEBUG response'));
  assert.ok(
    hasResponseHeader,
    `stderr must contain a "DEBUG response" header. Got: ${stderrLines.slice(0, 5).join(' | ')}`,
  );

  // At least one stderr line must start with '{' — the serialised JSON payload.
  const hasJsonPayload = stderrLines.some((l) => l.trimStart().startsWith('{'));
  assert.ok(
    hasJsonPayload,
    'stderr must contain at least one JSON-object payload from the LLM request or response',
  );

  // ── 5. Assertions — stdout still works ───────────────────────────────────

  // The agent banner (🚀) must appear on stdout.
  const hasBanner = stdoutLines.some((l) => l.includes('🚀'));
  assert.ok(hasBanner, 'stdout (console.log) must still show the agent startup banner');

  // The final answer must appear on stdout.
  const hasFinalAnswer = stdoutLines.some(
    (l) => l.includes('Agent response') || l.includes('No open proposals'),
  );
  assert.ok(hasFinalAnswer, 'stdout must still show the final agent answer in DEBUG mode');
});

// =============================================================================
// T-2.5 (bd-8eft) — Smoke-test: ai-powered client wiring
// =============================================================================
//
// Ref: bd-8eft, AC-2, IT-002
//
// Strategy:
//   • Import getAiClient from the ai-powered package.
//   • Instantiate a client in mock mode (no API key required).
//   • Call generateText with a simple prompt.
//   • Assert the result has a non-empty content string.
//
// This is a wiring smoke test — it verifies that:
//   1. The ai-powered package is properly installed and importable.
//   2. The mock provider returns a well-formed response object.
//   3. No network calls or API keys are needed (CI-safe).
// =============================================================================

test('T-2.5 ai-powered mock client returns a non-empty text result', async () => {
  // ── 1. Create a mock-mode client (no API key required) ───────────────────
  // getAiClient(toolName?, overrides?) → Promise<AiClient>
  const client = await getAiClient('T-2.5-smoke', { mock: true });

  // ── 2. Call generateText with a minimal prompt ───────────────────────────
  const result = await client.generateText('Say hello.');

  // ── 3. Assert the result has a non-empty content string ──────────────────
  assert.ok(
    typeof result.content === 'string' && result.content.length > 0,
    `Expected result.content to be a non-empty string, got: ${JSON.stringify(result.content)}`,
  );
});
