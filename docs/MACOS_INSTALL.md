# Installing Yana Desktop on macOS

Yana Desktop for macOS is currently distributed **ad-hoc signed but not
notarized by Apple**. The project does not yet have an Apple Developer
Program membership (a paid, yearly subscription), which is required to get
a "Developer ID Application" certificate and submit builds for Apple's
notarization service. Until then, macOS Gatekeeper will show a warning the
first time you open the app. This is expected — it does not mean the app
is broken or unsafe, only that Apple has not (yet) reviewed this specific
build.

This page shows the two **official Apple-provided ways** to open the app
anyway. Neither weakens your Mac's security settings, and neither is
specific to Yana — they are the same steps macOS itself offers for any
unnotarized app.

## Why you see a warning

macOS Gatekeeper checks two things before it lets an app run without
asking: whether the app is signed with a trusted **Developer ID**, and
whether Apple has **notarized** that specific build (an automated malware
scan Apple runs on request). Yana Desktop is signed (ad-hoc — see
[What "ad-hoc signed" means](#what-ad-hoc-signed-means) below) but not
notarized, so Gatekeeper shows a warning instead of blocking the app
outright or opening it silently.

## How to open it — Method 1: Right-click → Open (recommended)

This is the fastest official method and only needs to be done once per
version you download.

1. Open **Finder** and go to wherever you saved `Yana AI.app` (if you
   downloaded the `.dmg`, drag `Yana AI` into `Applications` first).
2. **Right-click** (or **Control-click**) `Yana AI.app` and choose **Open**
   from the menu — do not just double-click it.
3. macOS shows a dialog saying it cannot verify the developer. Click
   **Open** in that dialog.
4. The app launches. From now on, double-clicking it normally works too —
   macOS remembers this specific app is trusted.

## How to open it — Method 2: System Settings → Privacy & Security

If you already double-clicked the app and macOS refused to open it
("Yana AI can't be opened because Apple cannot check it for malicious
software" / "the developer cannot be verified"), use this instead:

1. Open **System Settings** → **Privacy & Security**.
2. Scroll down to the **Security** section. You'll see a line like
   *"Yana AI" was blocked from use because it is not from an identified
   developer.*
3. Click **Open Anyway**.
4. macOS may ask you to confirm once more (and, depending on your macOS
   version, to authenticate with Touch ID or your password) — confirm.
5. Open `Yana AI.app` again; it now launches normally.

## What NOT to do

Some guides online suggest disabling Gatekeeper entirely
(`sudo spctl --master-disable`) or stripping the quarantine flag from the
Terminal. **Don't do either of these.** They turn off a real macOS
protection for *every* app on your Mac, not just this one, and are not
needed — Method 1 or Method 2 above is enough, and only ever applies to
this one app.

## What "ad-hoc signed" means

"Ad-hoc signed" means the app's code is cryptographically sealed (so macOS
can detect if the file is corrupted or tampered with after this build was
made) using a signature that isn't tied to any registered Apple developer
identity — different from being **unsigned**, but it carries none of the
trust an Apple-issued Developer ID certificate provides. It is a real,
Apple-documented signing mechanism (`codesign --sign -`), used here only
so the app can launch at all on Apple Silicon Macs (which require *some*
valid signature on every executable), not to imply any Apple review or
endorsement.

## Verifying your download

Each release lists a SHA-256 checksum for the `.dmg`/`.zip`. To confirm
your download wasn't corrupted or tampered with in transit, run in
Terminal:

```bash
shasum -a 256 ~/Downloads/Yana-AI-*.dmg
```

...and compare the result against the checksum published on the
[release page](https://github.com/yanacuti1121/Yana-AI/releases). This is
a data-integrity check, not a substitute for Apple notarization — it
confirms the file matches what was published, not that Apple has reviewed
it.

## When this page will stop being needed

Once the project has an Apple Developer Program membership, future builds
will be signed with a real Developer ID, have Hardened Runtime enabled,
and be submitted to Apple for notarization + stapling. At that point
Gatekeeper will open the app with no warning at all, and this page (and
the note in the main [README](../README.md)) will be updated to say so.
The build pipeline (`tools/yana-desktop/package.json`'s `build.mac`
config + `tools/yana-desktop/scripts/after-sign-mac.js`) is already
structured so that switch is a configuration change, not a rewrite — see
the comments at the top of `after-sign-mac.js`.
