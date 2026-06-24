---
name: terminal--pulumi
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: pulumi)"
license: Apache-2.0
version: "1.0.0"
compatibility: "yana-ai >= 0.14.0"
---

# Pulumi

## Overview

Pulumi enables defining and managing cloud infrastructure using real programming languages (TypeScript, Python, Go, C#) instead of domain-specific languages. It supports 150+ cloud providers and allows using loops, conditionals, classes, and packages to build reusable, testable infrastructure components.

## Instructions

- When creating resources, declare them as objects (e.g., `new aws.s3.Bucket("my-bucket", {...})`) and use `pulumi.Output<T>` with `.apply()` for computed values from cloud API responses.
- When managing environments, use stacks (`pulumi stack init dev/staging/prod`) with stack-specific config for instance sizes, replica counts, and feature flags.
- When handling secrets, always use `pulumi config set --secret` for credentials and never hardcode secrets in code.
- When building reusable patterns, create Component Resources by extending `pulumi.ComponentResource` to encapsulate common infrastructure patterns (VPC module, ECS service, etc.).
- When referencing across projects, use Stack References to read outputs from other stacks for cross-project dependencies.
- When enforcing compliance, use CrossGuard policies to prevent non-compliant resources (e.g., no public S3 buckets, require encryption) in CI.
- When testing, write unit tests for Component Resources using standard test frameworks (Vitest, pytest, go test) by mocking the cloud provider and asserting resource properties.

## Examples

### Example 1: Deploy a serverless API on AWS

**User request:** "Set up an AWS Lambda API with DynamoDB using Pulumi and TypeScript"

**Actions:**
1. Scaffold project with `pulumi new aws-typescript`
2. Define DynamoDB table and Lambda function resources
3. Create API Gateway routes linked to Lambda handlers
4. Export endpoint URL as a stack output for consumption

**Output:** A serverless API with infrastructure defined and deployed via `pulumi up`.

### Example 2: Create a reusable VPC component

**User request:** "Build a reusable VPC module with Pulumi that teams can share"

**Actions:**
1. Create a Component Resource class extending `pulumi.ComponentResource`
2. Define VPC, subnets, route tables, and NAT gateway as child resources
3. Expose outputs for subnet IDs and security group references
4. Write unit tests mocking AWS provider to validate configuration

**Output:** A reusable infrastructure component that teams import as a package.

## Guidelines

- Use Component Resources for reusable patterns; do not repeat VPC/ECS/RDS configs across stacks.
- Always use `pulumi config set --secret` for credentials; never hardcode secrets in code.
- Name resources with the project and stack for unique identification across environments.
- Export important outputs (URLs, endpoints, ARNs) for cross-stack consumption.
- Write unit tests for Component Resources by mocking the cloud provider and asserting resource properties.
- Use stack-specific config for environment differences: instance sizes, replica counts, feature flags.
- Enable CrossGuard policies in CI to prevent non-compliant resources from being deployed.
