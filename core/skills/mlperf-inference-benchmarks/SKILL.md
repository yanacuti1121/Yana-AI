---
name: mlperf-inference-benchmarks
description: MLPerf inference benchmarking patterns. Loadgen scenarios (SingleStream/MultiStream/Server/Offline), SUT/QSL interfaces, latency p99 targets, and performance metric interpretation. Sources: mlcommons/inference (Apache-2.0).
origin: yamtam-engine — synthesized from mlcommons/inference (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.51
---

# /mlperf-inference-benchmarks

## When to Use

- Measure inference system performance with industry-standard reproducible metrics
- Compare GPU/CPU hardware choices for a given model/task
- Validate SLA targets: p99 latency < 100ms at 1000 QPS
- Pre-deployment stress test: flood the system to find breaking point

## Do NOT use for

- Training benchmarks (use MLPerf Training)
- Quick sanity checks (use [[llm-eval-framework]])

---

## MLPerf scenarios

```
SingleStream: one query at a time, measure latency distribution
  Target: p90 latency (e.g., < 10ms for image classification)
  Use: edge devices, latency-sensitive APIs

MultiStream: N queries in parallel, measure all-complete latency
  Target: p99 latency across all N queries
  Use: camera pipelines, fixed batch size hardware

Server: Poisson-distributed query arrival, measure sustained throughput
  Target: max QPS while keeping p99 < SLA threshold
  Use: production cloud inference

Offline: all queries available upfront, measure total throughput
  Target: max queries per second (no latency constraint)
  Use: batch processing, overnight jobs
```

---

## Custom Loadgen harness (Python)

```python
import mlperf_loadgen as lg

class YamtamSUT:
  """System Under Test — wraps your inference engine"""

  def issue_queries(self, query_samples):
    for qs in query_samples:
      # Run inference
      result = run_inference(qs.index)
      # Report response
      response = lg.QuerySampleResponse(
        id     = qs.id,
        data   = result.ctypes.data,
        size   = result.nbytes,
      )
      lg.QuerySamplesComplete([response])

  def flush_queries(self): pass


class YamtamQSL:
  """Query Sample Library — dataset loader"""

  def __init__(self, dataset, total_count, perf_count):
    self.qsl = lg.ConstructQSL(
      total_count, perf_count,
      self.load_query_samples, self.unload_query_samples
    )
    self.dataset = dataset

  def load_query_samples(self, sample_list):
    for s in sample_list: self.dataset.load(s)

  def unload_query_samples(self, sample_list):
    for s in sample_list: self.dataset.unload(s)


# Run benchmark
settings = lg.TestSettings()
settings.scenario    = lg.TestScenario.Server
settings.mode        = lg.TestMode.PerformanceOnly
settings.server_target_qps = 500

sut = YamtamSUT()
qsl = YamtamQSL(dataset, total_count=5000, perf_count=1024)

lg.StartTest(sut, qsl.qsl, settings)
lg.DestroyQSL(qsl.qsl)
```

---

## Key metrics to track

```bash
# After loadgen run, parse mlperf_log_summary.txt
grep -E "(Samples per second|Min latency|Max latency|Mean latency|p99.00 latency)" \
  mlperf_log_summary.txt

# Target thresholds for yamtam tool calls:
# Mean latency:   < 200ms  (acceptable for interactive agent)
# p99 latency:    < 500ms  (hard SLA)
# Throughput:     > 50 QPS (for 50 concurrent agents)
```

---

## Quick server scenario stress test (without full MLPerf)

```bash
# Use wrk2 for HTTP inference endpoint load testing
wrk2 -t 4 -c 100 -d 60s -R 500 \
  --script post.lua \
  http://inference-server:8000/infer

# post.lua
wrk.method  = "POST"
wrk.headers = {["Content-Type"] = "application/json"}
wrk.body    = '{"input": "benchmark query"}'
```

---

## Anti-Fake-Pass Checklist

```
❌ Using accuracy mode results for performance reporting → different sample count, not valid perf number
❌ Warmup not included → first queries hit cold cache; p99 inflated
❌ p50 latency meets SLA but p99 does not → tail latency the real constraint; always report p99
❌ QPS measured on a single sample → not representative; use Server scenario with realistic load
❌ Not isolating benchmark host → background processes inflate latency; dedicate hardware
❌ Comparing results across different MLPerf versions → LoadGen version affects timing methodology
```
