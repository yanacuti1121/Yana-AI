---
name: wasm-bindgen-js-interop
description: wasm-bindgen Rust↔JavaScript interop — export Rust functions/structs to JS, import JS APIs into Rust, wasm-pack build pipeline, TypeScript type generation, memory management across the boundary. Sources: rustwasm/wasm-bindgen (MIT/Apache-2.0).
origin: yamtam-engine — synthesized from rustwasm/wasm-bindgen (MIT/Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.55
---

# /wasm-bindgen-js-interop

## When to Use

- Porting compute-intensive Rust to the browser (crypto, image processing, parsers)
- Exposing Rust structs with methods as JavaScript classes
- Calling browser APIs (DOM, fetch, console) from within Rust/WASM
- Generating TypeScript types for Rust WASM exports

## Do NOT use for

- Server-side Node.js native addons (use [[napi-rs-native-addons]])
- Sandboxed untrusted code execution (use [[wasmtime-wasi-sandbox]])
- Pure JavaScript performance optimization

---

## Export Rust → JavaScript

```rust
// Cargo.toml
// [dependencies]
// wasm-bindgen = "0.2"
// wasm-pack = build tool

use wasm_bindgen::prelude::*;

// Export a function
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// Export a struct with methods → becomes a JS class
#[wasm_bindgen]
pub struct Parser {
    data: Vec<u8>,
}

#[wasm_bindgen]
impl Parser {
    #[wasm_bindgen(constructor)]
    pub fn new(input: &[u8]) -> Parser {
        Parser { data: input.to_vec() }
    }

    pub fn parse(&self) -> JsValue {
        // Return complex data as JSON
        let result = serde_json::json!({ "length": self.data.len() });
        serde_wasm_bindgen::to_value(&result).unwrap()
    }

    pub fn free_memory(self) {
        // wasm_bindgen handles drop automatically; explicit free for manual control
        drop(self);
    }
}
```

---

## Import JavaScript → Rust

```rust
use wasm_bindgen::prelude::*;

// Import browser APIs
#[wasm_bindgen]
extern "C" {
    // window.performance.now()
    #[wasm_bindgen(js_namespace = performance)]
    fn now() -> f64;

    // console.log
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    // fetch API
    #[wasm_bindgen(js_namespace = window)]
    fn fetch(url: &str) -> js_sys::Promise;
}

#[wasm_bindgen]
pub fn benchmark(n: u32) -> f64 {
    let start = now();
    for _ in 0..n { /* work */ }
    now() - start
}
```

---

## wasm-pack build pipeline

```bash
# Install
cargo install wasm-pack

# Build for bundler (webpack/vite) — generates .wasm + .js + .d.ts
wasm-pack build --target bundler --out-dir pkg

# Build for Node.js
wasm-pack build --target nodejs --out-dir pkg

# Build for plain <script> tag
wasm-pack build --target web --out-dir pkg

# pkg/ contains:
#   my_lib.wasm       — compiled WASM binary
#   my_lib.js         — JS glue code
#   my_lib.d.ts       — TypeScript type definitions (auto-generated!)
#   package.json      — ready to npm publish
```

---

## JavaScript/TypeScript consumption

```typescript
// Bundler target (Webpack / Vite)
import init, { Parser, greet } from './pkg/my_lib.js';

async function main() {
  // Must init (loads .wasm binary) before calling exports
  await init();

  console.log(greet("World"));   // "Hello, World!"

  // Structs become JS classes with automatic memory management
  const parser = new Parser(new Uint8Array([1, 2, 3]));
  const result = parser.parse();
  // IMPORTANT: call free() to release WASM heap memory
  // Otherwise → memory leak (GC doesn't know about WASM heap)
  parser.free();
}
```

---

## Memory management across the boundary

```typescript
// wasm-bindgen structs are NOT GC'd by JavaScript.
// Each #[wasm_bindgen] struct has a .free() method.
// Failing to call it → memory leak in WASM heap.

// Pattern: use try/finally
const parser = new Parser(data);
try {
  return parser.parse();
} finally {
  parser.free();  // always release
}

// For large Uint8Array / Vec<u8> transfers:
// wasm-bindgen copies by default (safe but slow for large buffers)
// Use #[wasm_bindgen] with js_sys::Uint8Array for zero-copy when possible:
```

```rust
#[wasm_bindgen]
pub fn process_buffer(buf: &js_sys::Uint8Array) -> js_sys::Uint8Array {
    let data = buf.to_vec();  // copy into Rust heap
    // ... process ...
    js_sys::Uint8Array::from(data.as_slice())
}
```

---

## Async Rust → JS Promise

```rust
use wasm_bindgen_futures::future_to_promise;

#[wasm_bindgen]
pub fn fetch_and_parse(url: String) -> js_sys::Promise {
    future_to_promise(async move {
        let window = web_sys::window().unwrap();
        let resp = wasm_bindgen_futures::JsFuture::from(window.fetch_with_str(&url)).await?;
        let resp: web_sys::Response = resp.dyn_into()?;
        let json = wasm_bindgen_futures::JsFuture::from(resp.json()?).await?;
        Ok(json)
    })
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Not calling .free() on WASM structs → WASM heap leaks; JS GC cannot collect WASM memory
❌ Not calling init() before using exports → "module not instantiated" runtime error
❌ Passing large Vec<u8> by value → copies entire buffer; use js_sys::Uint8Array reference
❌ Using bundler target for plain HTML → bundler target requires a module bundler; use web target
❌ Importing DOM APIs without web-sys feature flags → must enable specific web-sys features in Cargo.toml
❌ Running wasm-bindgen output in Node.js with bundler target → use nodejs target for Node.js
```
