---
name: terminal--n8n-workflow-sdk
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: n8n-workflow-sdk)"
license: Sustainable Use License
version: "1.0.0"
compatibility: "yana-ai >= 0.14.0"
---

# n8n Workflow SDK

## Overview

`@n8n/workflow-sdk` is the official TypeScript SDK from n8n (v0.2.0, released February 2026) for programmatically creating, validating, and converting workflows. Instead of dragging nodes in the UI, define workflows as code — type-safe, version-controlled, and composable. Supports all n8n node types including AI/LangChain nodes. Includes bidirectional conversion between JSON and TypeScript.

## Instructions

### Step 1: Install and Create a Basic Workflow

```bash
npm install @n8n/workflow-sdk
```

```typescript
// workflows/data-sync.ts — Programmatic workflow creation
import { WorkflowBuilder, manual, httpRequest, code } from '@n8n/workflow-sdk'

// Build a simple data sync workflow
const workflow = new WorkflowBuilder()
  .withName('Daily Data Sync')
  .addTrigger(manual())
  .then(httpRequest({
    url: 'https://api.example.com/users',
    method: 'GET',
    headers: {
      Authorization: '={{ $env.API_KEY }}',      // n8n expression for env variable
    },
  }))
  .then(code({
    language: 'typescript',
    code: `
      // Transform API response to internal format
      return items.map(item => ({
        json: {
          id: item.json.id,
          email: item.json.email,
          name: \`\${item.json.firstName} \${item.json.lastName}\`,
          active: item.json.status === 'active',
          syncedAt: new Date().toISOString(),
        }
      }))
    `,
  }))
  .build()

// workflow is now a valid n8n JSON object ready to import
console.log(JSON.stringify(workflow, null, 2))
```

### Step 2: Control Flow — Branching and Merging

```typescript
// workflows/lead-routing.ts — Conditional workflow with branches
import {
  WorkflowBuilder, webhook, ifElse, merge,
  httpRequest, node, sticky,
} from '@n8n/workflow-sdk'

const workflow = new WorkflowBuilder()
  .withName('Lead Routing')

  // Trigger on incoming webhook
  .addTrigger(webhook({
    path: 'new-lead',
    method: 'POST',
    responseMode: 'onReceived',
  }))

  // Branch based on lead score
  .then(ifElse({
    conditions: {
      combinator: 'and',
      conditions: [
        { leftValue: '={{ $json.score }}', operator: 'gte', rightValue: 80 },
      ],
    },
  }))

  // True branch — high-value lead → Salesforce + Slack notification
  .onTrue(
    httpRequest({
      url: 'https://mycompany.salesforce.com/api/leads',
      method: 'POST',
      body: '={{ JSON.stringify($json) }}',
    })
  )

  // False branch — low-score lead → add to nurture campaign
  .onFalse(
    httpRequest({
      url: 'https://api.mailchimp.com/3.0/lists/abc123/members',
      method: 'POST',
      body: '={{ JSON.stringify({ email_address: $json.email, status: "subscribed" }) }}',
    })
  )

  // Add documentation
  .addSticky(sticky({
    content: '## Lead Routing\nHigh-score leads (≥80) go to Salesforce.\nOthers enter nurture campaign.',
    width: 300,
    height: 150,
  }))

  .build()
```

### Step 3: AI/LangChain Workflows

```typescript
// workflows/ai-support-agent.ts — AI agent with tools and memory
import {
  WorkflowBuilder, webhook,
  languageModel, memory, tool, outputParser,
  node,
} from '@n8n/workflow-sdk'

const workflow = new WorkflowBuilder()
  .withName('AI Support Agent')

  .addTrigger(webhook({ path: 'support', method: 'POST' }))

  // AI Agent node with LangChain components
  .then(node('n8n-nodes-langchain.agent', {
    text: '={{ $json.message }}',
    systemMessage: `You are a helpful customer support agent for a SaaS product.
      Use the available tools to look up account information and
      knowledge base articles. Be concise and helpful.`,
  }))

  // Attach LLM
  .withSub(languageModel('openAi', {
    model: 'gpt-4o',
    temperature: 0.3,
  }))

  // Attach conversation memory
  .withSub(memory('windowBuffer', {
    sessionKey: '={{ $json.userId }}',
    windowSize: 20,      // remember last 20 messages
  }))

  // Attach tools the agent can use
  .withSub(tool('httpRequest', {
    name: 'lookup_account',
    description: 'Look up customer account by email or ID',
    url: 'https://api.myapp.com/accounts/{{ $fromAi("query") }}',
    method: 'GET',
  }))
  .withSub(tool('httpRequest', {
    name: 'search_knowledge_base',
    description: 'Search the knowledge base for help articles',
    url: 'https://api.myapp.com/kb/search?q={{ $fromAi("query") }}',
    method: 'GET',
  }))

  // Parse structured output
  .then(outputParser('structured', {
    schema: {
      answer: { type: 'string', description: 'The response to the customer' },
      category: { type: 'string', description: 'Issue category: billing, technical, general' },
      escalate: { type: 'boolean', description: 'Whether to escalate to human agent' },
    },
  }))

  .build()
```

### Step 4: Batch Processing with Split and Merge

```typescript
// workflows/bulk-enrichment.ts — Process records in batches
import {
  WorkflowBuilder, schedule, httpRequest,
  splitInBatches, merge, code, node,
} from '@n8n/workflow-sdk'

const workflow = new WorkflowBuilder()
  .withName('Contact Enrichment Pipeline')

  // Run every night at 2 AM
  .addTrigger(schedule({ rule: { interval: [{ field: 'hours', triggerAtHour: 2 }] } }))

  // Fetch contacts that need enrichment
  .then(httpRequest({
    url: 'https://api.myapp.com/contacts?needs_enrichment=true&limit=500',
    method: 'GET',
  }))

  // Process in batches of 50 to respect API rate limits
  .then(splitInBatches({ batchSize: 50 }))

  // Enrich each contact via Clearbit
  .then(httpRequest({
    url: 'https://person.clearbit.com/v2/people/find',
    method: 'GET',
    queryParameters: { email: '={{ $json.email }}' },
    headers: { Authorization: '={{ $env.CLEARBIT_KEY }}' },
    options: { batching: { batch: { batchSize: 10, batchInterval: 1000 } } },
  }))

  // Transform and save
  .then(code({
    language: 'typescript',
    code: `
      return items.map(item => ({
        json: {
          contactId: item.json.contactId,
          company: item.json.company?.name,
          title: item.json.title,
          linkedIn: item.json.linkedin?.handle,
          enrichedAt: new Date().toISOString(),
        }
      }))
    `,
  }))

  .then(httpRequest({
    url: 'https://api.myapp.com/contacts/bulk-update',
    method: 'PATCH',
    body: '={{ JSON.stringify($json) }}',
  }))

  .build()
```

### Step 5: Convert Between JSON and TypeScript

```typescript
// tools/convert.ts — Bidirectional workflow conversion
import {
  generateWorkflowCode,
  parseWorkflowCode,
  validateWorkflow,
} from '@n8n/workflow-sdk'

// JSON → TypeScript (import existing workflows as code)
const existingWorkflowJson = require('./exported-workflow.json')
const tsCode = generateWorkflowCode(existingWorkflowJson)
console.log(tsCode)
// Outputs clean TypeScript using WorkflowBuilder API

// TypeScript → JSON (deploy code-defined workflows)
const workflowJson = parseWorkflowCode(tsCode)
console.log(JSON.stringify(workflowJson, null, 2))
// Outputs valid n8n JSON ready for import

// Validate before deploying
const errors = validateWorkflow(workflowJson)
if (errors.length > 0) {
  console.error('Validation errors:', errors)
  process.exit(1)
}
console.log('Workflow is valid ✓')
```

### Step 6: Deploy Workflows via n8n API

```typescript
// deploy.ts — Push SDK-built workflows to n8n instance
import { WorkflowBuilder } from '@n8n/workflow-sdk'

async function deployWorkflow(workflow: ReturnType<WorkflowBuilder['build']>) {
  const response = await fetch(`${process.env.N8N_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': process.env.N8N_API_KEY!,
    },
    body: JSON.stringify(workflow),
  })

  const result = await response.json()
  console.log(`Deployed: ${result.name} (ID: ${result.id})`)

  // Activate the workflow
  await fetch(`${process.env.N8N_URL}/api/v1/workflows/${result.id}/activate`, {
    method: 'PATCH',
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY! },
  })

  console.log(`Activated: ${result.name}`)
  return result.id
}

// Deploy all workflows from code
const workflows = [
  require('./workflows/data-sync'),
  require('./workflows/lead-routing'),
  require('./workflows/ai-support-agent'),
]

for (const wf of workflows) {
  await deployWorkflow(wf)
}
```

## Guidelines

- `@n8n/workflow-sdk` v0.2.0 is an early release (Feb 2026) — API may evolve. Pin the version.
- Use `generateWorkflowCode()` to migrate existing JSON workflows to code — great for version control.
- `validateWorkflow()` catches node configuration errors before deployment — use in CI.
- n8n expressions (`={{ }}`) work in all string parameters — reference previous node data with `$json`, `$env`, `$fromAi()`.
- AI/LangChain nodes use `.withSub()` to attach language models, memory, and tools to agent nodes.
- The SDK outputs standard n8n JSON — deploy via the n8n REST API or import through the UI.
- License is Sustainable Use (n8n proprietary), not open source — check terms for your use case.
- For workflow-as-code patterns: keep workflows in a `workflows/` directory, validate in CI, deploy with a script.
