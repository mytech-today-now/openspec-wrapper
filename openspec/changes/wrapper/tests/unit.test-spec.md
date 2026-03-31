# Unit Test Specifications: OpenSpec AI Agent Wrapper

**Change:** `wrapper`
**Artifact:** `tests/unit.test-spec.md`
**Framework:** Vitest (recommended) or Node.js `node:test`
**File target:** `open-spec-agent.ts` internals

---

## Test Suite: `resolveConfig()`

### UT-CONFIG-001 — Returns defaults when no env vars are set

```
Given: process.env has none of the AI_* or OPENSPEC_* variables set
When:  resolveConfig() is called
Then:
  - config.provider      === "openai"
  - config.temperature   === 0.2
  - config.maxIterations === 10
  - config.cwd           === process.cwd()
  - config.debug         === false
```

### UT-CONFIG-002 — Reads all env vars correctly

```
Given: process.env = {
         AI_PROVIDER: "anthropic", AI_MODEL: "claude-opus-4-5",
         AI_API_KEY: "sk-test", AI_BASE_URL: "http://proxy",
         AI_TEMPERATURE: "0.7", AI_MAX_ITERATIONS: "5",
         OPENSPEC_CWD: "/tmp/project", DEBUG: "true"
       }
When:  resolveConfig() is called
Then:  all fields match the env vars exactly (temperature parsed as float, maxIterations as int)
```

### UT-CONFIG-003 — Exits with code 1 when AI_API_KEY is missing (non-Ollama provider)

```
Given: AI_PROVIDER = "openai", AI_API_KEY is not set
When:  resolveConfig() is called
Then:  process.exit(1) is called
And:   console.error includes "AI_API_KEY is required"
```

### UT-CONFIG-004 — Does NOT exit when provider is "ollama" and AI_API_KEY is missing

```
Given: AI_PROVIDER = "ollama", AI_API_KEY is not set
When:  resolveConfig() is called
Then:  resolveConfig() returns a config object without throwing or exiting
```

---

## Test Suite: `shellQuote()`

### UT-QUOTE-001 — Plain string is wrapped in double quotes

```
Given: input = "Dark Mode Toggle"
When:  shellQuote(input) is called
Then:  returns '"Dark Mode Toggle"'
```

### UT-QUOTE-002 — Embedded double quotes are escaped

```
Given: input = 'She said "hello"'
When:  shellQuote(input) is called
Then:  returns '"She said \\"hello\\""'
```

### UT-QUOTE-003 — Empty string returns empty double quotes

```
Given: input = ""
When:  shellQuote(input) is called
Then:  returns '""'
```

---

## Test Suite: Command Assembly in `executeOpenspec()`

### UT-CMD-001 — Command with no args or flags

```
Given: input = { command: "list" }
When:  command string is assembled
Then:  result === "openspec list"
```

### UT-CMD-002 — Command with positional args

```
Given: input = { command: "apply", args: ["dark-mode-toggle"] }
When:  command string is assembled
Then:  result === "openspec apply dark-mode-toggle"
```

### UT-CMD-003 — Command with flags

```
Given: input = { command: "propose", flags: { title: "Dark Mode Toggle" } }
When:  command string is assembled
Then:  result === 'openspec propose --title "Dark Mode Toggle"'
```

### UT-CMD-004 — Command with both args and flags

```
Given: input = { command: "propose", args: ["feature"], flags: { title: "My Feature", yes: "true" } }
When:  command string is assembled
Then:  result starts with "openspec propose feature" and includes '--title "My Feature"' and '--yes "true"'
```

---

## Test Suite: Stderr Scrubbing

### UT-SCRUB-001 — OpenAI key pattern is redacted

```
Given: stderr = "Error: invalid key sk-abc123XYZ456DEF789GHI"
When:  scrubStderr(stderr) is called
Then:  result does NOT contain "sk-abc123XYZ456DEF789GHI"
And:   result contains "[REDACTED]"
```

### UT-SCRUB-002 — Bearer token is redacted

```
Given: stderr = "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload"
When:  scrubStderr(stderr) is called
Then:  the token after "Bearer" is replaced with "[REDACTED]"
```

### UT-SCRUB-003 — Normal error text is not affected

```
Given: stderr = "Error: command not found: openspec"
When:  scrubStderr(stderr) is called
Then:  result === "Error: command not found: openspec"
```

---

## Test Suite: `dispatchTool()`

### UT-DISPATCH-001 — Known tool is called with parsed input

```
Given: registry contains "execute_openspec"
       toolCall = { name: "execute_openspec", input: { command: "list" }, id: "tc-1" }
When:  dispatchTool(toolCall) is called
Then:  the tool's execute() function is called
And:   the result is a JSON string containing { success, command, stdout, stderr }
```

### UT-DISPATCH-002 — Unknown tool name throws Error

```
Given: registry does NOT contain "nonexistent_tool"
       toolCall = { name: "nonexistent_tool", input: {}, id: "tc-2" }
When:  dispatchTool(toolCall) is called
Then:  throws Error with message "Unknown tool: nonexistent_tool"
```

### UT-DISPATCH-003 — Invalid Zod input throws ZodError (execute is NOT called)

```
Given: registry contains "execute_openspec"
       toolCall.input = { command: "rm -rf /" }  // not in enum
When:  dispatchTool(toolCall) is called
Then:  throws ZodError
And:   tool.execute() is never called
```

---

## Test Suite: `executeOpenspec()` — exec behavior (mocked)

### UT-EXEC-001 — Successful exec returns success: true

```
Given: exec mock resolves with { stdout: "proposal created\n", stderr: "", code: 0 }
When:  executeOpenspec({ command: "propose", flags: { title: "Test" } }) is called
Then:  returns { success: true, stdout: "proposal created\n", stderr: "" }
```

### UT-EXEC-002 — Non-zero exit returns success: false (no throw)

```
Given: exec mock rejects with error { code: 1, stderr: "No proposals found" }
When:  executeOpenspec({ command: "apply" }) is called
Then:  returns { success: false, stderr: "No proposals found" }
And:   no exception is thrown from executeOpenspec
```

### UT-EXEC-003 — Timeout returns success: false with timeout message

```
Given: exec mock never resolves within 60 seconds
When:  executeOpenspec({ command: "propose" }) is called with a 60s timeout mock
Then:  returns { success: false, stderr: "Command timed out after 60s" }
```

