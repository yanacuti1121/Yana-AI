---
name: durable-task-queues
description: Durable background job and task queue patterns for AI agent systems. BullMQ Redis-backed queues with concurrency + rate limiting, Inngest event-driven durable functions, Trigger.dev background tasks, dead-letter queue patterns, and job failure diagnostics. Sources: taskforcesh/bullmq, inngest/inngest, triggerdotdev/trigger.dev, OptimalBits/bull, agenda/agenda.
origin: yamtam-engine — synthesized from taskforcesh/bullmq, inngest/inngest, triggerdotdev/trigger.dev, OptimalBits/bull, agenda/agenda
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.44
---

# /durable-task-queues

## When to Use

- Agent task takes > 30s — HTTP response timeout risk
- Work must survive server restart (embedding batch, export, analysis)
- Fan-out: one event → many parallel sub-tasks
- "Why did this job fail last night?" — need structured job history

## Do NOT use for

- Sub-second operations — queue overhead isn't worth it
- One-off scripts run manually

---

## Decision: BullMQ vs Inngest vs Trigger.dev

```
Already using Redis in infra?
  YES → BullMQ (battle-tested, mature, full queue primitives)
  NO  →
    Want event-driven, serverless-compatible, no extra infra?
      YES → Inngest (zero infra, SDK only, Vercel/Next.js native)
      Need long-running background tasks (> 15 min) with retries + logging?
        YES → Trigger.dev (dashboard, streaming logs, sleep/wait APIs)
```

---

## BullMQ (Redis-backed queues)

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq'

const connection = { host: process.env.REDIS_HOST, port: 6379 }

// Queue — producer side
const agentQueue = new Queue('agent-tasks', {
  connection,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 2000 },  // 2s, 4s, 8s
    removeOnComplete: { count: 100 },   // keep last 100 completed
    removeOnFail:     { count: 500 },   // keep last 500 failed for debug
  },
})

await agentQueue.add('run-analysis', { repoUrl, sessionId }, {
  priority: 1,             // lower = higher priority (1 = urgent)
  delay:    0,
  jobId:    `analysis:${sessionId}`,  // idempotent ID prevents duplicates
})

// Worker — consumer side
const worker = new Worker('agent-tasks', async (job) => {
  job.log(`Starting analysis for ${job.data.repoUrl}`)
  await job.updateProgress(10)

  const result = await runAgentAnalysis(job.data.repoUrl)
  await job.updateProgress(100)
  return result

}, {
  connection,
  concurrency:    5,      // max parallel jobs per worker
  limiter: {
    max:          10,     // rate limit: max 10 jobs
    duration:     1000,  // per 1000ms
  },
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'job_failed')
})

// Rule: always set jobId for idempotency — re-enqueuing same ID is a no-op
// Rule: removeOnComplete + removeOnFail required — Redis fills up without them
// Rule: job.log() goes to BullMQ job history, visible in BullBoard
```

```typescript
// Dead-letter queue pattern — jobs that exhausted all retries
const deadLetterQueue = new Queue('agent-tasks-dlq', { connection })

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await deadLetterQueue.add('dead', {
      originalJob:  job.name,
      data:         job.data,
      error:        err.message,
      failedAt:     new Date().toISOString(),
    })
  }
})

// Rule: DLQ enables manual replay — never silently drop failed jobs
```

---

## Inngest (event-driven durable functions)

```typescript
import { Inngest } from 'inngest'

const inngest = new Inngest({ id: 'yamtam-agent' })

// Define a durable function — survives cold starts, serverless-compatible
export const processAgentTask = inngest.createFunction(
  {
    id:     'process-agent-task',
    name:   'Process Agent Task',
    retries: 3,
    throttle: { limit: 10, period: '1m', key: 'event.data.userId' },
  },
  { event: 'agent/task.created' },

  async ({ event, step }) => {
    // Each step is independently retried — completed steps are skipped on retry
    const embeddings = await step.run('compute-embeddings', async () => {
      return computeEmbeddings(event.data.content)
    })

    const stored = await step.run('store-to-vector-db', async () => {
      return storeEmbeddings(embeddings, event.data.sessionId)
    })

    // Sleep without blocking a thread (Inngest persists state)
    await step.sleep('wait-for-cooldown', '5s')

    const result = await step.run('run-analysis', async () => {
      return runAgentAnalysis(event.data.taskId)
    })

    return { stored, result }
  }
)
```

```typescript
// Send event to trigger the function
await inngest.send({
  name: 'agent/task.created',
  data: { taskId: uuid(), userId, content, sessionId },
})

// Rule: step.run() = durable checkpoint — data is persisted between steps
// Rule: step.sleep() does not consume a thread — safe for minutes/hours
// Rule: throttle.key scopes rate limit per field (e.g., per userId)
// Rule: Inngest replays from last successful step on retry — not from start
```

---

## Trigger.dev (long-running background tasks)

```typescript
import { task, schedules, wait } from '@trigger.dev/sdk/v3'

// Long-running task with streaming logs (visible in Trigger.dev dashboard)
export const agentResearchTask = task({
  id:      'agent-research',
  retry:   { maxAttempts: 3, minTimeoutInMs: 1000, multiplier: 2 },
  machine: { preset: 'medium-1x' },  // 1 vCPU / 2GB RAM

  run: async (payload: { topic: string; sessionId: string }) => {
    console.log(`[research] Starting: ${payload.topic}`)

    const sources = await searchWeb(payload.topic)
    console.log(`[research] Found ${sources.length} sources`)

    // wait.for suspends task (not sleeping thread) — supports hours
    await wait.for({ seconds: 5 })

    const summaries = await Promise.all(
      sources.map(src => summarizeSource(src))
    )

    const report = await synthesizeReport(summaries, payload.topic)
    console.log(`[research] Done — ${report.length} chars`)
    return { report, sourceCount: sources.length }
  },
})

// Trigger from API route
import { tasks } from '@trigger.dev/sdk/v3'

const handle = await tasks.trigger('agent-research', {
  topic:     'vector database benchmarks 2025',
  sessionId: req.session.id,
})

// Poll or webhook for completion
const result = await tasks.poll(handle.id, { intervalMs: 2000 })
```

---

## Job Failure Diagnostics Pattern

```typescript
// Structured failure logging for post-mortem
worker.on('failed', async (job, err) => {
  if (!job) return

  const diagnostic = {
    jobId:      job.id,
    jobName:    job.name,
    attempt:    job.attemptsMade,
    maxAttempts: job.opts.attempts,
    data:       job.data,             // scrub PII before logging
    error:      err.message,
    stack:      err.stack,
    startedAt:  new Date(job.processedOn!).toISOString(),
    failedAt:   new Date().toISOString(),
    logs:       await job.logs,       // job.log() entries
  }

  logger.error(diagnostic, 'job_failure_diagnostic')
  // Alert if final attempt
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await alertSlack(`Job ${job.name} exhausted retries: ${err.message}`)
  }
})

// Rule: log job.data in failure diagnostic — can't reproduce without input
// Rule: alert only on final attempt — intermediate retries are expected noise
```

---

## Anti-Fake-Pass Checklist

```
❌ BullMQ worker without concurrency limit (Redis connection pool exhausted)
❌ No removeOnComplete/removeOnFail (Redis OOM in hours)
❌ Retry without backoff on rate-limited API (thundering herd on 429)
❌ jobId missing (duplicate jobs on re-enqueue = duplicate side effects)
❌ Inngest step.run() not used (whole function re-runs on any step failure)
❌ DLQ absent (failed jobs silently lost — can't diagnose or replay)
❌ Trigger.dev task without machine preset (memory default too low for LLM ops)
❌ Job failure handler logs only error message (missing input data = can't reproduce)
```
