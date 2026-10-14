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

writeFileSync(upstreamPath, JSON.stringify(merged, null, '\t') + '\n');
console.log(`[yana-ide] product.json: ${Object.keys(overrides).length} keys overridden`);
