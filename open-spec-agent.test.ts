/**
 * open-spec-agent.test.ts
 *
 * Test suite for open-spec-agent.ts.
 *
 * Tests:
 *   T-2.5 (bd-8eft) — smoke-test ai-powered client wiring via mock mode.
 *   T-5.2 (bd-66f8) — verify `new` precedes `instructions` in the ReAct loop.
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
 *     turn 1 → execute_openspec { command: "new",          args: ["change", "dark-mode-toggle"] }
 *     turn 2 → execute_openspec { command: "instructions", args: ["--change", "dark-mode-toggle", "proposal"] }
 *     turn 3 → end_turn (final answer)
 * • Capture console.log lines and assert "new" appears before "instructions".
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
  WriteFileSchema,
  parseToolCall,
  looksLikePlanning,
  extractPhantomPaths,
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

test('T-5.2 `new` precedes `instructions` in console output (real workflow order)', async (t) => {
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
      const stdout =
        input.command === 'instructions'
          ? 'Write the proposal.\n<output>openspec/changes/dark-mode-toggle/proposal.md</output>'
          : `Mock output for: openspec ${input.command}`;
      const result: ToolResult = {
        success: true,
        command: `openspec ${input.command}`,
        stdout,
        stderr: '',
      };
      return JSON.stringify(result, null, 2);
    },
  });

  // ── 2. Script the mock LLM (ai-powered AiClientLike) ─────────────────────
  //   Call 0 → execute_openspec { command: "new", args: ["change", "dark-mode-toggle"] }
  //   Call 1 → execute_openspec { command: "instructions", args: [...] }
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
          '{"name":"execute_openspec","input":{"command":"new","args":["change","dark-mode-toggle"]}}' +
          '</tool_call>',
      };
    }
    if (i === 1) {
      return {
        content:
          '<tool_call>' +
          '{"name":"execute_openspec","input":{"command":"instructions","args":["--change","dark-mode-toggle","proposal"]}}' +
          '</tool_call>',
      };
    }
    return { content: 'Done. Created change and fetched proposal instructions for dark-mode-toggle.' };
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

  // LLM must have been called for: new turn, instructions turn, and end_turn.
  assert.ok(
    mockGenerate.mock.calls.length >= 3,
    `LLM must be called ≥3 times, got ${mockGenerate.mock.calls.length}`,
  );

  // `new` and `instructions` must both appear in the captured tool call list.
  assert.ok(
    executedCommands.includes('new'),
    `"new" must be in executed commands: ${executedCommands.join(', ')}`,
  );
  assert.ok(
    executedCommands.includes('instructions'),
    `"instructions" must be in executed commands: ${executedCommands.join(', ')}`,
  );

  // `new` must precede `instructions` in the recorded execution order.
  const newPos          = executedCommands.indexOf('new');
  const instructionsPos = executedCommands.indexOf('instructions');
  assert.ok(
    newPos < instructionsPos,
    `"new" (pos ${newPos}) must precede "instructions" (pos ${instructionsPos}) ` +
    `in: [${executedCommands.join(', ')}]`,
  );

  // The agent must log a "📋 Result:" line for each tool dispatch (AC-2).
  // The tool name / command is tracked by executedCommands above; here we just
  // confirm that runAgent emitted at least one result log, proving the tool
  // round-trip was completed.  (The removed runAgent "🔧 Tool: <name>" log is
  // no longer the source of this evidence — individual tools log their own 🔧
  // lines, and runAgent always emits 📋 Result: after a successful dispatch.)
  const hasResultLog = lines.some((l) => l.includes('📋 Result:'));
  assert.ok(hasResultLog, 'console output must log a 📋 Result: line after each tool dispatch');

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

// =============================================================================
// T-6.1 — parseToolCall: XML and code-block format coverage
// =============================================================================
//
// Verifies that parseToolCall handles both the primary <tool_call> XML
// protocol AND the GPT-4o code-block fallback, and returns null for
// invalid/absent tool calls.
// =============================================================================

test('T-6.1 parseToolCall parses <tool_call> XML format', () => {
  const text =
    '<tool_call>\n{"name":"execute_openspec","input":{"command":"new","args":["change","foo"]}}\n</tool_call>';
  const result = parseToolCall(text);
  assert.ok(result !== null, 'should parse XML tool call');
  assert.strictEqual(result!.name, 'execute_openspec');
  assert.deepStrictEqual((result!.input as { command: string }).command, 'new');
});

test('T-6.1b parseToolCall parses ```json code-block fallback (GPT-4o style)', () => {
  const text =
    'Sure, here is the tool call:\n```json\n{"name":"write_file","input":{"path":"/tmp/x.md","content":"hello"}}\n```';
  const result = parseToolCall(text);
  assert.ok(result !== null, 'should parse code-block tool call');
  assert.strictEqual(result!.name, 'write_file');
});

test('T-6.1c parseToolCall returns null for plain prose (no tool call)', () => {
  const text = 'I will create the change now. Let me start by running openspec new.';
  const result = parseToolCall(text);
  assert.strictEqual(result, null, 'planning prose must not be parsed as a tool call');
});

test('T-6.1d parseToolCall returns null for malformed JSON', () => {
  const text = '<tool_call>{not valid json}</tool_call>';
  const result = parseToolCall(text);
  assert.strictEqual(result, null, 'malformed JSON must return null');
});

// =============================================================================
// T-6.2 — looksLikePlanning: planning-language detection
// =============================================================================

test('T-6.2 looksLikePlanning detects GPT-4o narration patterns', () => {
  const planning = [
    'I will create the change now.',
    "I'll start by running openspec new.",
    'Let me first create the directory.',
    'First, I need to create the change.',
    "I'm going to run openspec new change.",
    'To start, I should call openspec.',
  ];
  for (const text of planning) {
    assert.ok(looksLikePlanning(text), `Expected planning detection for: "${text}"`);
  }
});

test('T-6.2b looksLikePlanning does NOT flag genuine final answers', () => {
  const finalAnswers = [
    'The specification has been created successfully.',
    'All artifacts have been written to disk.',
    'Done. Created change and fetched proposal instructions.',
    'No open proposals found.',
  ];
  for (const text of finalAnswers) {
    assert.ok(!looksLikePlanning(text), `Expected NO planning detection for: "${text}"`);
  }
});

// =============================================================================
// T-5.5 — Nudge mechanism: planning response triggers one correction turn
// =============================================================================
//
// Strategy:
//  • Script the mock LLM to return planning prose on call 0, then a real
//    <tool_call> on call 1 (after the nudge), then a final answer on call 2.
//  • Assert the agent logged a warning about the nudge.
//  • Assert the tool was ultimately executed (nudge was effective).
// =============================================================================

test('T-5.5 Planning response triggers nudge; agent recovers and calls tool', async (t) => {
  const executedCommands: string[] = [];

  const originalEntry = registry.get('execute_openspec');
  t.after(() => {
    if (originalEntry !== undefined) registry.set('execute_openspec', originalEntry);
    else registry.delete('execute_openspec');
  });

  registry.set('execute_openspec', {
    name: 'execute_openspec',
    description: 'mock for T-5.5',
    schema: ExecuteOpenspecSchema,
    execute: async (input) => {
      executedCommands.push(input.command);
      const result: ToolResult = { success: true, command: `openspec ${input.command}`, stdout: 'ok', stderr: '' };
      return JSON.stringify(result, null, 2);
    },
  });

  // Call 0: plain planning prose (no <tool_call>) → triggers nudge
  // Call 1: proper <tool_call> after receiving the nudge correction
  // Call 2: final answer
  let callIndex = 0;
  const mockGenerate = t.mock.fn(async (): Promise<{ content: string }> => {
    const i = callIndex++;
    if (i === 0) return { content: "I will create the change now. Let me start by running openspec new." };
    if (i === 1) return { content: '<tool_call>{"name":"execute_openspec","input":{"command":"new","args":["change","test-nudge"]}}</tool_call>' };
    return { content: 'Done. Created the change.' };
  });

  const mockClient: AiClientLike = { generateText: mockGenerate };

  const config: AgentConfig = {
    provider: 'openai', model: 'gpt-4o', apiKey: 'test-key',
    baseUrl: undefined, temperature: 0.2, maxIterations: 10, cwd: process.cwd(), debug: false,
  };

  const warnLines: string[] = [];
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => { warnLines.push(args.map(String).join(' ')); };
  try {
    await runAgent('Create a test change', config, mockClient);
  } finally {
    console.warn = origWarn;
  }

  // Nudge warning must have been logged
  const hasNudgeWarn = warnLines.some((l) => l.includes('narrated a plan'));
  assert.ok(hasNudgeWarn, `Expected nudge warning in console.warn. Got: ${warnLines.join(' | ')}`);

  // Tool must have been called after the nudge
  assert.ok(executedCommands.includes('new'), `"new" must be in executed commands after nudge: ${executedCommands.join(', ')}`);

  // LLM called 3 times: planning → nudge → tool call → final answer
  assert.ok(mockGenerate.mock.calls.length >= 3, `LLM must be called ≥3 times, got ${mockGenerate.mock.calls.length}`);
});

// =============================================================================
// T-6.3 — extractPhantomPaths: detects files claimed but not on disk
// =============================================================================

test('T-6.3 extractPhantomPaths detects mentioned files missing from disk and writtenFiles', () => {
  const cwd = process.cwd();
  const writtenFiles = new Set<string>();

  // A path that definitely doesn't exist on disk
  const text = 'I have written openspec/changes/ghost-slug/proposal.md and design.md to disk.';
  const phantoms = extractPhantomPaths(text, writtenFiles, cwd);

  // Both paths should be flagged as phantom
  assert.ok(phantoms.length >= 1, `Expected ≥1 phantom, got 0. Phantoms: ${JSON.stringify(phantoms)}`);
  const joined = phantoms.join(' ');
  assert.ok(
    joined.includes('proposal.md') || joined.includes('design.md'),
    `Expected phantom paths to include proposal.md or design.md. Got: ${joined}`,
  );
});

test('T-6.3b extractPhantomPaths does NOT flag files that are in writtenFiles', () => {
  const cwd = process.cwd();
  // Use the actual package.json which definitely exists
  const realFile = 'package.json';
  const writtenFiles = new Set<string>([`${cwd}\\${realFile}`, `${cwd}/${realFile}`]);

  const text = `I have written ${realFile} to disk.`;
  const phantoms = extractPhantomPaths(text, writtenFiles, cwd);

  // package.json actually exists on disk, so should NOT be phantom
  const mentionsPackageJson = phantoms.some((p) => p.endsWith('package.json'));
  assert.ok(
    !mentionsPackageJson,
    `package.json exists on disk and should not be phantom. Phantoms: ${phantoms.join(', ')}`,
  );
});

// =============================================================================
// T-6.4 — Truncation nudge: response at token limit triggers continuation
// =============================================================================

test('T-6.4 Token-limit truncation triggers continuation nudge', async (t) => {
  const originalEntry = registry.get('execute_openspec');
  t.after(() => {
    if (originalEntry !== undefined) registry.set('execute_openspec', originalEntry);
    else registry.delete('execute_openspec');
  });

  registry.set('execute_openspec', {
    name: 'execute_openspec',
    description: 'mock for T-6.4',
    schema: ExecuteOpenspecSchema,
    execute: async (input) => {
      const result: ToolResult = { success: true, command: `openspec ${input.command}`, stdout: 'ok', stderr: '' };
      return JSON.stringify(result, null, 2);
    },
  });

  // Call 0: truncated response (usage.completionTokens === maxTokens) — no tool_call
  // Call 1: after truncation nudge, model emits tool_call
  // Call 2: final answer
  let callIndex = 0;
  const mockGenerate = t.mock.fn(async (
    _prompt: string,
    opts?: { maxTokens?: number },
  ): Promise<{ content: string; usage?: { completionTokens?: number } }> => {
    const i = callIndex++;
    if (i === 0) {
      // Simulate hitting the token limit — no <tool_call> was emitted
      return {
        content: 'I was about to call openspec new but ran out of space',
        usage: { completionTokens: opts?.maxTokens ?? 8192 },
      };
    }
    if (i === 1) {
      return { content: '<tool_call>{"name":"execute_openspec","input":{"command":"new","args":["change","trunc-test"]}}</tool_call>' };
    }
    return { content: 'Done.' };
  });

  const mockClient: AiClientLike = { generateText: mockGenerate };

  const config: AgentConfig = {
    provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'test-key',
    baseUrl: undefined, temperature: 0.2, maxIterations: 10, cwd: process.cwd(), debug: false,
  };

  const warnLines: string[] = [];
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => { warnLines.push(args.map(String).join(' ')); };
  try {
    await runAgent('Test truncation recovery', config, mockClient);
  } finally {
    console.warn = origWarn;
  }

  const hasTruncationWarn = warnLines.some((l) => l.includes('token limit'));
  assert.ok(hasTruncationWarn, `Expected truncation warning. Got: ${warnLines.join(' | ')}`);
  // Agent must have continued and executed the tool after the nudge
  assert.ok(mockGenerate.mock.calls.length >= 3, `LLM must be called ≥3 times, got ${mockGenerate.mock.calls.length}`);
});
