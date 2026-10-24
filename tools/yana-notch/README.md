# Yana Notch (design prototype)

A browser prototype of how Yana could show its state next to the MacBook notch.
It is a design study only. Nothing here talks to `yana-rt` or to Yana Studio yet.

## What it shows

- A black pill that grows out of the notch, with a small pixel rabbit typing on a laptop.
- Four states: idle, running, waiting for approval, denied, plus a done flash. The dot matrix and the logo dot on the laptop use the decision colours (ALLOW green, ASK amber, DENY red).
- Approval on the notch itself: Allow / Deny buttons, or Enter / Esc.
- Hover or focus the pill to see the last four audit entries.
- A scripted scenario ("Giao việc cho Yana") that runs five steps, asks about one dangerous command and blocks one by policy.

## Try it

```bash
cd tools/yana-notch/prototype
python3 -m http.server 8124 --bind 127.0.0.1
# open http://127.0.0.1:8124/index.html  (add ?auto=1 to start the scenario)
```

## Status and open decisions

- Not wired to anything. The commands, times and results in the scenario are fixed demo data.
- Native or inside Studio is undecided: a small macOS companion app (always running, works for terminal runs too) versus a floating window inside Yana Studio.
- Not checked on a real notch display; the pill size follows measurements of a public product page, not of the hardware notch.
- `yana-rt` events (running, waiting for approval, denied) have not been checked yet.

## Provenance

The look follows general principles seen on public pages of a third-party notch app (a dark pill that merges with the notch, two-line text, a dot matrix on the right). The rabbit sprite, colours, wording and code are original to Yana. No assets or code from that app were used.
