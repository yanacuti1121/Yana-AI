---
name: serverless-patterns
description: >
  Build and optimize serverless functions — AWS Lambda cold starts,
  Cloudflare Workers edge patterns, function composition, idempotency,
  dead-letter queues, concurrency limits, observability, and IaC deployment
  with SAM/SST. Use when asked about "Lambda", "serverless function",
  "cold start", "Cloudflare Workers", "edge function", "AWS SAM",
  "SST framework", "function timeout", "Lambda concurrency", "DLQ",
  "dead-letter queue", "idempotent Lambda", "serverless observability",
  or "deploy serverless". Do NOT use for: long-running container workloads
  — see kubernetes-patterns or docker-patterns.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "AWS Lambda (Node.js 20/Python 3.12), Cloudflare Workers, SST v3, SAM CLI."
---

## When to Use

- Use when: building event-driven functions (S3 trigger, SQS consumer, API Gateway)
- Use when: cold start latency is causing p99 spikes
- Use when: functions need idempotency guarantees
- Use when: deploying to edge (< 5ms latency, no Node.js runtime)
- Do NOT use for: long-running batch jobs (> 15 min) — use ECS/k8s
- Do NOT use for: persistent WebSocket servers — see websocket-patterns

---

## Lambda Handler Pattern

```ts
// Node.js 20 — ESM, structured errors, idempotency
import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});  // init outside handler — reused across warm invocations

export async function handler(event: SQSEvent, context: Context) {
  const results = await Promise.allSettled(
    event.Records.map(record => processRecord(record))
  );

  // SQS batch: report partial failures
  const failures = results
    .map((r, i) => r.status === 'rejected' ? { itemIdentifier: event.Records[i].messageId } : null)
    .filter(Boolean);

  return { batchItemFailures: failures };
}

async function processRecord(record: SQSRecord) {
  const body = JSON.parse(record.body);
  const idempotencyKey = record.messageId;  // SQS messageId is unique per delivery attempt

  // Idempotency: conditional write — no-op if already processed
  try {
    await dynamo.send(new PutItemCommand({
      TableName: 'processed-events',
      Item: { id: { S: idempotencyKey }, ttl: { N: String(Math.floor(Date.now() / 1000) + 86400) } },
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return;  // already processed
    throw e;
  }

  await doWork(body);
}
```

---

## Cold Start Mitigation

```ts
// ❌ Heavy imports inside handler — re-executed on every cold start
export async function handler(event) {
  const { S3Client } = await import('@aws-sdk/client-s3');  // dynamic import = cold start cost
  const { parse } = await import('csv-parse/sync');
}

// ✅ Top-level — initialized once per container lifetime
import { S3Client } from '@aws-sdk/client-s3';
import { parse } from 'csv-parse/sync';
const s3 = new S3Client({});  // reused across warm invocations

export async function handler(event) { ... }
```

```yaml
# SAM / CloudFormation — provisioned concurrency for latency-sensitive paths
Properties:
  ProvisionedConcurrencyConfig:
    ProvisionedConcurrentExecutions: 5   # 5 warm instances always ready
  # Note: costs money 24/7 — only for p99-critical endpoints
```

---

## Cloudflare Workers (Edge)

```ts
// workers/api.ts — runs in V8 isolate, no cold start, no Node.js
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/hello') {
      return Response.json({ message: 'Hello from the edge' });
    }

    // KV — edge key-value store (eventually consistent)
    const cached = await env.CACHE.get(url.pathname);
    if (cached) return new Response(cached, { headers: { 'X-Cache': 'HIT' } });

    const data = await fetch('https://api.origin.com' + url.pathname);
    const text = await data.text();
    await env.CACHE.put(url.pathname, text, { expirationTtl: 300 });

    return new Response(text);
  },
} satisfies ExportedHandler<Env>;

// wrangler.toml
// [[kv_namespaces]]
// binding = "CACHE"
// id = "your-kv-namespace-id"
```

---

## Dead-Letter Queue

```yaml
# SAM template — route failures to DLQ after 2 attempts
Resources:
  OrderProcessor:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handler.handler
      Runtime: nodejs20.x
      Timeout: 30
      MemorySize: 512
      EventInvokeConfig:
        MaximumRetryAttempts: 2
        DestinationConfig:
          OnFailure:
            Type: SQS
            Destination: !GetAtt DLQ.Arn

  DLQ:
    Type: AWS::SQS::Queue
    Properties:
      MessageRetentionPeriod: 1209600   # 14 days
      # Wire DLQ → CloudWatch alarm for ops visibility
```

---

## Concurrency + Throttling

```yaml
# Prevent runaway Lambda + downstream DB connection exhaustion
Properties:
  ReservedConcurrentExecutions: 50    # hard limit: max 50 simultaneous invocations
  # Set per function — prevents one function from eating all account concurrency
```

```ts
// DB connection pool sizing for Lambda
// Lambda containers don't share connections — use RDS Proxy or small pool
const pool = new Pool({
  max: 2,       // 2 per container * N concurrent = manageable total
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 3000,
});
```

---

## Observability

```ts
// Always emit structured logs with correlation IDs
export async function handler(event: any, context: Context) {
  const logger = {
    info: (msg: string, meta = {}) =>
      console.log(JSON.stringify({
        level: 'INFO', message: msg,
        requestId: context.awsRequestId,
        functionName: context.functionName,
        ...meta,
      })),
  };

  logger.info('Processing started', { eventType: event.type });
}
```

---

## Anti-Fake-Pass Rules

Before claiming serverless function is production-ready, you MUST show:
- [ ] SDK clients initialized outside handler — not inside (cold start cost)
- [ ] SQS consumers return `batchItemFailures` — not all-or-nothing
- [ ] Idempotency implemented for SQS/SNS handlers — DynamoDB conditional write or hash check
- [ ] DLQ configured — failed events not silently discarded
- [ ] `ReservedConcurrentExecutions` set — no unbounded scaling
- [ ] DB connection pool size appropriate for Lambda (max 2–5 per container)
- [ ] Structured logs with `requestId` — CloudWatch Insights queryable

Reference: `gates/anti-fake-pass-gate.md`
