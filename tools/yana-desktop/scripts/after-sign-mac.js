'use strict';
// electron-builder afterSign hook — macOS code signing.
//
// Why this exists: electron-builder's own signing step only knows how to
// search the keychain for a real "Developer ID Application" identity. This
// project has no paid Apple Developer Program membership yet (see
// docs/MACOS_INSTALL.md), so with no identity configured it just skips
// signing entirely — leaving Electron's own prebuilt ad-hoc
// "linker-signed" signature on the raw Mach-O binary untouched. That
// signature only ever covered the ORIGINAL bare Electron.app skeleton, not
// the extraFiles this package.json adds afterward (server/, core/, bin/,
// pty-bridge/, memory/, ...). The mismatch is exactly Apple's
//   "code has no resources but signature indicates they must be present"
// error: codesign sees a CodeDirectory that implies a resource seal should
// exist, but none does for the actual (larger) Resources tree — confirmed
// via `codesign -dv` / `spctl -a -vv` before this hook existed.
//
// Fix: after electron-builder finishes assembling the FULL bundle (this
// hook runs after that step, before dmg/zip creation), deep-re-sign it
// ourselves with an explicit ad-hoc identity ("-"). This is a real,
// standard codesign mechanism — not a forged signature and not a
// Gatekeeper bypass. An ad-hoc-signed app is still "unidentified developer"
// to Gatekeeper and still requires the user's explicit Right-click → Open
// (see docs/MACOS_INSTALL.md), exactly as a fully unsigned app would;
// ad-hoc signing only fixes bundle integrity (a valid, consistent
// CodeDirectory + resource seal), it does not grant any trust.
//
// Upgrade path to real Developer ID + notarization (no rewrite needed):
//   1. Install the "Developer ID Application" cert (or set CSC_LINK /
//      CSC_KEY_PASSWORD) and change package.json's mac.identity from
//      null to the real identity string — or just remove that key,
//      electron-builder auto-discovers the cert once one exists.
//   2. Set mac.hardenedRuntime to true.
//   3. Add mac.notarize (electron-builder's built-in notarization, backed
//      by APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD or
//      APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER env vars — see
//      https://www.electron.build/configuration/mac#MacConfiguration-notarize).
//   4. Delete this file and remove "afterSign" from package.json —
//      electron-builder signs with the real identity itself once one is
//      configured; this manual ad-hoc re-sign step is no longer needed.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterSign(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  if (electronPlatformName !== 'darwin') return;

  // A real identity is already configured (Developer ID present) —
  // electron-builder signed the bundle correctly itself; this hook must
  // not re-sign on top of that signature.
  const configuredIdentity = packager.config.mac && packager.config.mac.identity;
  if (configuredIdentity && configuredIdentity !== '-') return;

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const entitlementsPath = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');

  console.log(`[after-sign-mac] ad-hoc signing ${appPath} (no Developer ID configured — see docs/MACOS_INSTALL.md)`);
  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign', '-',
    '--entitlements', entitlementsPath,
    appPath,
  ], { stdio: 'inherit' });
};
