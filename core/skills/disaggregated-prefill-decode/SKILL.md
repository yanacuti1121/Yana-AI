---
name: disaggregated-prefill-decode
description: Disaggregated prefill/decode — separate GPU pools for compute-bound prefill and memory-bound decode. KV cache transfer via NIXL (RDMA/TCP). NVIDIA Dynamo (stack-above) vs llm-d (K8s-native). 6x DeepSeek-R1 on GB200+Dynamo. 30–40% cost savings on $2M+ inference budgets. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /disaggregated-prefill-decode

## When to Use

- Inference spend >$500K/year on colocated serving — disaggregation can save 30–40%
- Mixed workloads with both long-prompt (prefill-heavy) and long-output (decode-heavy) requests
- MoE models (DeepSeek-R1, Mixtral) where colocation wastes H100 compute on memory-bound decode
- Already on Kubernetes and want CNCF-native orchestration (llm-d)

## Do NOT use for

- Short prompts + short outputs (<512 tokens each) — NIXL transfer tax exceeds savings
- Small-scale serving (<10 GPUs) — orchestration overhead not justified
- Development / testing environments — complexity far outweighs benefit

---

## Why the bottlenecks differ

```
Prefill  — full forward pass over input prompt → matrix multiplications dominate
           → COMPUTE-BOUND — H100 FP8 ~2,000 TFLOPS
           → batch many tokens in one forward → high GPU utilization

Decode   — one token per step, reading full weights each time
           → MEMORY-BANDWIDTH-BOUND — HBM3 ~3 TB/s
           → only amortizes at high concurrency

Colocation problem:
  You buy H100 compute for decode (memory bound → compute wasted)
  You buy H100 HBM for prefill (compute bound → memory wasted)
  20–40% GPU time wasted on the wrong resource at typical workloads.
```

---

## Architecture diagram

```
            ┌──────────────┐
  Request → │    Router    │ ─────────────────────────┐
            └──────┬───────┘                          │
                   │ (prompt only)                    │
                   ▼                                  │
            ┌──────────────┐   KV cache via NIXL   ┌──▼───────────┐
            │ Prefill pool │ ──────────────────────► │ Decode pool  │
            │ (compute)    │                         │ (memory)     │
            └──────────────┘                         └──────┬───────┘
                                                            │ tokens
                                                            ▼
                                                         Client

NIXL: NVIDIA inter-node transport
  - Uses RDMA/InfiniBand when available
  - TCP fallback otherwise
  - Typical KV transfer latency: 20–80 ms for 4K-token prompt on 70B FP8
  → Short prompts (<512 tokens): transfer tax > compute savings → don't disaggregate
```

---

## NVIDIA Dynamo (GTC 2025 GA)

```bash
# Dynamo sits ABOVE vLLM / SGLang / TRT-LLM as an orchestrator
# Rust core, Python extensibility

# Install
pip install nvidia-dynamo

# Launch with disaggregated P/D
dynamo serve \
  --model deepseek-ai/DeepSeek-R1 \
  --prefill-replicas 2 \
  --decode-replicas 4 \
  --kv-transfer nixl \
  --sla-planner auto

# Dynamo Planner Profiler auto-measures workload and sets P:D ratio
# Published results (developer.nvidia.com, 2025-06):
#   DeepSeek-R1 MoE on GB200 NVL72 + Dynamo: ~6x throughput in medium-latency regime
#   GB300 NVL72 + Dynamo: up to 50x MoE throughput vs Hopper (product page, undated)
```

---

## llm-d (Red Hat + AWS, Kubernetes-native)

```yaml
# llm-d separates prefill / decode / router as independent K8s Services
# Per-role HPA based on correct signals for each role

# Prefill Deployment — scale on queue depth
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prefill-server
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: prefill
          image: llmd/vllm-prefill:latest
          env:
            - name: ROLE
              value: prefill
            - name: NIXL_ENDPOINT
              value: decode-service:8001

---
# Decode Deployment — scale on KV utilization
apiVersion: apps/v1
kind: Deployment
metadata:
  name: decode-server
spec:
  replicas: 4
  template:
    spec:
      containers:
        - name: decode
          image: llmd/vllm-decode:latest
          env:
            - name: ROLE
              value: decode

---
# HPA for prefill (queue depth signal)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: prefill-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: prefill-server
  minReplicas: 1
  maxReplicas: 8
  metrics:
    - type: External
      external:
        metric:
          name: llmd_prefill_queue_depth
        target:
          type: AverageValue
          averageValue: "10"
```

---

## When NOT to disaggregate

```python
def should_disaggregate(
    avg_prompt_tokens: int,
    avg_output_tokens: int,
    monthly_gpu_spend: float,
) -> tuple[bool, str]:
    if avg_prompt_tokens < 512 and avg_output_tokens < 512:
        return False, "Short prompts + short outputs: NIXL transfer tax exceeds savings"
    if monthly_gpu_spend < 40_000:
        return False, "Orchestration complexity not justified under ~$40K/month"
    return True, f"Expected savings: 30–40% on ${monthly_gpu_spend:,.0f}/month"
```

---

## Dynamo vs llm-d: choose based on context

```
Dynamo  → already using NVIDIA stack (TRT-LLM, vLLM)
           want managed P:D ratio tuning (SLA Planner auto-configures)
           comfortable with NVIDIA licensing + support

llm-d   → committed to Kubernetes / CNCF ecosystem
           need GitOps-friendly declarative config (YAML deployments)
           want scale-to-zero + LoRA routing + hierarchical KV offloading (v0.5)
           Red Hat/AWS support preferred
```

---

## Anti-Fake-Pass Checklist

```
❌ Short prompts (<512 tokens): NIXL transfer latency dominates → no throughput gain
❌ Prefill:decode ratio not tuned to workload → wrong pool sizes → one is idle, one is bottlenecked
❌ RDMA not available → TCP fallback → higher latency → reduces the savings window
❌ Same GPU type for both pools → defeats the purpose; prefill wants compute, decode wants memory bandwidth
❌ No KV cache compression before NIXL transfer → 70B 4K-prompt KV cache can be 4–8 GB per request
❌ Citing "30x" as a guaranteed number — it's a community aggregate on specific Blackwell+Dynamo+R1 stacks
```
