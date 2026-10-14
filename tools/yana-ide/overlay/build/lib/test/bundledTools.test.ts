/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import {
	type IBundledToolDefinition,
	getAssetUrl,
	getPinnedFileOptions,
	getToolTarget,
	locateBinary,
	verifyChecksum,
} from '../bundledTools.ts';

const tool: IBundledToolDefinition = {
	name: 'cua-driver',
	version: '0.35.2',
	repo: 'https://github.com/trycua/cua',
	tag: 'cua-driver-rs-v0.35.2',
	license: 'MIT',
	licenseFile: { url: 'https://example.invalid/LICENSE.md', sha256: 'a'.repeat(64) },
	targets: {
		'darwin-universal': { asset: 'cua-driver-rs-0.35.2-darwin-universal-binary.tar.gz', sha256: 'b'.repeat(64), binary: 'cua-driver' },
		'win32-x64': { asset: 'cua-driver-rs-0.35.2-windows-x86_64-binary.zip', sha256: 'c'.repeat(64), binary: 'cua-driver.exe' },
	},
};

suite('bundled tools', () => {
	test('maps both macOS architectures to the universal build', () => {
		assert.deepStrictEqual(
			[getToolTarget('darwin', 'arm64'), getToolTarget('darwin', 'x64'), getToolTarget('darwin', 'universal'), getToolTarget('win32', 'x64'), getToolTarget('linux', 'arm64')],
			['darwin-universal', 'darwin-universal', 'darwin-universal', 'win32-x64', 'linux-arm64'],
		);
	});

	test('returns undefined for platforms without a build instead of guessing', () => {
		assert.deepStrictEqual(
			[getToolTarget('linux', 'arm'), getToolTarget('win32', 'ia32'), getToolTarget('freebsd', 'x64'), getToolTarget('alpine', 'x64')],
			[undefined, undefined, undefined, undefined],
		);
	});

	test('builds the download URL from repo, tag and asset name', () => {
		assert.strictEqual(
			getAssetUrl(tool, 'darwin-universal'),
			'https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.35.2/cua-driver-rs-0.35.2-darwin-universal-binary.tar.gz',
		);
	});

	test('a pinned file is fetched with its checksum and any headers it declares', () => {
		const file = { url: 'https://api.github.com/repos/o/r/contents/LICENSE.md?ref=t', sha256: 'd'.repeat(64), headers: { Accept: 'application/vnd.github.raw' } };
		assert.deepStrictEqual(getPinnedFileOptions(file), { checksumSha256: 'd'.repeat(64), headers: { Accept: 'application/vnd.github.raw' } });
		assert.deepStrictEqual(getPinnedFileOptions({ url: file.url, sha256: file.sha256 }), { checksumSha256: 'd'.repeat(64), headers: undefined });
	});

	test('rejects a target the tool does not define', () => {
		assert.throws(() => getAssetUrl(tool, 'linux-x64'), /no asset for target 'linux-x64'/);
	});

	test('accepts matching bytes and rejects a modified payload', () => {
		const bytes = new TextEncoder().encode('cua-driver');
		const good = crypto.createHash('sha256').update(bytes).digest('hex');
		verifyChecksum(bytes, good, 'good.tar.gz');
		assert.throws(() => verifyChecksum(new TextEncoder().encode('tampered'), good, 'bad.tar.gz'), /Checksum mismatch for bad\.tar\.gz/);
	});

	test('rejects an empty or malformed expected checksum', () => {
		const bytes = new TextEncoder().encode('x');
		assert.throws(() => verifyChecksum(bytes, '', 'x'), /Invalid sha256/);
		assert.throws(() => verifyChecksum(bytes, 'not-hex', 'x'), /Invalid sha256/);
	});

	test('locates the binary and refuses a path that escapes the extraction directory', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-tools-test-'));
		try {
			fs.writeFileSync(path.join(dir, 'cua-driver'), '');
			assert.strictEqual(locateBinary(dir, 'cua-driver'), path.join(dir, 'cua-driver'));
			assert.throws(() => locateBinary(dir, 'missing'), /not found/);
			assert.throws(() => locateBinary(dir, '../outside'), /escapes/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
