---
name: extism-wasm-plugins
description: Extism plugin system — multi-language WASM plugins (Rust/Go/JS/Python/C) with PDK, host functions, shared memory protocol. Build extensible agent tools where each plugin is an isolated WASM module. Sources: extism/extism (BSD-3-Clause).
origin: yamtam-engine — synthesized from extism/extism (BSD-3-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.55
---

# /extism-wasm-plugins

## When to Use

- Building a plugin system where third-party code extends your agent
- Each plugin must be isolated (WASM sandbox) but able to call host functions
- Multi-language plugins: Rust, Go, JavaScript, Python, C all compile to the same interface
- Agent tool registry backed by hot-loadable WASM plugins

## Do NOT use for

- Single-language native addons (use [[napi-rs-native-addons]])
- Sandboxing untrusted code with filesystem access (use [[wasmtime-wasi-sandbox]])
- Browser-side WASM (use [[wasm-bindgen-js-interop]])

---

## Architecture

```
Host (Node.js / Rust / Go / Python)
  ├─ Plugin manager
  │   ├─ plugin-a.wasm  (Rust PDK)
  │   ├─ plugin-b.wasm  (Go PDK)
  │   └─ plugin-c.wasm  (JS PDK)
  └─ Host functions exposed to all plugins
      ├─ kv_get / kv_set      — shared KV store
      ├─ http_request          — proxied HTTP (host controls allowed URLs)
      └─ log                   — host-side logging

Shared memory protocol:
  Host writes input  → plugin_input_length / plugin_input_load
  Plugin reads input → plugin_get_input
  Plugin writes output → plugin_set_output
  Host reads output  → plugin_output_length / plugin_output_load
```

---

## Node.js host (calling plugins)

```typescript
import { Plugin, ExtismContext } from '@extism/extism';

const ctx = new ExtismContext();

// Load a plugin (WASM bytes or file path)
const plugin = await ctx.plugin('./plugins/summarizer.wasm', {
  // Host functions the plugin can call
  functions: {
    'extism:host/user': {
      kv_read: (plugin, offset) => {
        const key = plugin.readString(offset);
        const val = kvStore.get(key) ?? '';
        return plugin.writeString(val);
      },
      kv_write: (plugin, keyOffset, valOffset) => {
        const key = plugin.readString(keyOffset);
        const val = plugin.readString(valOffset);
        kvStore.set(key, val);
      },
    }
  },
  // Resource limits
  memory: { max: 5 },  // 5 × 64KB = 320KB
});

// Call an exported function
const input  = JSON.stringify({ text: "Long article..." });
const output = await plugin.call('summarize', input);
console.log(output.string());  // "Summary: ..."

plugin.free();
ctx.free();
```

---

## Rust plugin (PDK)

```rust
// Cargo.toml: extism-pdk = "1"
use extism_pdk::*;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Input { text: String }

#[derive(Serialize)]
struct Output { summary: String, word_count: usize }

#[plugin_fn]
pub fn summarize(input: Json<Input>) -> FnResult<Json<Output>> {
    let words: Vec<&str> = input.text.split_whitespace().collect();
    let summary = words.iter().take(20).cloned().collect::<Vec<_>>().join(" ");
    Ok(Json(Output {
        summary: format!("{}...", summary),
        word_count: words.len(),
    }))
}

// Call a host function from the plugin
#[host_fn]
extern "ExtismHost" {
    fn kv_read(key: &str) -> String;
    fn kv_write(key: &str, value: &str);
}

#[plugin_fn]
pub fn cached_summarize(input: Json<Input>) -> FnResult<Json<Output>> {
    let cache_key = format!("summary:{}", &input.text[..20]);
    unsafe {
        if let Ok(cached) = kv_read(&cache_key) {
            if !cached.is_empty() {
                return Ok(Json(Output { summary: cached, word_count: 0 }));
            }
        }
    }
    // ... compute and cache ...
    Ok(Json(Output { summary: "...".to_string(), word_count: 0 }))
}
```

---

## Go plugin (PDK)

```go
package main

import (
    "encoding/json"
    extism "github.com/extism/go-pdk"
)

//export summarize
func summarize() int32 {
    input := extism.InputString()
    var data map[string]string
    json.Unmarshal([]byte(input), &data)

    result := map[string]string{
        "summary": data["text"][:min(len(data["text"]), 100)] + "...",
    }
    out, _ := json.Marshal(result)
    extism.OutputBytes(out)
    return 0
}

func main() {}
```

---

## Plugin registry (hot-reload)

```typescript
class PluginRegistry {
  private ctx = new ExtismContext();
  private plugins = new Map<string, Plugin>();

  async load(name: string, wasmPath: string): Promise<void> {
    if (this.plugins.has(name)) this.plugins.get(name)!.free();
    const plugin = await this.ctx.plugin(wasmPath, { wasi: true });
    this.plugins.set(name, plugin);
  }

  async call(name: string, fn: string, input: string): Promise<string> {
    const plugin = this.plugins.get(name);
    if (!plugin) throw new Error(`Plugin '${name}' not loaded`);
    const output = await plugin.call(fn, input);
    return output.string();
  }

  unload(name: string): void {
    this.plugins.get(name)?.free();
    this.plugins.delete(name);
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Not calling plugin.free() → WASM heap and host context leak
❌ Exposing unrestricted http_request host function → plugins can reach internal APIs
❌ No memory limit → malicious plugin allocates until host OOM
❌ Sharing Plugin instance across concurrent calls → Extism plugins are not thread-safe; one per goroutine/thread
❌ Passing secrets via env vars → plugins can read env if WASI is enabled; pass only via host functions
❌ Hot-reload without freeing old plugin → old WASM instance stays in memory
```
