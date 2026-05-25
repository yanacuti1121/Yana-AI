---
name: wasmtime-wasi-sandbox
description: Wasmtime WASI sandbox for agent-executed code — capability-based security, component model, WASI Preview 2. Isolate untrusted code from the host filesystem/network. Sources: bytecodealliance/wasmtime (Apache-2.0).
origin: yamtam-engine — synthesized from bytecodealliance/wasmtime (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.55
---

# /wasmtime-wasi-sandbox

## When to Use

- Running untrusted or agent-generated code with capability-based isolation
- Sandboxing plugins/extensions that should not access the host filesystem or network
- Embedding a portable execution environment in a Rust or Node.js host
- Multi-tenant code execution where each tenant gets a separate WASM instance

## Do NOT use for

- Trusted internal scripts (no isolation benefit)
- GPU-intensive workloads (WASM has no GPU access)
- Long-running persistent processes (WASM instances are typically stateless per call)

---

## Capability-based security model

```
WASI is capability-based: a WASM module gets ONLY the capabilities explicitly granted.

Default: no filesystem, no network, no env vars, no clock access.
Grant per instantiation:
  preopened directories → specific filesystem paths only
  inherit_stdin/stdout  → explicit opt-in
  env vars              → only named vars passed through
  network               → not in WASI Preview 1; restricted in Preview 2

Agent use case: give untrusted code a /tmp/sandbox dir only.
Never grant access to /home, ~/.ssh, /etc, or source code dirs.
```

---

## Node.js host (wasmtime-nodejs)

```typescript
import { Wasmtime } from 'wasmtime';

async function runSandboxed(wasmBytes: Buffer, userInput: string): Promise<string> {
  const engine  = new Wasmtime.Engine();
  const module  = await Wasmtime.Module.fromBuffer(engine, wasmBytes);
  const linker  = new Wasmtime.Linker(engine);
  const wasi    = new Wasmtime.Wasi({
    args:  ["program", userInput],
    env:   {},                          // no env vars leaked
    preopenedDirs: {
      "/sandbox": "/tmp/wasm-sandbox",  // only this dir accessible
    },
    inheritStdin:  false,
    inheritStdout: true,
    inheritStderr: true,
  });

  wasi.addToLinker(linker);
  const store    = new Wasmtime.Store(engine);
  const instance = await linker.instantiate(store, module);
  const run      = instance.getFunc(store, "_start");
  run.call(store);
  return wasi.getStdout();
}
```

---

## Rust host embedding (wasmtime crate)

```rust
use wasmtime::*;
use wasmtime_wasi::{WasiCtxBuilder, WasiView};

fn run_sandboxed(wasm_bytes: &[u8], input: &str) -> anyhow::Result<String> {
    let engine = Engine::default();
    let module = Module::from_binary(&engine, wasm_bytes)?;

    // Capability grants: tmp dir only, no inherit env
    let wasi = WasiCtxBuilder::new()
        .inherit_stdout()
        .inherit_stderr()
        .preopened_dir(
            wasmtime_wasi::Dir::open_ambient_dir("/tmp/sandbox", ambient_authority())?,
            "/sandbox",
        )?
        .build();

    let mut store = Store::new(&engine, wasi);
    let mut linker: Linker<wasmtime_wasi::WasiCtx> = Linker::new(&engine);
    wasmtime_wasi::add_to_linker_sync(&mut linker, |cx| cx)?;

    let instance = linker.instantiate(&mut store, &module)?;
    let start = instance.get_typed_func::<(), ()>(&mut store, "_start")?;
    start.call(&mut store, ())?;
    Ok("done".to_string())
}
```

---

## Resource limits (CPU + memory)

```rust
// Prevent infinite loops and memory exhaustion
let mut config = Config::new();
config
    .consume_fuel(true)                    // enable fuel metering
    .max_wasm_stack(512 * 1024);           // 512 KB stack limit

let engine = Engine::new(&config)?;
let mut store = Store::new(&engine, wasi);
store.set_fuel(10_000_000)?;               // ~1B simple instructions

// Memory limit via WASM memory pages (64KB each)
// Module declares: (memory 1 16) → min 64KB, max 1MB
// Host can enforce via InstanceLimits:
let mut limits = StoreLimitsBuilder::new()
    .memory_size(16 * 64 * 1024)          // 1 MB
    .build();
store.limiter(|state| &mut limits);
```

---

## Component Model (WASI Preview 2)

```bash
# WASI Preview 2 uses the component model for typed interfaces
# Compile with wasi-sdk or cargo-component
cargo component build --release

# Define WIT interface for your sandbox protocol
# sandbox.wit:
# package sandbox:api;
# interface exec {
#   run: func(input: string) -> result<string, string>;
# }
```

---

## Anti-Fake-Pass Checklist

```
❌ Granting preopened "/" (root) directory → defeats the entire sandbox
❌ No fuel/resource limits → untrusted code can spin CPU infinitely
❌ Sharing WASM store across untrusted tenants → stores share mutable state; one per tenant
❌ No memory limit → malicious WASM allocates until host OOM
❌ Using WASM for GPU workloads → WASM has no GPU; use native or CUDA
❌ Assuming WASI Preview 1 has network isolation by default → it does, but Preview 2 sockets must also be explicitly restricted
```
