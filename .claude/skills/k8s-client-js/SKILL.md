---
name: k8s-client-js
description: Kubernetes JavaScript client for agent-driven cluster operations. Pod CRUD, Deployment scaling, namespace isolation, ConfigMap injection, log streaming, and exec into containers. Sources: kubernetes-client/javascript (Apache-2.0).
origin: yamtam-engine — synthesized from kubernetes-client/javascript (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.52
---

# /k8s-client-js

## When to Use

- Agent spawns, monitors, and terminates child agent Pods programmatically
- Scale a Deployment based on task queue depth
- Stream logs from a running agent pod back to the orchestrator
- Exec a command inside a container for health checks or remediation

## Do NOT use for

- Infrastructure-as-code (use [[helm-chart-packaging]] or [[argocd-gitops]])
- High-frequency operations (K8s API has rate limits ~100 req/s)

---

## Setup and authentication

```javascript
import * as k8s from '@kubernetes/client-node'

const kc = new k8s.KubeConfig()

// Auto-detect: in-cluster (ServiceAccount) or ~/.kube/config
kc.loadFromDefault()

const coreApi  = kc.makeApiClient(k8s.CoreV1Api)
const appsApi  = kc.makeApiClient(k8s.AppsV1Api)
const batchApi = kc.makeApiClient(k8s.BatchV1Api)
```

---

## Spawn an agent Pod

```javascript
async function spawnAgentPod(agentId: string, tier: string): Promise<string> {
  const pod = await coreApi.createNamespacedPod('yamtam', {
    metadata: {
      name:   `agent-${agentId}`,
      labels: { app: 'yamtam-agent', tier, agentId },
    },
    spec: {
      restartPolicy: 'Never',
      containers: [{
        name:  'agent',
        image: `ghcr.io/yamtam/agent:latest`,
        env:   [
          { name: 'YAMTAM_AGENT_ID',   value: agentId },
          { name: 'YAMTAM_AGENT_TIER', value: tier },
        ],
        resources: {
          requests: { memory: '256Mi', cpu: '100m' },
          limits:   { memory: '512Mi', cpu: '500m' },
        },
        securityContext: {
          readOnlyRootFilesystem: true,
          allowPrivilegeEscalation: false,
          runAsNonRoot: true,
        },
      }],
    },
  })
  return pod.body.metadata!.name!
}
```

---

## Scale a Deployment

```javascript
async function scaleDeployment(name: string, namespace: string, replicas: number) {
  await appsApi.patchNamespacedDeploymentScale(name, namespace,
    [{ op: 'replace', path: '/spec/replicas', value: replicas }],
    undefined, undefined, undefined, undefined, undefined,
    { headers: { 'Content-Type': 'application/json-patch+json' } }
  )
  console.log(`[k8s] scaled ${name} → ${replicas} replicas`)
}
```

---

## Stream pod logs

```javascript
async function streamPodLogs(podName: string, namespace = 'yamtam') {
  const logStream = await new k8s.Log(kc).log(
    namespace,
    podName,
    undefined,    // container name (undefined = first)
    process.stdout,
    {
      follow:    true,
      tailLines: 100,
      timestamps: true,
    }
  )
  return logStream  // call logStream.destroy() to stop
}
```

---

## Wait for Pod to be Running

```javascript
async function waitForPod(podName: string, namespace = 'yamtam', timeoutMs = 60_000) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const pod   = await coreApi.readNamespacedPod(podName, namespace)
    const phase = pod.body.status?.phase

    if (phase === 'Running')  return true
    if (phase === 'Failed')   throw new Error(`[k8s] pod ${podName} failed`)
    if (phase === 'Succeeded') return true

    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`[k8s] pod ${podName} not ready after ${timeoutMs}ms`)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ loadFromDefault() outside cluster without KUBECONFIG set → uses ~/.kube/config, may hit wrong cluster
❌ No resource limits on spawned pods → runaway agent exhausts node memory
❌ readOnlyRootFilesystem without emptyDir volume → agent can't write temp files
❌ Watching pods without timeout → watch connection drops after ~1h; reconnect required
❌ JSON patch without Content-Type: application/json-patch+json → K8s rejects with 415
❌ Deleting pod without waiting → successor pod starts with stale ConfigMap if not flushed
```
