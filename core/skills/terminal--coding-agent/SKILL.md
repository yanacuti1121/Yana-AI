---
name: terminal--coding-agent
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: coding-agent)"
license: Apache-2.0
version: "1.0.0"
compatibility: "yamtam-engine >= 0.14.0"
---

# Coding Agent

## Overview

Run coding agents (Claude Code, Codex CLI, Gemini CLI, or others) as background processes for programmatic task delegation. Spawn sub-agents to handle well-scoped tasks, monitor their progress, and collect results. Useful for parallel task execution, complex multi-step workflows, and automated coding pipelines.

## Instructions

When a user asks you to delegate work to a coding agent or run one in the background, follow this process:

### Step 1: Verify the agent CLI is available

Check which coding agent CLIs are installed:

```bash
# Check for Claude Code
claude --version 2>/dev/null && echo "claude available" || echo "claude not found"

# Check for Codex CLI
codex --version 2>/dev/null && echo "codex available" || echo "codex not found"

# Check for Gemini CLI
gemini --version 2>/dev/null && echo "gemini available" || echo "gemini not found"
```

If none are available, instruct the user to install one:

```bash
# Claude Code
npm install -g @anthropic-ai/claude-code

# Codex CLI
npm install -g @openai/codex
```

### Step 2: Define the task clearly

Before spawning an agent, ensure the task is:
- **Well-scoped:** A single, clear objective (not "fix everything")
- **Self-contained:** The agent can complete it without interactive input
- **Verifiable:** You can check the output or result when done

Write a clear prompt that includes:
- What to do (specific action)
- Where to do it (file paths, directories)
- Constraints (do not modify other files, follow conventions)
- Expected output format

### Step 3: Run the agent

**Claude Code (background, non-interactive):**

```bash
# Run with a specific prompt, print-only mode
claude -p "Refactor the function parseConfig in src/config.ts to use zod validation. Do not modify other files." \
  --output-format text \
  2>&1 | tee /tmp/agent-output.txt &

# Store the PID for monitoring
AGENT_PID=$!
echo "Agent running with PID: $AGENT_PID"
```

**Claude Code with specific options:**

```bash
# Limit scope and disable interactive features
claude -p "Add JSDoc comments to all exported functions in src/utils/" \
  --no-permissions \
  --output-format json \
  > /tmp/agent-result.json 2>&1 &
```

**Codex CLI:**

```bash
codex --prompt "Write unit tests for src/auth/login.ts covering success, failure, and timeout cases" \
  --auto-approve \
  2>&1 | tee /tmp/codex-output.txt &
```

### Step 4: Monitor and collect results

```bash
# Check if the agent is still running
ps -p $AGENT_PID > /dev/null 2>&1 && echo "Still running" || echo "Finished"

# Wait for completion
wait $AGENT_PID
EXIT_CODE=$?
echo "Agent exited with code: $EXIT_CODE"

# Read the output
cat /tmp/agent-output.txt
```

### Step 5: Validate the results

After the agent finishes:
- Check the exit code (0 = success)
- Review the output for errors or warnings
- Verify the changes by reading modified files
- Run any relevant tests to confirm correctness
- Report the results to the user

## Examples

### Example 1: Delegate test writing to a background agent

**User request:** "Write tests for the auth module while I work on the API"

**Actions:**

```bash
# Spawn Claude Code to write tests in the background
claude -p "Write comprehensive unit tests for all functions in src/auth/. \
Use vitest as the test framework. Create test files next to source files \
with .test.ts extension. Cover success, failure, and edge cases. \
Do not modify any source files." \
  --output-format text \
  2>&1 | tee /tmp/test-agent.txt &

TEST_PID=$!
echo "Test writing agent started (PID: $TEST_PID)"
```

After completion, review the generated test files and run the test suite:

```bash
wait $TEST_PID
npx vitest run src/auth/
```

### Example 2: Run parallel agents for independent tasks

**User request:** "Add types to the utils folder and add docs to the components folder"

**Actions:**

```bash
# Agent 1: Add TypeScript types
claude -p "Add strict TypeScript types to all functions in src/utils/. \
Replace any 'any' types with proper types. Do not modify files outside src/utils/." \
  --output-format text > /tmp/types-agent.txt 2>&1 &
PID1=$!

# Agent 2: Add documentation
claude -p "Add JSDoc documentation to all React components in src/components/. \
Include @param, @returns, and @example tags. Do not modify logic." \
  --output-format text > /tmp/docs-agent.txt 2>&1 &
PID2=$!

# Wait for both
wait $PID1 $PID2
echo "Both agents finished"
cat /tmp/types-agent.txt
cat /tmp/docs-agent.txt
```

### Example 3: Agent with structured output

**User request:** "Analyze the codebase and list all TODO comments with suggested fixes"

**Actions:**

```bash
claude -p "Search the entire src/ directory for TODO, FIXME, and HACK comments. \
For each one, output a JSON array with objects containing: file, line, comment, \
and suggestedFix. Only output the JSON, no other text." \
  --output-format text > /tmp/todos.json 2>&1

# Parse and display
cat /tmp/todos.json | python3 -m json.tool
```

## Guidelines

- Always scope tasks narrowly. Agents work best with focused, well-defined objectives.
- Use `--output-format text` or `--output-format json` for programmatic consumption.
- Set reasonable timeouts for background processes to avoid runaway agents.
- Never spawn agents for tasks involving secrets, credentials, or destructive operations.
- Review all agent output before presenting it to the user or applying changes.
- For parallel agents, ensure they work on non-overlapping files to avoid conflicts.
- Capture both stdout and stderr to diagnose failures.
- Prefer spawning one agent per well-defined task over one agent for many tasks.
- If an agent fails, read its output, diagnose the issue, and either retry with a refined prompt or handle the task directly.
