---
name: assemblyscript-to-wasm
description: AssemblyScript TypeScript→WebAssembly compilation. Typed arrays, memory management (heap/Arena), loader for JS host, --optimize flags. Bridge TypeScript codebases to WASM performance without learning Rust. Sources: AssemblyScript/assemblyscript (Apache-2.0).
origin: yana-ai — synthesized from AssemblyScript/assemblyscript (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.55
---

# /assemblyscript-to-wasm

## When to Use

- TypeScript team wants WASM performance without Rust (AssemblyScript is a TypeScript subset)
- Hot path optimization: tight loops, numeric algorithms, SIMD operations
- Porting existing TypeScript logic to WASM gradually (file-by-file)

## Do NOT use for

- Full DOM/browser API access (AssemblyScript has no DOM bindings)
- Complex object graphs (AssemblyScript uses manual memory; GC is experimental)
- Node.js native addons (use [[napi-rs-native-addons]])

---

## Project setup

```bash
npm init -y
npm install --save-dev assemblyscript

# Initialize AssemblyScript project
npx asinit .
# Creates: assembly/index.ts, asconfig.json, build/

# Build
npx asc assembly/index.ts \
  --target release \
  --outFile build/release.wasm \
  --textFile build/release.wat \
  --optimize                    # -O3s: optimize for size + speed
  --noAssert                    # disable bounds checks in release
```

---

## AssemblyScript type system (critical differences from TypeScript)

```typescript
// assembly/index.ts

// Explicit integer types (TypeScript's `number` becomes i32/i64/f32/f64)
export function add(a: i32, b: i32): i32 {
    return a + b;
}

// Typed arrays map to WASM linear memory
export function sumArray(arr: Int32Array): i64 {
    let total: i64 = 0;
    for (let i = 0; i < arr.length; i++) {
        total += arr[i];
    }
    return total;
}

// StaticArray (fixed size at compile time, no heap allocation)
export function dotProduct(a: StaticArray<f32>, b: StaticArray<f32>): f32 {
    let result: f32 = 0;
    for (let i = 0; i < a.length; i++) {
        result += a[i] * b[i];
    }
    return result;
}

// SIMD (v128) for bulk numeric operations
import { v128 } from 'assemblyscript/std/assembly/simd';
export function addVectors(a: v128, b: v128): v128 {
    return v128.add<f32>(a, b);
}
```

---

## Memory management

```typescript
// AssemblyScript uses a bump allocator by default.
// Objects on the managed heap need explicit lifetime.

// Manual heap allocation
export function allocBuffer(size: i32): usize {
    return heap.alloc(size);      // returns pointer into linear memory
}

export function freeBuffer(ptr: usize): void {
    heap.free(ptr);
}

// Arena pattern: allocate many, free all at once
class Arena {
    private start: usize;
    private offset: usize;
    private size:   usize;

    constructor(sizeBytes: i32) {
        this.start  = heap.alloc(sizeBytes);
        this.offset = this.start;
        this.size   = sizeBytes;
    }

    alloc(bytes: i32): usize {
        const ptr = this.offset;
        this.offset += bytes;
        return ptr;
    }

    reset(): void { this.offset = this.start; }  // free all at once
    free():  void { heap.free(this.start); }
}
```

---

## JavaScript host — loader

```typescript
import { instantiate } from "@assemblyscript/loader";
import fs from "fs";

async function loadWasm() {
    const wasmBuffer = fs.readFileSync("build/release.wasm");

    const { exports } = await instantiate<{
        add:      (a: number, b: number) => number;
        sumArray: (arrPtr: number) => bigint;
        memory:   WebAssembly.Memory;
    }>(wasmBuffer, {
        // Host imports (if any)
        env: {
            abort: (msg: number, file: number, line: number, col: number) => {
                console.error(`WASM abort at ${line}:${col}`);
            }
        }
    });

    // Simple function call
    console.log(exports.add(1, 2));   // 3

    // Passing an array: write into WASM memory, pass pointer
    const arr = new Int32Array(exports.memory.buffer, 0, 4);
    arr.set([1, 2, 3, 4]);
    // Note: loader helpers manage memory pinning for managed types
}
```

---

## Optimization flags

```bash
# Size-optimized release (default for prod)
npx asc assembly/index.ts -O3s --outFile build/optimized.wasm

# Speed-optimized (larger binary)
npx asc assembly/index.ts -O3 --outFile build/fast.wasm

# Check generated WAT for correctness
npx asc assembly/index.ts --textFile build/debug.wat --debug

# Benchmark flags
--noAssert      # disable index bounds checks (unsafe but faster)
--uncheckedBehavior always  # skip all runtime checks
```

---

## Anti-Fake-Pass Checklist

```
❌ Using TypeScript generics/unions → AssemblyScript only supports a strict subset of TypeScript
❌ Using `any` type → not supported; everything must be explicitly typed
❌ Not freeing heap.alloc'd memory → WASM heap grows unbounded (no GC unless GC mode enabled)
❌ Passing JS objects directly → WASM only sees i32/i64/f32/f64; objects must be serialized to linear memory
❌ Using --debug in production → 3-5x larger binary and slower
❌ Forgetting that AssemblyScript integers don't coerce like JS → i32 overflow wraps silently
```
