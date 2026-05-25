---
name: terraform-patterns
description: >
  Write production-grade Terraform — module structure, remote state,
  workspace strategy, variable validation, lifecycle rules, data sources,
  provider version pinning, and safe plan/apply workflow. Use when asked
  about "Terraform", "IaC", "infrastructure as code", "Terraform module",
  "remote state", "terraform plan", "terraform apply", "state locking",
  "Terraform workspace", "provider version", "terraform import",
  "destroy protection", "variable validation", or "Terraform best practices".
  Do NOT use for: Kubernetes resource manifests — see kubernetes-patterns.
  Do NOT use for: Pulumi or CDK — patterns differ significantly.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Terraform ≥ 1.6, OpenTofu ≥ 1.6. AWS/GCP/Azure provider examples."
---

## When to Use

- Use when: provisioning cloud infrastructure (VPCs, EKS clusters, RDS, S3)
- Use when: converting manual cloud setup to reproducible IaC
- Use when: adding a new module to an existing Terraform repo
- Use when: debugging `terraform plan` drift or state corruption
- Do NOT use for: k8s workload manifests — use kubernetes-patterns
- Do NOT use for: Helm chart templating — separate skill

---

## Module Structure

```
infra/
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── versions.tf
│   └── rds/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── environments/
│   ├── production/
│   │   ├── main.tf          ← composes modules
│   │   ├── terraform.tfvars ← env-specific values
│   │   └── backend.tf       ← remote state config
│   └── staging/
│       └── ...
└── .terraform-version        ← pin Terraform CLI version (tfenv)
```

---

## Provider Version Pinning (versions.tf)

```hcl
terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"   # allows 5.40.x, blocks 6.x
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "github.com/org/infra"
    }
  }
}
```

---

## Remote State (backend.tf)

```hcl
# S3 backend with DynamoDB state locking
terraform {
  backend "s3" {
    bucket         = "myorg-terraform-state"
    key            = "production/main.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-locks"   # prevents concurrent apply
  }
}
```

```bash
# Create backend resources first (bootstrapping)
aws s3api create-bucket --bucket myorg-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name terraform-state-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

## Variable Validation

```hcl
variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["production", "staging", "dev"], var.environment)
    error_message = "environment must be production, staging, or dev."
  }
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
  validation {
    condition     = can(regex("^(t3|t4g|m6i|m7i)\\.", var.instance_type))
    error_message = "Only t3, t4g, m6i, m7i families are approved."
  }
}

variable "db_password" {
  type      = string
  sensitive = true    # redacted from plan output + state display
}
```

---

## Lifecycle Rules

```hcl
resource "aws_db_instance" "main" {
  identifier = "prod-postgres"
  # ...

  lifecycle {
    prevent_destroy = true          # block terraform destroy in production
    ignore_changes  = [
      engine_version,               # managed by RDS auto minor upgrade
      latest_restorable_time,
    ]
    create_before_destroy = true    # for zero-downtime replacement
  }
}

resource "aws_security_group" "api" {
  lifecycle {
    create_before_destroy = true    # SG replacement doesn't break running instances
  }
}
```

---

## Data Sources — Read Existing Resources

```hcl
# Reference resources not managed by this state
data "aws_vpc" "existing" {
  tags = { Name = "production-vpc" }
}

data "aws_secretsmanager_secret_version" "db_pass" {
  secret_id = "prod/myapp/database"
}

# Use in resources
resource "aws_db_instance" "main" {
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [data.aws_vpc.existing.id]
  password = jsondecode(data.aws_secretsmanager_secret_version.db_pass.secret_string)["password"]
}
```

---

## Safe Plan/Apply Workflow

```bash
# Always run plan before apply
terraform init
terraform validate          # syntax + schema check
terraform fmt -recursive    # consistent formatting
terraform plan -out=tfplan  # save plan to file

# Review plan carefully:
# + = create  ~ = update in-place  -/+ = destroy+recreate  - = destroy

# Apply saved plan only (prevents drift between plan and apply)
terraform apply tfplan

# Production guard — require explicit approval
terraform apply -input=false -auto-approve  # ❌ NEVER in production
terraform apply tfplan                       # ✅ review plan first

# Targeting (emergency only — creates state drift)
terraform apply -target=aws_instance.web    # avoid unless critical
```

---

## Outputs — Expose for Other Modules

```hcl
output "vpc_id" {
  description = "VPC ID for use by EKS and RDS modules"
  value       = aws_vpc.main.id
  sensitive   = false
}

output "db_endpoint" {
  description = "RDS connection endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = false
}
```

---

## Anti-Fake-Pass Rules

Before claiming Terraform code is production-ready, you MUST show:
- [ ] Provider versions pinned with `~>` constraint in `versions.tf`
- [ ] Remote state configured with DynamoDB locking — no local state
- [ ] `prevent_destroy = true` on databases, VPCs, and stateful resources
- [ ] `sensitive = true` on all password/token variables
- [ ] `terraform validate` + `terraform fmt` pass with no warnings
- [ ] `default_tags` set on provider — every resource is tagged
- [ ] Plan reviewed and saved with `-out=tfplan` before applying
- [ ] No secrets in `.tfvars` files committed to git

Reference: `gates/anti-fake-pass-gate.md`
