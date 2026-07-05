# Yana AI: Anti-Slop Prose Law
# Source: facebook/astryx "Night Watch" prose-quality rubric (public wiki,
# Night-Watch-Overview.md and Night-Watch-Component-Auditor.md: a live,
# hourly-cron multi-agent OSS stewardship system with a public track record,
# 33 documented interactions across 20 PRs over 30 days). The banned-word
# list and the closing quote below closely paraphrase that source's own
# rubric; they are not an original list. The scope, the attribution
# exception, and the security-caveat carve-out are Yana AI-specific
# additions not present in the source.

**Status:** Active
**Tier:** TIER 3, CONSISTENCY (extended). The three named bullets under
Tier 3 in `00-meta-rule-enforcer.md` cover skill duplication, rule
conflicts, and memory persistence; none of them literally describe prose
quality. This rule is filed here anyway because its concern is the same
kind of internal coherence Tier 3 already governs, applied to authored
voice instead of skill, rule, or memory bookkeeping. It is not filed
under Tier 5, UI/DESIGN QUALITY, because it has nothing to do with UI.
**Enforced by:** agent self-application only. No hook checks this file;
no `core/hooks/*` script scans commit, PR, or issue text for the patterns
below. Treat this the same way `63-autonomous-session-law.md` and
`69-cognitive-reliability-law.md` are treated: behavioral guidance the
agent applies to its own output, not a gate a script enforces.
**Companion rules:** `anti-ai-slop-design-law.md` (the same failure mode
in visual design, not prose), `golden-principles.md` #4 (conclusion
first, which covers tone and structure while this file covers banned
phrasing), `git-workflow-v2.md` (commit message format, not phrasing
quality).
**Companion skills:** `core/skills/stop-slop/SKILL.md` already exists and
overlaps substantially. It also bans em dashes and "it's worth noting"
style filler, and its own `compatibility` field already names commit
messages and PR descriptions. The difference is enforcement mode, not
subject matter. `stop-slop` is on-demand, triggered when a user asks for
a writing pass such as "make this sound less like AI." This rule applies
by default to every commit, PR, issue, or doc an agent authors, without
being asked. Neither file is generated from the other, so a future edit
to one banned-phrase list will not automatically propagate to the other;
whoever edits either file should check both.

---

## Why this file exists

`anti-ai-slop-design-law.md` catches the visual tells of AI-generated
interfaces. Until this file, nothing in this rule set caught the
equivalent tell in prose: commit messages, PR bodies, and review comments
that read as generated rather than written. Astryx's Night Watch, a real
multi-agent system that reviews and fixes PRs on a public repo rather
than a design proposal, hit this problem directly enough to write an
explicit rubric into its own hourly-cron agent instructions, with a
stated reason worth repeating here nearly verbatim: a system that writes
slop while cleaning slop is broken.

## Scope

Applies going forward, to prose an agent newly authors:

```
✅ git commit messages
✅ PR titles and bodies
✅ Issue comments, code review comments
✅ New prose in tracked docs (README, docs/**, new rule files)
```

Does not apply to:

```
❌ Casual chat replies to the user in this session. General tone
   guidance in this system's own instructions already governs that;
   this file is a repo-artifact gate, not a conversation-style gate.
❌ Code comments. Governed by golden-principles.md's "default to no
   comments" rule instead, a different failure mode.
❌ Existing prose in Tier 1/2 rule files, hook messages, or other
   already-committed content. This rule does not create an obligation
   to retroactively edit existing rule files' operational message
   templates for style compliance (several use a dash as part of their
   standard "BLOCKED, reason" format today). Applying this rule to
   already-existing Tier 1/2 content would itself require the same
   review this file's own edit went through, and is out of scope here.
```

## Banned patterns (rewrite before committing)

```
❌ Em dashes as punctuation in new prose. Use a comma, colon,
   semicolon, or period instead.
❌ Curly quotes or an ellipsis character. Use straight quote marks and
   a literal three periods.
❌ Buzzword filler: seamless, leverage, utilize, robust, delve,
   elevate, unlock, empower, cutting-edge, powerful, effortless.
❌ Significance padding: "it's worth noting", "it's important to
   note", "plays a crucial role", "in today's world".
❌ Hollow intensifiers: very, truly, simply, easily.
❌ "Not only X but also Y" or "isn't just X, it's Y" rhetoric.
❌ Emoji-heavy headers or bot-branding in commit, PR, or issue text,
   beyond the one standard footer this workflow already requires (see
   the exception below).
```

**Rewriting must preserve substance, not delete it.** If a sentence
flagged by the significance-padding or hollow-intensifier bans carries a
real caveat, especially a security-relevant one, the fix is to rephrase
it plainly, not to remove it. "It's important to note this disables
input validation temporarily" becomes "This disables input validation
temporarily." The warning survives; only the padding is cut.

## Exception: required attribution stays

This system's own tooling instructions require ending Claude-authored
commits with a `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
trailer, and this workflow's standard PR-creation template appends a
closing footer line reading `Generated with [Claude Code]
(https://claude.com/claude-code)`, including its emoji. Both the trailer
and that exact footer line, emoji included, are structured attribution
metadata this system's own tooling already mandates, not slop prose, and
both stay unmodified. This rule bans slop phrasing in the prose an agent
composes. It does not authorize stripping the one attribution line and
one footer line this workflow already requires, and it does not
authorize adding any second, redundant attribution beyond those two.

## The test

Before committing prose to a repo artifact: would a careful engineer on
this project write this sentence? If the honest answer is no, rewrite
it. Astryx's Night Watch uses the same question to decide whether an
automated comment is worth posting at all; here it applies to phrasing
rather than to whether to speak at all.

## Anti-Pattern Checklist

```
❌ "This seamlessly leverages the existing utility, robust and elevates
   the codebase."
❌ "It's worth noting that this change plays a crucial role in..."
❌ "This isn't just a bug fix, it's a fundamental improvement."
❌ A commit message with a second "Generated by AI" line stacked on top
   of the required Co-Authored-By trailer.
```

## References

- `core/rules/anti-ai-slop-design-law.md`: same failure mode, visual design.
- `core/rules/golden-principles.md`: #4 conclusion-first (tone and structure).
- `core/rules/git-workflow-v2.md`: commit message format; this file adds
  a prose-quality layer on top, it does not replace the format.
- `core/skills/stop-slop/SKILL.md`: the on-demand counterpart to this
  always-on rule; see the Companion skills note above.
- Source: facebook/astryx public wiki, `Night-Watch-Overview.md` and
  `Night-Watch-Component-Auditor.md` (verified 2026-07-05 via
  `git clone https://github.com/facebook/astryx.wiki.git`; the
  banned-word list here closely paraphrases that source's own rubric).
