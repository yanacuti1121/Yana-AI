---
name: container-interactivity
description: Real-time data streaming to/from isolated containers for AI agent sandboxing. Docker ephemeral exec patterns, stdin/stdout pipe attachment, nsjail namespace jail setup, streaming output with live tail, container health monitoring, and clean teardown. Sources: moby/moby, google/nsjail, containers/podman, kata-containers/kata-containers, firecracker-microvm/firecracker.
origin: yamtam-engine — synthesized from moby/moby, google/nsjail, containers/podman, kata-containers/kata-containers, firecracker-microvm/firecracker
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.47
---

# /container-interactivity

## When to Use

- Agent tool call must run in complete filesystem/network isolation
- Streaming large output from a sandboxed process (no buffering in memory)
- Attaching to a running container stdin to feed input interactively
- Post-exec cleanup: confirm container is fully destroyed, no state leaks

## Do NOT use for

- Purely in-process operations (no exec boundary — no container needed)
- Dev-only scripts where ulimit fallback is acceptable

---

## Decision: Docker vs nsjail vs ulimit

```
Host has Docker daemon + image already built?
  YES → Docker (strongest isolation, read-only FS, --network=none)
  NO  →
    Linux host with root/CAP_SYS_ADMIN?
      YES → nsjail (Linux namespaces, ~1ms overhead, no daemon)
      NO  → ulimit fallback (resource limits only, no FS isolation)

Hardware-level isolation required (multi-tenant cloud)?
  YES → Firecracker micro-VM via sandbox-exec.sh
```

---

## Docker: Ephemeral Isolated Execution

```bash
# One-shot: run command and auto-remove container (no state persists)
docker run --rm \
  --name    "yamtam-$(uuidgen | head -c 8)" \
  --network none \                          # no NIC — zero network
  --read-only \                             # root FS immutable
  --tmpfs   /workspace:rw,size=64m,noexec \ # memory-only workspace
  --tmpfs   /tmp:rw,size=32m,noexec \
  --memory  128m \
  --memory-swap 128m \                      # disable swap
  --cpus    0.5 \
  --pids-limit 64 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user    nobody \
  yamtam-sandbox:latest \
  bash -c "$TOOL_COMMAND"
```

```typescript
import { execa } from 'execa'

// Stream container stdout/stderr in real-time — no buffering
async function runInContainer(command: string, args: string[]): Promise<string> {
  const containerName = `yamtam-${Date.now()}`
  const output: string[] = []

  const proc = execa('docker', [
    'run', '--rm',
    '--name',     containerName,
    '--network',  'none',
    '--read-only',
    '--tmpfs',    '/workspace:rw,size=64m,noexec',
    '--memory',   '128m',
    '--cpus',     '0.5',
    '--pids-limit', '64',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user',     'nobody',
    'yamtam-sandbox:latest',
    command, ...args,
  ])

  // Stream each line as it arrives — don't wait for process to finish
  proc.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString()
    output.push(line)
    process.stdout.write(`[sandbox] ${line}`)  // live tail
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[sandbox:err] ${chunk}`)
  })

  const { exitCode } = await proc

  if (exitCode === 124) throw new Error('sandbox timeout exceeded')
  if (exitCode !== 0)  throw Object.assign(new Error('sandbox command failed'), { exitCode })

  return output.join('')
}

// Rule: always --rm (container removed on exit — no state leak)
// Rule: --network none is mandatory — not optional even in dev
// Rule: stream stdout in real-time for large output (don't buffer 1GB in memory)
```

---

## Attach stdin to Running Container

```typescript
// Feed input into a long-running sandboxed process (e.g., interactive REPL)
import { spawn } from 'child_process'

function attachContainerStdin(containerId: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['exec', '-i', containerId, 'sh'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []
    proc.stdout.on('data', (d: Buffer) => output.push(d.toString()))
    proc.stderr.on('data', (d: Buffer) => output.push(d.toString()))

    proc.stdin.write(input + '\n')
    proc.stdin.end()  // close stdin → process sees EOF

    proc.on('close', (code) => {
      if (code === 0) resolve(output.join(''))
      else reject(new Error(`container exec failed with code ${code}`))
    })
  })
}

// Rule: always close stdin after writing (proc.stdin.end()) — or process hangs
// Rule: use -i not -it for non-TTY piping (tty allocation fails in CI/agent context)
```

---

## nsjail: Namespace Jail (no Docker daemon)

```bash
# nsjail one-shot execution in isolated Linux namespaces
# Requires: nsjail binary + CAP_SYS_ADMIN (or user namespaces enabled)
nsjail \
  --mode o \                       # one-shot: execute once and exit
  --time_limit 30 \                # wall-clock timeout (seconds)
  --rlimit_as 131072 \             # virtual address space: 128MB (KB)
  --rlimit_cpu 30 \                # CPU time limit
  --rlimit_fsize 65536 \           # max file size (KB)
  --rlimit_nofile 32 \
  --disable_proc \                 # no /proc (blocks /proc/self/mem)
  --iface_no_lo \                  # no loopback interface
  --user nobody \
  --group nobody \
  --chroot / \
  --bindmount_ro /usr \
  --bindmount_ro /bin \
  --bindmount_ro /lib \
  --tmpfsmount /tmp \
  --cwd /tmp \
  -- bash -c "$TOOL_COMMAND"

# Rule: --disable_proc prevents reading /proc/self/mem (process injection attack)
# Rule: --iface_no_lo = no loopback = no localhost network
# Rule: --tmpfsmount /tmp = writable tmp is memory-only (wiped on exit)
```

---

## Container Health & Teardown

```typescript
// Ensure container is completely gone after execution
async function ensureContainerGone(name: string): Promise<void> {
  try {
    // Force kill if somehow still running
    await execa('docker', ['kill', name]).catch(() => {})
    await execa('docker', ['rm', '-f', name]).catch(() => {})

    // Verify gone
    const { stdout } = await execa('docker', ['ps', '-a', '--filter', `name=${name}`, '--format', '{{.ID}}'])
    if (stdout.trim()) {
      throw new Error(`container ${name} still exists after teardown`)
    }
  } catch (e) {
    // Log but don't throw — best-effort cleanup
    console.error(`[sandbox] teardown warning: ${(e as Error).message}`)
  }
}

// Audit: verify no dangling volumes from sandbox containers
async function auditDanglingVolumes(): Promise<string[]> {
  const { stdout } = await execa('docker', ['volume', 'ls', '--filter', 'dangling=true', '--format', '{{.Name}}'])
  return stdout.trim().split('\n').filter(Boolean)
}

// Rule: always call ensureContainerGone() in finally block (teardown on error too)
// Rule: dangling volumes from sandbox containers = data leak audit finding
```

---

## Output Size Cap in Streaming Context

```typescript
// Cap container output to 16KB (matches middleware size-cap) even when streaming
class SandboxOutputStream extends Transform {
  #bytes = 0
  readonly #cap = 16 * 1024

  _transform(chunk: Buffer, _enc: string, cb: (err: Error | null, data?: Buffer) => void) {
    this.#bytes += chunk.length
    if (this.#bytes > this.#cap) {
      this.push(Buffer.from('\n[SANDBOX OUTPUT TRUNCATED — 16KB cap]\n'))
      this.end()
      cb(null)
      return
    }
    cb(null, chunk)
  }
}

// Pipe container stdout through cap transform
proc.stdout?.pipe(new SandboxOutputStream()).pipe(process.stdout)

// Rule: cap must be applied BEFORE output reaches agent — never after
// Rule: write truncation marker so agent knows output is incomplete
```

---

## Anti-Fake-Pass Checklist

```
❌ Container runs as root (--user missing or --user root)
❌ --network flag omitted (agent can make outbound calls)
❌ --rm missing (containers accumulate, disk fills, state leaks)
❌ stdin left open after write (process hangs waiting for EOF)
❌ -it flag used in non-TTY context (CI/agent pipelines fail with "not a TTY")
❌ Output buffered in memory before returning (OOM on large tool results)
❌ nsjail used without --disable_proc (process memory injection possible)
❌ Container teardown only in happy path (must be in finally block)
❌ Dangling volumes not audited (sensitive data persists on host)
```
