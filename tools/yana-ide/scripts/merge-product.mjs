// Ghép product.overrides.json đè lên product.json của upstream.
// Dùng: node merge-product.mjs <upstream product.json> <overrides.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [upstreamPath, overridesPath] = process.argv.slice(2);
if (!upstreamPath || !overridesPath) {
	console.error('usage: merge-product.mjs <upstream product.json> <overrides.json>');
	process.exit(2);
}

const upstream = JSON.parse(readFileSync(upstreamPath, 'utf8'));
const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'));
const merged = { ...upstream, ...overrides };

// Stamp the real Yana Studio version (the one the studio-vX.Y.Z release tag must match, see
// .github/workflows/yana-studio-desktop.yml) so the update check compares against the installed build
// instead of a number written into the extension by hand.
const studioPackage = new URL('../../yana-studio/package.json', import.meta.url);
try {
	const studioVersion = JSON.parse(readFileSync(studioPackage, 'utf8')).version;
	if (typeof studioVersion === 'string' && /^\d+\.\d+\.\d+/.test(studioVersion)) {
		merged.yanaStudioVersion = studioVersion;
	} else {
		console.error(`[yana-ide] ${studioPackage.pathname} has no valid version; yanaStudioVersion not stamped`);
	}
} catch (error) {
	console.error(`[yana-ide] could not read ${studioPackage.pathname}: ${error.message}; yanaStudioVersion not stamped`);
}

writeFileSync(upstreamPath, JSON.stringify(merged, null, '\t') + '\n');
console.log(`[yana-ide] product.json: ${Object.keys(overrides).length} keys overridden`);
