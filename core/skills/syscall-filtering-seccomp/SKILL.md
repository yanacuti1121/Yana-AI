---
name: syscall-filtering-seccomp
description: Linux seccomp BPF syscall filtering. Default-deny profiles, allow-listing safe syscalls, SCMP_ACT_ERRNO vs SCMP_ACT_KILL, Docker/OCI seccomp JSON format, blocking reboot/mount/ptrace for agent subprocesses. Sources: seccomp/libseccomp, opencontainers/runc.
origin: yana-ai — synthesized from seccomp/libseccomp (Linux Foundation), opencontainers/runc seccomp spec
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /syscall-filtering-seccomp

## When to Use

- Hard-blocking dangerous syscalls (reboot, mount, ptrace, kexec_load) from agent subprocesses
- Writing OCI-compatible seccomp profiles for runc / Docker
- Auditing which syscalls a binary actually needs (strace → allowlist)
- Defense in depth below capability dropping

## Do NOT use for

- Replacing namespaces or capability dropping — use all three together
- Filtering network destinations (use network namespaces + egress rules)

---

## OCI seccomp profile (JSON — Docker/runc compatible)

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "defaultErrnoRet": 1,
  "architectures": ["SCMP_ARCH_X86_64","SCMP_ARCH_X86","SCMP_ARCH_X32"],
  "syscalls": [
    {
      "names": [
        "read","write","open","openat","close","stat","fstat","lstat",
        "poll","lseek","mmap","mprotect","munmap","brk","rt_sigaction",
        "rt_sigprocmask","rt_sigreturn","ioctl","pread64","pwrite64",
        "readv","writev","access","pipe","select","sched_yield",
        "mremap","msync","mincore","madvise","shmget","shmat","shmctl",
        "dup","dup2","pause","nanosleep","getitimer","alarm","setitimer",
        "getpid","sendfile","socket","connect","accept","sendto","recvfrom",
        "sendmsg","recvmsg","shutdown","bind","listen","getsockname",
        "getpeername","socketpair","setsockopt","getsockopt","clone",
        "fork","vfork","execve","exit","wait4","kill","uname","fcntl",
        "flock","fsync","fdatasync","truncate","ftruncate","getdents",
        "getcwd","chdir","fchdir","rename","mkdir","rmdir","creat","link",
        "unlink","symlink","readlink","chmod","fchmod","chown","fchown",
        "lchown","umask","gettimeofday","getrlimit","getrusage","sysinfo",
        "times","getuid","getgid","setuid","setgid","geteuid","getegid",
        "getgroups","getppid","getpgrp","setsid","setreuid","setregid",
        "getresuid","getresgid","getpgid","setfsuid","setfsgid","getsid",
        "capget","capset","rt_sigpending","rt_sigtimedwait","rt_sigqueueinfo",
        "rt_sigsuspend","sigaltstack","utime","mknod","uselib","personality",
        "ustat","statfs","fstatfs","sysfs","getpriority","setpriority",
        "sched_setparam","sched_getparam","sched_setscheduler","sched_getscheduler",
        "sched_get_priority_max","sched_get_priority_min","sched_rr_get_interval",
        "mlock","munlock","mlockall","munlockall","vhangup","modify_ldt",
        "pivot_root","prctl","arch_prctl","adjtimex","setrlimit","chroot",
        "sync","acct","settimeofday","getdents64","restart_syscall","tgkill",
        "utimes","epoll_create","epoll_ctl","epoll_wait","set_tid_address",
        "semtimedop","fadvise64","timer_create","timer_settime","timer_gettime",
        "timer_getoverrun","timer_delete","clock_gettime","clock_getres",
        "clock_nanosleep","exit_group","epoll_wait","epoll_ctl","tgkill",
        "utimes","vserver","waitid","ioprio_set","ioprio_get","inotify_init",
        "inotify_add_watch","inotify_rm_watch","migrate_pages","openat","mkdirat",
        "mknodat","fchownat","futimesat","newfstatat","unlinkat","renameat",
        "linkat","symlinkat","readlinkat","fchmodat","faccessat","pselect6",
        "ppoll","unshare","set_robust_list","get_robust_list","splice","tee",
        "sync_file_range","vmsplice","move_pages","utimensat","epoll_pwait",
        "signalfd","timerfd_create","eventfd","fallocate","timerfd_settime",
        "timerfd_gettime","accept4","signalfd4","eventfd2","epoll_create1",
        "dup3","pipe2","inotify_init1","preadv","pwritev","rt_tgsigqueueinfo",
        "perf_event_open","recvmmsg","fanotify_init","fanotify_mark","prlimit64",
        "name_to_handle_at","open_by_handle_at","clock_adjtime","syncfs",
        "sendmmsg","setns","getcpu","process_vm_readv","process_vm_writev",
        "seccomp","getrandom","memfd_create","kexec_file_load","bpf",
        "execveat","userfaultfd","membarrier","mlock2","copy_file_range",
        "preadv2","pwritev2","pkey_mprotect","pkey_alloc","pkey_free",
        "statx","io_pgetevents","rseq","pidfd_send_signal","io_uring_setup",
        "io_uring_enter","io_uring_register","open_tree","move_mount","fsopen",
        "fsconfig","fsmount","fspick","pidfd_open","clone3","close_range",
        "openat2","pidfd_getfd","faccessat2","process_madvise","epoll_pwait2",
        "mount_setattr","quotactl_fd","landlock_create_ruleset","landlock_add_rule",
        "landlock_restrict_self","futex_waitv","set_mempolicy_home_node"
      ],
      "action": "SCMP_ACT_ALLOW"
    },
    {
      "names": ["reboot","kexec_load","init_module","finit_module","delete_module",
                "mount","umount","umount2","pivot_root","chroot","swapon","swapoff",
                "syslog","ptrace","process_vm_readv","process_vm_writev"],
      "action": "SCMP_ACT_ERRNO",
      "errnoRet": 1
    }
  ]
}
```

---

## Applying seccomp in bash (via libseccomp / prctl)

```bash
# Apply Docker default seccomp profile to runc container
runc run --bundle /tmp/oci-bundle \
  --no-new-keyring \
  sandbox-$(date +%s)
# seccomp profile embedded in config.json under linux.seccomp

# Verify which syscalls a binary needs
strace -c -e trace=all /bin/bash -c "ls /tmp" 2>&1 | grep -v '^%'
```

---

## Minimal agent allowlist (bash-only workload)

```
ALLOW: read, write, open, openat, close, stat, fstat, execve, exit_group
ALLOW: mmap, munmap, brk, mprotect, clone, wait4, getpid, getuid
ALLOW: nanosleep, clock_gettime, getrandom, futex, prctl
DENY ALL OTHERS with SCMP_ACT_ERRNO(EPERM)
```

---

## Anti-Fake-Pass Checklist

```
❌ defaultAction SCMP_ACT_ALLOW — defeats the entire filter
❌ ptrace allowed → process can read/write arbitrary memory of other processes
❌ mount allowed → can mount new filesystems to escape jail
❌ kexec_load allowed → can replace running kernel
❌ No architecture filter → x86 compat syscalls bypass x86_64 profile
❌ SCMP_ACT_KILL used for all denies → crashes legitimate binaries that probe syscalls
❌ Profile not embedded in OCI config.json → runc ignores it
```
