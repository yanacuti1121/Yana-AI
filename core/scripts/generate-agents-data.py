#!/usr/bin/env python3
# Regenerates site/public/agents-data.json + docs/agents-data.json from the
# real frontmatter in core/agents/*.md. Added 2026-07-01 — the previous
# hand-maintained agents-data.json was frozen at 93 entries (real count: 101)
# and had silently dropped the yana-web-assistant persona under a name
# collision with core/agents/yana.md. Run this after adding/removing agents.

import json, os, re

NON_AGENT_FILES = {'IDENTITY.md', 'SOUL.md', 'README.md', 'CAPABILITIES.md'}

def parse_frontmatter(raw):
    lines = raw.split('\n')
    if lines[0].strip() != '---':
        return {}
    close = next((i for i in range(1, len(lines)) if lines[i].strip() == '---'), -1)
    if close < 0:
        return {}
    front = lines[1:close]
    out = {}
    i = 0
    while i < len(front):
        line = front[i]
        m = re.match(r'^(\w+):\s*(.*)$', line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            if val in ('>', '|', '>-', '|-'):
                block = []
                j = i + 1
                while j < len(front) and re.match(r'^\s+\S', front[j]):
                    block.append(front[j].strip())
                    j += 1
                out[key] = ' '.join(block)
                i = j
                continue
            out[key] = val.strip('"\'')
        i += 1
    return out


def collect_agents(base):
    agents = {}
    for dirpath, dirnames, files in os.walk(base):
        if os.path.basename(dirpath) == 'emotions' or os.sep + 'emotions' in dirpath:
            continue
        rel = os.path.relpath(dirpath, base)
        domain = 'core' if rel == '.' else rel.split(os.sep)[0]
        for f in files:
            if not f.endswith('.md') or f in NON_AGENT_FILES:
                continue
            full = os.path.join(dirpath, f)
            with open(full, encoding='utf-8', errors='ignore') as fh:
                raw = fh.read()
            fm = parse_frontmatter(raw)
            # Dedup key = frontmatter `name:` field (the actual registry
            # identity used for routing), falling back to filename only if
            # frontmatter is missing/malformed. Using the filename here would
            # silently re-collide core/agents/yana.md and
            # core/agents/yana/yana.md again after the rename fix.
            key = fm.get('name') or f[:-3]
            if key in agents:
                continue
            tools_raw = fm.get('tools', '')
            if tools_raw.startswith('['):
                try:
                    tools_list = json.loads(tools_raw.replace("'", '"'))
                except Exception:
                    tools_list = [t.strip() for t in tools_raw.strip('[]').split(',') if t.strip()]
            else:
                tools_list = [t.strip() for t in tools_raw.split(',') if t.strip()]
            desc = fm.get('description', '')
            if len(desc) > 180:
                desc = desc[:177].rsplit(' ', 1)[0] + '...'
            agents[key] = {
                'id': key,
                'name': key,
                'desc': desc,
                'domain': domain,
                'model': fm.get('model', 'sonnet'),
                'tools': len(tools_list),
            }
    return agents

agents = collect_agents('core/agents')
result = sorted(agents.values(), key=lambda x: x['id'])
print(f"Generated {len(result)} agent entries (was 101 before fixing the yana collision + CAPABILITIES leak)")

for path in ('site/public/agents-data.json', 'docs/agents-data.json'):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
    print("wrote", path)
