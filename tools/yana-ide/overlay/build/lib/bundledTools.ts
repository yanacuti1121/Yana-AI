/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Third-party command-line tools that ship inside the application, declared in
 * `product.json` under `bundledTools`. Every download is pinned to an exact release tag and
 * verified against a SHA-256 checksum recorded in `product.json`, so a changed or tampered
 * release asset fails the build instead of being packaged. Modelled on `builtInExtensions.ts`.
 *
 * Tools are shipped exactly as their authors published them: the archive contents, including
 * the authors' own code signatures, are never modified, and the authors' license and notices
 * are placed next to the binary.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fancyLog from 'fancy-log';
import { download, sha256, type IDownloadOptions } from './download.ts';

const execFileAsync = promisify(execFile);

const root = path.dirname(path.dirname(import.meta.dirname));

/** Directory (relative to the repo root) the packaging step copies from. */
export const BUNDLED_TOOLS_DIR = path.join('.build', 'bundledTools');

const MARKER_FILE = '.bundled-tool.json';
const LICENSE_FILE_NAME = 'LICENSE';
const NOTICES_FILE_NAME = 'THIRD_PARTY_NOTICES.md';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DOWNLOAD_TIMEOUT_MS = 300_000; // release archives are tens of MB
const EXTRACT_TIMEOUT_MS = 120_000;

export interface IBundledToolTarget {
	/** Release asset file name. */
	readonly asset: string;
	readonly sha256: string;
	/** Path of the executable inside the extracted archive. */
	readonly binary: string;
}

export interface IPinnedFile {
	readonly url: string;
	readonly sha256: string;
	/** Request headers, for example `Accept: application/vnd.github.raw` when the file is read through the GitHub API. */
	readonly headers?: Readonly<Record<string, string>>;
}

export interface IBundledToolDefinition {
	readonly name: string;
	readonly version: string;
	readonly repo: string;
	/** Git tag of the GitHub release that hosts the assets. */
	readonly tag: string;
	readonly license: string;
	/** Who wrote it and what it is for, shown to users on the Third-Party Components page. */
	readonly author?: string;
	readonly description?: string;
	/** The upstream license text, shipped next to the binary as the license requires. */
	readonly licenseFile: IPinnedFile;
	/** The upstream list of licenses of the libraries the tool itself embeds, shipped unmodified. */
	readonly noticesFile?: IPinnedFile;
	/** Keyed by the value `getToolTarget` returns. */
	readonly targets: { readonly [target: string]: IBundledToolTarget };
}

/**
 * Maps a build platform and architecture to a key of `IBundledToolDefinition.targets`.
 * macOS uses one universal binary for both architectures. Returns `undefined` for
 * combinations without a build, so callers skip the tool instead of guessing.
 */
export function getToolTarget(platform: string, arch: string): string | undefined {
	if (platform === 'darwin') {
		return arch === 'arm64' || arch === 'x64' || arch === 'universal' ? 'darwin-universal' : undefined;
	}
	if ((platform === 'linux' || platform === 'win32') && (arch === 'x64' || arch === 'arm64')) {
		return `${platform}-${arch}`;
	}
	return undefined;
}

function getTargetOrThrow(tool: IBundledToolDefinition, target: string): IBundledToolTarget {
	const entry = tool.targets[target];
	if (!entry) {
		throw new Error(`Bundled tool '${tool.name}' has no asset for target '${target}'. Available: [${Object.keys(tool.targets)}]`);
	}
	return entry;
}

export function getAssetUrl(tool: IBundledToolDefinition, target: string): string {
	const entry = getTargetOrThrow(tool, target);
	return `${tool.repo}/releases/download/${tool.tag}/${entry.asset}`;
}

export function verifyChecksum(contents: Uint8Array, expected: string, label: string): void {
	if (!SHA256_PATTERN.test(expected)) {
		throw new Error(`Invalid sha256 for ${label}: expected 64 lowercase hex characters`);
	}
	const actual = sha256(contents);
	if (actual !== expected) {
		throw new Error(`Checksum mismatch for ${label} (expected ${expected}, actual ${actual})`);
	}
}

/** Resolves `binary` inside `dir`, refusing paths that leave it or that do not exist. */
export function locateBinary(dir: string, binary: string): string {
	const resolvedDir = path.resolve(dir);
	const resolved = path.resolve(resolvedDir, binary);
	if (!resolved.startsWith(resolvedDir + path.sep)) {
		throw new Error(`Binary path '${binary}' escapes ${dir}`);
	}
	if (!fs.existsSync(resolved)) {
		throw new Error(`Binary '${binary}' not found in ${dir}`);
	}
	return resolved;
}

function isUpToDate(tool: IBundledToolDefinition, target: string, outDir: string): boolean {
	try {
		const marker = JSON.parse(fs.readFileSync(path.join(outDir, MARKER_FILE), 'utf8'));
		const entry = getTargetOrThrow(tool, target);
		locateBinary(outDir, entry.binary);
		return marker.version === tool.version && marker.sha256 === entry.sha256;
	} catch {
		return false;
	}
}

async function extractArchive(archive: string, outDir: string): Promise<void> {
	// bsdtar (macOS, Windows) and GNU tar both unpack .tar.gz; bsdtar also unpacks .zip.
	await execFileAsync('tar', ['-xf', archive, '-C', outDir], { timeout: EXTRACT_TIMEOUT_MS });
}

/** The checksum is what makes a download trustworthy, so the host it comes from does not matter. */
export function getPinnedFileOptions(file: IPinnedFile): IDownloadOptions {
	return { checksumSha256: file.sha256, headers: file.headers ? { ...file.headers } : undefined };
}

async function writePinnedFile(file: IPinnedFile, dest: string): Promise<void> {
	fs.writeFileSync(dest, await download(file.url, getPinnedFileOptions(file)));
}

/**
 * Downloads, verifies and unpacks one tool for `target` into `<outRoot>/<name>`, plus its
 * license text. Returns the absolute path of the executable.
 */
export async function syncBundledTool(tool: IBundledToolDefinition, target: string, outRoot: string): Promise<string> {
	const entry = getTargetOrThrow(tool, target);
	const outDir = path.join(outRoot, tool.name);
	if (isUpToDate(tool, target, outDir)) {
		fancyLog('[bundledTools]', `${tool.name}@${tool.version} (${target}) up to date`);
		return locateBinary(outDir, entry.binary);
	}

	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });

	const archive = path.join(outDir, entry.asset);
	const contents = await download(getAssetUrl(tool, target), { checksumSha256: entry.sha256, timeout: DOWNLOAD_TIMEOUT_MS });
	fs.writeFileSync(archive, contents);
	await extractArchive(archive, outDir);
	fs.rmSync(archive);

	await writePinnedFile(tool.licenseFile, path.join(outDir, LICENSE_FILE_NAME));
	if (tool.noticesFile) {
		await writePinnedFile(tool.noticesFile, path.join(outDir, NOTICES_FILE_NAME));
	}

	const binary = locateBinary(outDir, entry.binary);
	fs.writeFileSync(path.join(outDir, MARKER_FILE), JSON.stringify({ version: tool.version, sha256: entry.sha256 }));
	fancyLog('[bundledTools]', `${tool.name}@${tool.version} (${target}) downloaded and verified`);
	return binary;
}

/** Syncs every tool listed in `product.json` for the given build target. */
export async function syncBundledTools(platform: string, arch: string): Promise<void> {
	const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
	const tools = (product.bundledTools ?? []) as IBundledToolDefinition[];
	const target = getToolTarget(platform, arch);
	if (!target) {
		fancyLog('[bundledTools]', `no bundled tools for ${platform}-${arch}, skipping`);
		return;
	}
	for (const tool of tools) {
		await syncBundledTool(tool, target, path.join(root, BUNDLED_TOOLS_DIR));
	}
}

if (import.meta.main) {
	syncBundledTools(process.platform, process.env['VSCODE_ARCH'] ?? process.arch).then(() => process.exit(0)).catch(err => {
		fancyLog.error(err);
		process.exit(1);
	});
}
