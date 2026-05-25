---
name: wasmer-wasm-runtime
description: Wasmer universal WASM runtime — Singlepass/Cranelift/LLVM backend selection, WASI support, embedded runtimes in Rust/Go/JS/Python/C. Run WASM modules from any host language. Sources: wasmerio/wasmer (MIT).
origin: yamtam-engine — synthesized from wasmerio/wasmer (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.55
---

# /wasmer-wasm-runtime

## When to Use

- Embedding a WASM runtime in a Rust, Go, Python, or C host (not just Node.js)
- Need to choose compiler backend based on JIT time vs execution speed trade-off
- Running WASI modules with fine-grained capability grants
- Cross-platform WASM execution (Wasmer runs on Linux/macOS/Windows/embedded)

## Do NOT use for

- Browser WASM (use native browser WebAssembly API or [[wasm-bindgen-js-interop]])
- Plugin systems with multi-language PDK (use [[extism-wasm-plugins]])

---

## Backend selection guide

```
Backend       Compile time  Runtime speed   When to use
────────────  ────────────  ──────────────  ──────────────────────────────
Singlepass    ~instant      moderate        Short-lived calls, high startup freq
Cranelift     fast (~10ms)  good            General purpose — default choice
LLVM          slow (~100ms) best            Long-running compute, compile once
```

---

## Rust embedding

```rust
// Cargo.toml: wasmer = { version = "4", features = ["cranelift"] }
use wasmer::{Store, Module, Instance, imports, Function, TypedFunction};
use wasmer_wasix::{WasiEnv, WasiFunctionEnv};

fn run_wasm(wasm_bytes: &[u8], input: &str) -> anyhow::Result<String> {
    let mut store = Store::default();  // uses Cranelift by default
    let module    = Module::from_binary(&store, wasm_bytes)?;

    // WASI environment with capability grants
    let wasi_env = WasiEnv::builder("my-program")
        .args(&[input])
        .env("LOG_LEVEL", "info")
        .preopen_dir("/tmp/sandbox", "/sandbox")?
        .finalize(&mut store)?;

    let import_object = wasi_env.import_object(&mut store, &module)?;
    let instance = Instance::new(&mut store, &module, &import_object)?;
    wasi_env.initialize(&mut store, instance.clone())?;

    // Call the entry point
    let start: TypedFunction<(), ()> = instance.exports.get_typed_function(&store, "_start")?;
    start.call(&mut store)?;

    Ok(wasi_env.stdout(&mut store)?.read_to_string()?)
}
```

---

## Go embedding

```go
import (
    wasmer "github.com/wasmerio/wasmer-go/wasmer"
)

func runWasm(wasmBytes []byte, input string) (string, error) {
    engine := wasmer.NewEngine()
    store  := wasmer.NewStore(engine)
    module, err := wasmer.NewModule(store, wasmBytes)
    if err != nil { return "", err }

    wasiEnv, err := wasmer.NewWasiStateBuilder("program").
        Argument(input).
        Environment("KEY", "VALUE").
        MapDirectory("/sandbox", "/tmp/wasm-sandbox").
        Finalize()
    if err != nil { return "", err }

    importObject, _ := wasiEnv.GenerateImportObject(store, module)
    instance, err   := wasmer.NewInstance(module, importObject)
    if err != nil { return "", err }

    start, _ := instance.Exports.GetWasiStartFunction()
    start()

    stdout := wasiEnv.ReadStdout()
    return string(stdout), nil
}
```

---

## Python embedding

```python
from wasmer import Store, Module, Instance, ImportObject
from wasmer_compiler_cranelift import Compiler

store  = Store(Compiler)
module = Module(store, open("plugin.wasm", "rb").read())

# Call exported function directly
instance     = Instance(module)
add          = instance.exports.add
result       = add(1, 2)
print(result)  # 3

# With WASI
from wasmer_wasix import WasiEnv
wasi_env     = WasiEnv.builder("prog").argument("hello").finalize(store)
import_object = wasi_env.generate_import_object(store, module)
instance = Instance(module, import_object)
wasi_env.initialize(instance)
instance.exports._start()
```

---

## CLI — run WASM from terminal

```bash
# Install
curl https://get.wasmer.io -sSfL | sh

# Run a WASI binary
wasmer run cowsay.wasm -- "Hello from WASM"

# Run with capability grants
wasmer run --dir /tmp/sandbox:/sandbox my-program.wasm

# Run with specific backend
wasmer run --cranelift my-program.wasm
wasmer run --singlepass my-program.wasm   # fastest startup

# Install from Wasmer registry
wasmer install python/python
wasmer run python/python -- -c "print('hello')"
```

---

## Anti-Fake-Pass Checklist

```
❌ Using LLVM backend for short-lived calls → 100ms compile time per module defeats the purpose; use Singlepass
❌ No preopened dirs for file access → module silently gets no filesystem; fails without clear error
❌ Sharing Store across threads → Store is not Send/Sync; create one per thread
❌ Not pinning module in memory — Module is expensive to compile; cache it and reuse across instances
❌ Assuming Wasmer and Wasmtime are interchangeable APIs → different Rust APIs despite similar WASM execution
❌ Missing wasmer-wasix feature for WASI → standard WASM imports only; WASI syscalls will trap
```
