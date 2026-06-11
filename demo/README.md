# Demo recording — single source of truth

`demo.sh` is the scripted demo. Both published artifacts are rendered from it,
so editing the script updates everything on the next render.

| Artifact | Used by | Render command |
|---|---|---|
| `docs/demo.gif` | README (EN + VI) | `vhs demo/demo.tape` |
| `docs/demo.cast` | docs homepage asciinema player | `asciinema rec -c "bash demo/demo.sh" docs/demo.cast --overwrite` |

## Render locally

```bash
# GIF — needs vhs (https://github.com/charmbracelet/vhs)
vhs demo/demo.tape

# cast — needs asciinema
asciinema rec -c "bash demo/demo.sh" docs/demo.cast --overwrite
```

## Render in CI

`.github/workflows/demo-gif.yml` — manual `workflow_dispatch`. Runs vhs in the
official container and opens a commit with the refreshed `docs/demo.gif`.
Trigger it after changing `demo.sh` (e.g. updated hook/skill counts in the
summary frame).

## Updating the counts line

The summary frame ends with `46 hooks · 826 checks · 3,518 skills` — keep it in
sync with MANIFEST.json when re-rendering for a release.
