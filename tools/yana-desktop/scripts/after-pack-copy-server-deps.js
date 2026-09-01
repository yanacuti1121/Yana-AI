'use strict';
// electron-builder afterPack hook — stage the server's own node_modules.
//
// Why this exists: package.json's "extraFiles" entry copies ../yana-web
// into Resources/server, with a "filter" array that (as of the previous
// fix attempt) no longer lists "!node_modules/**". That alone was NOT
// enough -- electron-builder's file-matching for extraFiles/extraResources
// respects the repo's own .gitignore (which lists "node_modules/") in
// addition to the explicit filter array, so node_modules was still
// silently dropped from every packaged build regardless of the filter.
// Confirmed live: downloaded the real v1.4.5 release asset, and
// Resources/server had zero node_modules despite the filter fix --
// server.js/robot.js's "ws" dependency was still missing, so the local
// server still crashed with MODULE_NOT_FOUND on every launch.
//
// Fix: bypass electron-builder's file-matching entirely for this
// directory. afterPack runs once the app's files are fully assembled in
// appOutDir, before code signing (see after-sign-mac.js) and before the
// platform distributable (dmg/zip/nsis/AppImage) is built from that
// directory -- a plain filesystem copy here is unaffected by any
// gitignore-aware or filter-based exclusion.
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  const resourcesDir = electronPlatformName === 'darwin' || electronPlatformName === 'mas'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');

  const sourceNodeModules = path.join(__dirname, '..', '..', 'yana-web', 'node_modules');
  const destNodeModules = path.join(resourcesDir, 'server', 'node_modules');

  if (!fs.existsSync(sourceNodeModules)) {
    throw new Error(
      `[after-pack-copy-server-deps] ${sourceNodeModules} does not exist -- ` +
      `run 'npm ci' in tools/yana-web before packaging`,
    );
  }

  fs.rmSync(destNodeModules, { recursive: true, force: true });
  fs.cpSync(sourceNodeModules, destNodeModules, { recursive: true });
  console.log(`[after-pack-copy-server-deps] copied server node_modules -> ${destNodeModules}`);
};
