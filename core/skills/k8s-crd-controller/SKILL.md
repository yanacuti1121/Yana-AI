---
name: k8s-crd-controller
description: Kubernetes Custom Resource Definitions and controller reconciliation loop patterns. CRD schema design, controller-runtime reconciler, desired-state diffing, and agent lifecycle as a K8s-native resource. Sources: kubernetes/kubernetes (Apache-2.0).
origin: yana-ai — synthesized from kubernetes/kubernetes (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /k8s-crd-controller

## When to Use

- Model yamtam agent lifecycle as a Kubernetes resource (create/update/delete → reconcile)
- Write a controller that watches CRD objects and drives actual state toward desired state
- Self-healing: if an agent pod crashes, controller re-creates it automatically
- Declarative config: kubectl apply -f agent.yaml → agent boots with correct config

## Do NOT use for

- Simple one-off jobs (use Jobs/CronJobs directly)
- Non-Kubernetes deployments

---

## CRD manifest (YamtamAgent custom resource)

```yaml
# crd.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: yamtamagents.yamtam.io
spec:
  group:   yamtam.io
  names:
    kind:     YamtamAgent
    plural:   yamtamagents
    singular: yamtamagent
    shortNames: [ya]
  scope:   Namespaced
  versions:
    - name: v1alpha1
      served:  true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: [tier, skills]
              properties:
                tier:    { type: string, enum: [fast, power] }
                skills:  { type: array, items: { type: string } }
                replicas: { type: integer, minimum: 1, default: 1 }
            status:
              type: object
              properties:
                phase:    { type: string }
                ready:    { type: boolean }
                message:  { type: string }
      subresources:
        status: {}
```

---

## Reconciler (controller-runtime Go — conceptual)

```go
// reconciler.go
func (r *YamtamAgentReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
  agent := &yamtamv1.YamtamAgent{}
  if err := r.Get(ctx, req.NamespacedName, agent); err != nil {
    return ctrl.Result{}, client.IgnoreNotFound(err)
  }

  // Desired state
  desired := buildDeployment(agent)

  // Actual state
  existing := &appsv1.Deployment{}
  err := r.Get(ctx, req.NamespacedName, existing)

  if errors.IsNotFound(err) {
    // Create
    return ctrl.Result{}, r.Create(ctx, desired)
  }

  // Diff and update
  if !reflect.DeepEqual(existing.Spec, desired.Spec) {
    existing.Spec = desired.Spec
    return ctrl.Result{}, r.Update(ctx, existing)
  }

  // Update status
  agent.Status.Phase   = "Running"
  agent.Status.Ready   = true
  return ctrl.Result{}, r.Status().Update(ctx, agent)
}
```

---

## Node.js CRD watch (kubernetes-client)

```javascript
import * as k8s from '@kubernetes/client-node'

const kc  = new k8s.KubeConfig()
kc.loadFromDefault()
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)

// Watch YamtamAgent resources for changes
const watch = new k8s.Watch(kc)
await watch.watch(
  '/apis/yamtam.io/v1alpha1/yamtamagents',
  {},
  (type, apiObj) => {
    if (type === 'ADDED')    console.log('[k8s] agent created:', apiObj.metadata.name)
    if (type === 'MODIFIED') console.log('[k8s] agent updated:', apiObj.metadata.name)
    if (type === 'DELETED')  console.log('[k8s] agent deleted:', apiObj.metadata.name)
  },
  (err) => console.error('[k8s] watch error:', err)
)
```

---

## Reconciliation pattern (idempotent)

```
Reconcile loop invariant:
  observe(actual) → diff(actual, desired) → act(delta) → requeue

Key rules:
  ✅ Reconcile must be idempotent — same input produces same output
  ✅ Use server-side apply (not client-side patch) to avoid conflicts
  ✅ Always update Status subresource separately from Spec
  ✅ Requeue on transient errors: return ctrl.Result{RequeueAfter: 30s}
  ❌ Never assume order of events — events may arrive out of order or be missed
```

---

## Anti-Fake-Pass Checklist

```
❌ Missing status subresource in CRD → kubectl get ya shows no STATUS column
❌ Reconciler not idempotent → double-create on retry causes conflict error
❌ Updating Spec and Status in one Update() → status changes ignored (use Status().Update())
❌ No RBAC for controller → controller crashes with 403 Forbidden on first Get()
❌ Watch without reconnect → controller stops processing after ~1h (default timeout)
❌ CRD without openAPIV3Schema validation → invalid objects accepted, reconciler panics on nil fields
```
