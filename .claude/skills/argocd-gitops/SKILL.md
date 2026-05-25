---
name: argocd-gitops
description: Argo CD GitOps reconciliation loop for agent infrastructure. App-of-Apps pattern, sync policies, drift detection, progressive rollouts, and automated self-healing from Git as single source of truth. Sources: argoproj/argo-cd (Apache-2.0).
origin: yamtam-engine — synthesized from argoproj/argo-cd (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.52
---

# /argocd-gitops

## When to Use

- Git repo = single source of truth for cluster state; any manual change is auto-reverted
- Continuous delivery: merge to main → Argo CD syncs cluster automatically
- Drift detection: alert/auto-fix when someone kubectl-edits a resource directly
- App-of-Apps: one root Application manages 50+ sub-applications declaratively

## Do NOT use for

- Non-Kubernetes deployments
- Secrets management (combine with External Secrets Operator or Sealed Secrets)

---

## Application manifest

```yaml
# application.yaml — deploy yamtam-agent from Helm chart in Git
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name:      yamtam-prod
  namespace: argocd
spec:
  project: default

  source:
    repoURL:        https://github.com/org/yamtam-config
    targetRevision: main
    path:           charts/yamtam-agent
    helm:
      valueFiles:
        - values-prod.yaml
      parameters:
        - name:  image.tag
          value: "1.3.52"

  destination:
    server:    https://kubernetes.default.svc
    namespace: yamtam

  syncPolicy:
    automated:
      prune:    true       # delete resources removed from Git
      selfHeal: true       # auto-revert manual kubectl changes
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - ApplyOutOfSyncOnly=true
    retry:
      limit: 3
      backoff: { duration: 5s, factor: 2, maxDuration: 3m }
```

---

## App-of-Apps pattern

```yaml
# root-app.yaml — manages all sub-applications
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  source:
    repoURL:        https://github.com/org/yamtam-config
    targetRevision: main
    path:           apps/          # directory with Application yamls
  destination:
    server:    https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated: { prune: true, selfHeal: true }
```

---

## Sync via Argo CD CLI

```bash
# Manual sync (force re-apply)
argocd app sync yamtam-prod

# Wait for sync to complete
argocd app wait yamtam-prod --timeout 120

# Check sync status
argocd app get yamtam-prod

# Rollback to previous revision
argocd app rollback yamtam-prod

# Diff: what would change if synced now?
argocd app diff yamtam-prod
```

---

## Drift detection webhook (Node.js)

```javascript
// Argo CD can trigger webhooks on sync events
import express from 'express'
const app = express()

app.post('/argocd/webhook', express.json(), (req, res) => {
  const { application, operation } = req.body

  if (operation?.sync?.result?.resources?.some(r => r.status === 'OutOfSync')) {
    console.warn('[argocd] DRIFT DETECTED in', application.metadata.name)
    alertOncall({ app: application.metadata.name, status: 'OutOfSync' })
  }

  if (operation?.sync?.result?.phase === 'Failed') {
    console.error('[argocd] SYNC FAILED:', application.metadata.name)
  }

  res.sendStatus(200)
})
```

---

## Anti-Fake-Pass Checklist

```
❌ automated.selfHeal: false → drift from manual changes persists until next manual sync
❌ automated.prune: false → deleted resources from Git remain in cluster (ghost resources)
❌ Secrets in Git → Argo CD syncs them in plaintext; use External Secrets Operator
❌ No retry policy → transient webhook/network error causes permanent OutOfSync state
❌ App-of-Apps without wave sync-order → child apps create resources before CRDs exist
❌ targetRevision: HEAD → always tracks latest commit including broken commits; use branch or tag
```
