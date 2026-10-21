#!/usr/bin/env python3
"""Với mỗi nhóm lệnh của yana-rt, kiểm tra IDE có gọi nó trực tiếp không (chỉ đọc).

Cách kiểm: tìm trong mã tiện ích dạng ['<nhóm>' hoặc args: ['<nhóm>' (mảng đối số truyền cho yana-rt). Đây là kiểm tra thô nhưng
dựa trên mã thật, không dựa trên tài liệu. Chạy: python3 tools/yana-ide/scripts/ide-coverage.py [repo]
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
EXT = os.path.join(ROOT, 'tools/yana-ide/extensions/yana-agent')

inventory = json.loads(subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'tools/yana-ide/scripts/inventory.py'), ROOT], capture_output=True, text=True).stdout)
subcommands = [s for s in inventory['runtime']['subcommands'] if s != 'help']

source = ''
for base in (EXT, os.path.join(EXT, 'features')):
    for name in sorted(os.listdir(base)):
        if name.endswith('.js'):
            source += open(os.path.join(base, name)).read() + '\n'

rows = []
for name in subcommands:
    called = bool(re.search(r"\[\s*'" + re.escape(name) + r"'", source))
    rows.append((name, called))

done = [n for n, c in rows if c]
missing = [n for n, c in rows if not c]
print(json.dumps({'total': len(rows), 'called_by_ide': done, 'not_called_by_ide': missing}, indent=2))
