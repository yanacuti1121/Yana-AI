---
name: crossplane-control-plane
description: Crossplane universal control plane for cloud resource management via Kubernetes. Composite Resources (XR), Compositions, provider configuration, and managing AWS/GCP/Azure resources with kubectl. Sources: crossplane/crossplane (Apache-2.0).
origin: yana-ai — synthesized from crossplane/crossplane (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /crossplane-control-plane

## When to Use

- Provision cloud resources (S3 bucket, RDS, Cloud SQL) with the same kubectl workflow as K8s resources
- Unified control plane: one YAML API for both app and infrastructure lifecycle
- Composition: define organizational standards once, let teams create resources from templates
- Agent needs a database: agent requests a PostgreSQLInstance, Crossplane provisions it

## Do NOT use for

- Terraform workflows (Crossplane is K8s-native; use Terraform for non-K8s environments)
- One-time resource creation (kubectl is simpler without controller overhead)

---

## Install Crossplane and AWS provider

```bash
# Install Crossplane
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm install crossplane crossplane-stable/crossplane \
  --namespace crossplane-system --create-namespace

# Install AWS provider
kubectl apply -f - <<EOF
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-s3
spec:
  package: xpkg.upbound.io/upbound/provider-aws-s3:v1
EOF

# Configure provider credentials
kubectl create secret generic aws-credentials \
  --from-file=credentials=$HOME/.aws/credentials \
  --namespace crossplane-system

kubectl apply -f - <<EOF
apiVersion: aws.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: Secret
    secretRef: { namespace: crossplane-system, name: aws-credentials, key: credentials }
EOF
```

---

## Composite Resource Definition (XRD)

```yaml
# xrd.yaml — define the API surface agents will use
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xamtamdatabases.yamtam.io
spec:
  group: yamtam.io
  names:
    kind:   XYamtamDatabase
    plural: xamtamdatabases
  claimNames:
    kind:   YamtamDatabase    # namespace-scoped claim
    plural: yamtamdatabases
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                tier:     { type: string, enum: [dev, prod] }
                region:   { type: string }
                storageGB: { type: integer }
```

---

## Composition (maps XR → real cloud resources)

```yaml
# composition.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: yamtam-rds-postgres
spec:
  compositeTypeRef:
    apiVersion: yamtam.io/v1alpha1
    kind:       XYamtamDatabase
  resources:
    - name: rds-instance
      base:
        apiVersion: rds.aws.upbound.io/v1beta1
        kind:       Instance
        spec:
          forProvider:
            region:          us-east-1
            instanceClass:   db.t3.micro
            engine:          postgres
            engineVersion:   "15"
            allocatedStorage: 20
      patches:
        - type:          FromCompositeFieldPath
          fromFieldPath: spec.storageGB
          toFieldPath:   spec.forProvider.allocatedStorage
        - type:          FromCompositeFieldPath
          fromFieldPath: spec.region
          toFieldPath:   spec.forProvider.region
```

---

## Agent claims a database

```yaml
# agent requests a database — no AWS console needed
apiVersion: yamtam.io/v1alpha1
kind: YamtamDatabase
metadata:
  name:      agent-db
  namespace: yamtam
spec:
  tier:      prod
  region:    us-east-1
  storageGB: 100
```

```bash
kubectl apply -f agent-db.yaml
kubectl get yamtamdatabases agent-db -o wide
# NAME        SYNCED   READY   CONNECTION-SECRET   AGE
# agent-db    True     True    agent-db-creds      3m
```

---

## Anti-Fake-Pass Checklist

```
❌ Provider not healthy → ManagedResources stuck in Unknown state with no error
❌ XRD without claimNames → agents can't create namespace-scoped Claims; only cluster-scoped XR
❌ Composition patches wrong fieldPath → cloud resource created with wrong config; no validation error
❌ ProviderConfig credentials expired → all ManagedResources fail to reconcile silently
❌ Deleting Claim without --cascade=false → Crossplane deletes the actual cloud resource (S3 bucket deleted!)
❌ No readinessChecks in Composition → Claim reports Ready: True before RDS is actually available
```
