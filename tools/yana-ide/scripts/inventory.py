#!/usr/bin/env python3
"""Kiểm kê Yana AI bằng cách đếm trực tiếp trong repo (chỉ đọc, không ghi gì).

Mục đích: số liệu trong các tài liệu kiến trúc đã cũ, nên mọi con số trong bảng phủ sóng IDE phải lấy từ đây.
Chạy: python3 tools/yana-ide/scripts/inventory.py [đường dẫn repo]   -> in JSON ra stdout
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())


def p(*parts):
    return os.path.join(ROOT, *parts)


def files(directory, suffix=None, recursive=False):
    base = p(directory)
    if not os.path.isdir(base):
        return []
    found = []
    for current, dirs, names in os.walk(base):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'target', '.git', '__pycache__')]
        for name in names:
            if suffix is None or name.endswith(suffix):
                found.append(os.path.join(current, name))
        if not recursive:
            break
    return found


def subdirs_with(directory, marker):
    base = p(directory)
    if not os.path.isdir(base):
        return []
    return [d for d in sorted(os.listdir(base)) if os.path.isfile(os.path.join(base, d, marker))]


def settings_hooks(settings_file):
    try:
        data = json.load(open(p(settings_file)))
    except (OSError, ValueError):
        return None
    rows = []
    for event, groups in (data.get('hooks') or {}).items():
        for group in groups:
            for hook in group.get('hooks', []):
                match = re.search(r'([A-Za-z0-9_.-]+\.(?:sh|js|py))', hook.get('command', ''))
                rows.append({'event': event, 'matcher': group.get('matcher', '*'), 'script': match.group(1) if match else None})
    return rows


def rt_subcommands():
    binary = p('target', 'debug', 'yana-rt')
    if not os.path.isfile(binary):
        return None
    out = subprocess.run([binary, '--help'], capture_output=True, text=True, timeout=20).stdout
    block = out.split('Commands:')[-1].split('Options:')[0]
    return [line.split()[0] for line in block.splitlines() if re.match(r'^  [a-z]', line)]


hooks_dir = files('core/hooks', '.sh') + files('core/hooks', '.js') + files('core/hooks', '.py')
wired = settings_hooks('.claude/settings.json') or []
wired_scripts = {row['script'] for row in wired if row['script']}
hook_scripts = {os.path.basename(f) for f in hooks_dir}

report = {
    'repo': ROOT,
    'core': {
        'skills': len(subdirs_with('core/skills', 'SKILL.md')),
        'agents_md': len([f for f in files('core/agents', '.md', recursive=True)]),
        'commands': len(files('core/commands', '.md', recursive=True)),
        'rules': len(files('core/rules', '.md')),
        'scripts': len(files('core/scripts', recursive=True)),
        'lib_files': len(files('core/lib', recursive=True)),
        'gates': len(files('core/gates')),
        'hook_scripts': len(hook_scripts),
        'memory_files': len(files('core/memory', recursive=True)),
        'config_files': len(files('core/config', recursive=True)),
        'templates': len(files('core/templates', recursive=True)),
    },
    'hooks': {
        'scripts_in_core_hooks': len(hook_scripts),
        'entries_wired_in_claude_settings': len(wired),
        'distinct_scripts_wired': len(wired_scripts),
        'scripts_not_wired': sorted(hook_scripts - wired_scripts),
        'wired_by_event': {event: len([r for r in wired if r['event'] == event]) for event in sorted({r['event'] for r in wired})},
    },
    'runtime': {
        'rust_files': len(files('src', '.rs', recursive=True)),
        'subcommands': rt_subcommands(),
        'guard_modules': sorted(os.path.splitext(os.path.basename(f))[0] for f in files('src/guard', '.rs')),
        'capabilities_declared': len(re.findall(r'name: "([a-z]+\.[a-z]+)"', ''.join(open(f).read() for f in files('src/capability', '.rs') if 'registry_data' in f))),
    },
    'surfaces': {name: len(files(f'tools/{name}', recursive=True)) for name in sorted(os.listdir(p('tools'))) if os.path.isdir(p('tools', name))},
    'other_dirs': {name: len(files(name, recursive=True)) for name in ('adapters', 'gates', 'guards', 'policy', 'router', 'scanner', 'ops', 'github-app', 'site', 'vendor', 'ledger', 'memory', 'prompts', 'skills') if os.path.isdir(p(name))},
}
print(json.dumps(report, indent=2, ensure_ascii=False))
