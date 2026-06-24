---
name: capability-dropping-linux
description: Linux capability management for agent processes. Drop unnecessary capabilities before exec, audit current capability sets, block CAP_SYS_ADMIN/CAP_NET_ADMIN/CAP_SETUID, and implement least-privilege subprocess execution. Sources: genuinetools/bane (renamed from bansh), libcap.
origin: yana-ai — synthesized from genuinetools/bane, libcap (kernel.org), Linux capabilities(7) man page
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /capability-dropping-linux

## When to Use

- Hardening agent subprocess before handing control to untrusted code
- Ensuring sandbox escape via CAP_SYS_CHROOT / CAP_SYS_PTRACE is impossible
- Auditing what capabilities a running container or process holds
- Building AppArmor / seccomp complement at the capability layer

## Do NOT use for

- Replacing seccomp syscall filtering — capabilities and seccomp are complementary
- User-space permission checks (use OS-level capabilities only)

---

## High-risk capabilities to always drop for agents

```
CAP_SYS_ADMIN    — mount, ioctl, set hostname, manage namespaces (too broad)
CAP_SYS_PTRACE   — read/write any process memory, attach debugger
CAP_SYS_CHROOT   — chroot to arbitrary path → escape existing jail
CAP_SYS_MODULE   — load kernel modules
CAP_NET_ADMIN    — configure network interfaces, iptables
CAP_NET_RAW      — raw packet crafting, ICMP spoofing
CAP_SETUID       — setuid(0) → become root
CAP_SETGID       — setgid(0) → become root group
CAP_DAC_OVERRIDE — bypass file permission checks
CAP_FOWNER       — bypass ownership checks
CAP_KILL         — send signals to any process
CAP_SYS_RAWIO    — direct hardware I/O
CAP_SYS_BOOT     — reboot/kexec
```

---

## Drop capabilities before exec (bash + capsh)

```bash
drop_caps_exec() {
  # Keep only: cap_net_bind_service (port < 1024 if needed), cap_setpcap for self-drop
  # Drop everything else

  capsh \
    --drop=cap_sys_admin,cap_sys_ptrace,cap_sys_chroot,cap_sys_module,\
cap_net_admin,cap_net_raw,cap_setuid,cap_setgid,cap_dac_override,\
cap_fowner,cap_kill,cap_sys_rawio,cap_sys_boot \
    --inh='' \
    --addamb='' \
    -- -c "exec $*"
}

# Usage
drop_caps_exec "/bin/bash agent-script.sh"
```

---

## Full capability drop (no caps at all)

```bash
# Nuclear option: drop all capabilities before running agent
capsh --drop="$(seq 0 40 | xargs -I{} sh -c 'cap=$(capsh --decode={} 2>/dev/null | cut -d= -f2); [ -n "$cap" ] && echo -n "$cap,"' | sed 's/,$//')" \
  --inh='' --addamb='' \
  -- -c "exec $*"

# Simpler with capsh shortcut:
capsh --inh='' --addamb='' -- -c "exec $*"
# (inheritable=none means child cannot regain caps)
```

---

## Audit current capabilities

```bash
# Check process capability sets
cat /proc/self/status | grep -E '^Cap'
# CapInh: 0000000000000000
# CapPrm: 000001ffffffffff
# CapEff: 000001ffffffffff
# CapBnd: 000001ffffffffff
# CapAmb: 0000000000000000

# Decode hex to human-readable
capsh --decode=000001ffffffffff

# Check specific process
cat /proc/"$AGENT_PID"/status | grep Cap | while read -r line; do
  name="${line%%:*}"
  hex="${line##*:}"; hex="${hex//[[:space:]]/}"
  caps=$(capsh --decode="$hex" 2>/dev/null | cut -d= -f2)
  echo "$name: $caps"
done
```

---

## OCI config.json capability section

```json
"process": {
  "capabilities": {
    "bounding":    [],
    "effective":   [],
    "inheritable": [],
    "permitted":   [],
    "ambient":     []
  },
  "noNewPrivileges": true
}
```

---

## Anti-Fake-Pass Checklist

```
❌ noNewPrivileges not set → SUID binaries restore dropped caps
❌ Inheritable set has caps → child processes re-acquire dropped caps via execve
❌ Ambient set non-empty → capabilities survive exec into unprivileged binary
❌ Only effective dropped, not bounding → process can re-raise effective caps
❌ CAP_SETPCAP retained → can remove own bounding set restrictions
❌ CAP_SYS_ADMIN left in → single cap that enables dozens of dangerous operations
❌ No audit of cap sets after exec → assume drop worked but never verified
```
