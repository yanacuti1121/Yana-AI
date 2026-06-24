---
name: reflect-metadata-injection
description: Runtime metadata reflection for TypeScript dependency injection. Decorator-based class metadata, design:type/paramtypes annotation, custom metadata keys, and DI container bootstrap. Sources: rbuckton/reflect-metadata (Apache-2.0).
origin: yana-ai — synthesized from rbuckton/reflect-metadata (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /reflect-metadata-injection

## When to Use

- Build lightweight dependency injection containers for agent service registries
- Attach metadata to classes at decoration time for runtime introspection
- Auto-wire agent dependencies without explicit factory functions
- Implement decorators that record audit trails or capability declarations

## Do NOT use for

- Simple config injection (use environment variables or [[cli-config-persistence]])
- Environments where `experimentalDecorators` is not enabled

---

## tsconfig requirements

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata":  true
  }
}
```

---

## Core metadata API

```typescript
import 'reflect-metadata'

// Set metadata on a class
Reflect.defineMetadata('role', 'executor', MyClass)

// Get metadata
const role = Reflect.getMetadata('role', MyClass)  // → 'executor'

// Check existence
Reflect.hasMetadata('role', MyClass)  // → true

// List all keys on a target
Reflect.getMetadataKeys(MyClass)  // → ['role', 'design:type', ...]

// Delete
Reflect.deleteMetadata('role', MyClass)
```

---

## Injectable decorator + DI container

```typescript
import 'reflect-metadata'

const INJECTABLE_KEY = Symbol('injectable')
const registry = new Map<Function, unknown>()

// Decorator: mark class as injectable
function Injectable(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_KEY, true, target)
  }
}

// Decorator: declare dependency token
function Inject(token: symbol): ParameterDecorator {
  return (target, _key, index) => {
    const tokens = Reflect.getMetadata('inject:tokens', target) ?? []
    tokens[index] = token
    Reflect.defineMetadata('inject:tokens', tokens, target)
  }
}

// Container: resolve constructor + inject dependencies
function resolve<T>(cls: new (...args: any[]) => T): T {
  if (!Reflect.getMetadata(INJECTABLE_KEY, cls)) {
    throw new Error(`[di] ${cls.name} is not @Injectable`)
  }

  const tokens: symbol[] = Reflect.getMetadata('inject:tokens', cls) ?? []
  const args = tokens.map(tok => registry.get(tok))
  return new cls(...args)
}

// Usage:
const DB_TOKEN = Symbol('db')
registry.set(DB_TOKEN, { query: async (sql: string) => [] })

@Injectable()
class AgentService {
  constructor(@Inject(DB_TOKEN) private db: any) {}
  async listTasks() { return this.db.query('SELECT * FROM tasks') }
}

const svc = resolve(AgentService)
```

---

## Read design:paramtypes (emitDecoratorMetadata)

```typescript
@Injectable()
class OrderService {
  constructor(
    private db:     DatabaseService,
    private logger: LoggerService,
  ) {}
}

// After @Injectable() fires, TypeScript emits:
const types = Reflect.getMetadata('design:paramtypes', OrderService)
// → [DatabaseService, LoggerService]
// Allows container to auto-resolve by constructor type
```

---

## Audit capability decorator

```typescript
function Capability(name: string): MethodDecorator {
  return (target, key) => {
    const caps: string[] = Reflect.getMetadata('capabilities', target) ?? []
    caps.push(name)
    Reflect.defineMetadata('capabilities', caps, target)
  }
}

class SandboxAgent {
  @Capability('file-read')
  readFile(path: string) { /* ... */ }

  @Capability('network-fetch')
  fetch(url: string)     { /* ... */ }
}

const caps = Reflect.getMetadata('capabilities', SandboxAgent.prototype)
// → ['file-read', 'network-fetch']
// yamtam can gate these against the agent's declared capability set
```

---

## Anti-Fake-Pass Checklist

```
❌ Missing `import 'reflect-metadata'` at entry point → Reflect.defineMetadata is undefined
❌ emitDecoratorMetadata: false → design:paramtypes always undefined, DI auto-wiring fails
❌ Metadata defined on instance vs prototype → Reflect.getMetadata(key, instance) ≠ Reflect.getMetadata(key, Class.prototype)
❌ Symbol tokens not shared between Inject() and registry → tokens don't match, injection returns undefined
❌ resolve() before registry.set() → dependency is undefined, constructor receives undefined silently
❌ Circular dependencies → resolve() hangs in infinite recursion without detection
```
