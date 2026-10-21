'use strict';
// Quản lý kiểm tra và cập nhật TÁCH BIỆT giữa:
// 1. Yana Studio: Ứng dụng Desktop IDE (phiên bản hiện tại 1.6.2, tag studio-v*)
// 2. Yana Runtime: Binary lõi yana-rt (phiên bản crates.io hoặc git tag rt-v*)
// Hai bản phát hành song song, hoàn toàn độc lập, không gộp chung thông báo.

const vscode = require('vscode');
const { execFile, exec } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { binary, workspaceRoot } = require('../cli');
const { getActiveLanguage } = require('./language');

const STUDIO_CURRENT_VERSION = '1.6.2';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/yanacuti1121/Yana-AI/releases?per_page=15';
const CRATES_IO_YANA_RT_API = 'https://crates.io/api/v1/crates/yana-rt';

function parseSemver(v) {
	if (!v) return [0, 0, 0];
	const clean = String(v).replace(/^[^\d]*/, '').split('-')[0].split('+')[0];
	const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
	while (parts.length < 3) parts.push(0);
	return parts.slice(0, 3);
}

function compareSemver(v1, v2) {
	const [maj1, min1, pat1] = parseSemver(v1);
	const [maj2, min2, pat2] = parseSemver(v2);
	if (maj1 !== maj2) return maj1 - maj2;
	if (min1 !== min2) return min1 - min2;
	return pat1 - pat2;
}

async function getRuntimeVersion() {
	const bin = binary();
	if (!bin) return null;
	return new Promise(resolve => {
		execFile(bin, ['--version'], { timeout: 4000 }, (err, stdout) => {
			if (err) return resolve(null);
			const line = String(stdout || '').trim().split('\n')[0];
			const match = line.match(/yana-rt\s+(\d+\.\d+\.\d+)/i) || line.match(/(\d+\.\d+\.\d+)/);
			resolve(match ? match[1] : null);
		});
	});
}

function getI18n(lang) {
	if (lang.startsWith('vi')) {
		return {
			checking: 'Đang kiểm tra cập nhật cho Yana Studio và Yana Runtime (yana-rt)...',
			allUpToDate: (sVer, rtVer) => `Yana Studio (v${sVer}) và Yana Runtime (v${rtVer || '?'}) đều đang ở phiên bản mới nhất.`,
			studioFound: (newVer, curVer) => `Đã có bản phát hành mới cho Yana Studio: studio-v${newVer} (bản đang chạy: v${curVer})!`,
			runtimeFound: (newVer, curVer) => `Đã có bản cập nhật lõi Yana Runtime mới: rt-v${newVer} (bản trên máy: v${curVer || 'chưa có'})!`,
			btnDownloadStudio: 'Tải bản cài đặt (DMG / Installer)',
			btnUpdateRuntime: 'Cập nhật lõi ngay',
			btnChangelog: 'Xem chi tiết',
			btnLater: 'Để sau',
			updatingRuntime: (v) => `Đang nâng cấp lõi yana-rt lên v${v}...`,
			runtimeSuccess: (v) => `Đã cập nhật lõi Yana Runtime (yana-rt) thành công lên v${v}!`,
			runtimeFailed: (v, err) => `Không thể tự động cập nhật yana-rt lên v${v}: ${err}. Vui lòng mở Terminal chạy: cargo install yana-rt --force`,
			btnOpenTerminal: 'Mở Terminal',
			noRuntimeFound: 'Chưa tìm thấy binary yana-rt trên máy. Bạn có thể cài đặt bằng lệnh: cargo install yana-rt'
		};
	}
	if (lang.startsWith('ko')) {
		return {
			checking: 'Yana Studio 및 Yana Runtime (yana-rt) 업데이트를 확인하는 중...',
			allUpToDate: (sVer, rtVer) => `Yana Studio (v${sVer}) 및 Yana Runtime (v${rtVer || '?'}) 모두 최신 버전입니다.`,
			studioFound: (newVer, curVer) => `Yana Studio 새 버전이 출시되었습니다: studio-v${newVer} (현재: v${curVer})!`,
			runtimeFound: (newVer, curVer) => `Yana Runtime 코어 새 업데이트가 있습니다: rt-v${newVer} (설치된 버전: v${curVer || '없음'})!`,
			btnDownloadStudio: '설치 파일 다운로드 (DMG / Installer)',
			btnUpdateRuntime: '코어 지금 업데이트',
			btnChangelog: '릴리스 정보',
			btnLater: '나중에',
			updatingRuntime: (v) => `yana-rt 코어를 v${v}(으)로 업데이트 중...`,
			runtimeSuccess: (v) => `Yana Runtime (yana-rt) 코어가 v${v}(으)로 성공적으로 업데이트되었습니다!`,
			runtimeFailed: (v, err) => `yana-rt v${v} 자동 업데이트 실패: ${err}. 터미널에서 실행: cargo install yana-rt --force`,
			btnOpenTerminal: '터미널 열기',
			noRuntimeFound: '머신에서 yana-rt 바이너리를 찾을 수 없습니다. 다음 명령으로 설치할 수 있습니다: cargo install yana-rt'
		};
	}
	return {
		checking: 'Checking for updates for Yana Studio and Yana Runtime (yana-rt)...',
		allUpToDate: (sVer, rtVer) => `Yana Studio (v${sVer}) and Yana Runtime (v${rtVer || '?'}) are both up to date.`,
		studioFound: (newVer, curVer) => `A new release of Yana Studio is available: studio-v${newVer} (running: v${curVer})!`,
		runtimeFound: (newVer, curVer) => `A new Yana Runtime core update is available: rt-v${newVer} (installed: v${curVer || 'none'})!`,
		btnDownloadStudio: 'Download Installer (DMG / App)',
		btnUpdateRuntime: 'Update Core Now',
		btnChangelog: 'View Details',
		btnLater: 'Later',
		updatingRuntime: (v) => `Upgrading yana-rt core to v${v}...`,
		runtimeSuccess: (v) => `Successfully updated Yana Runtime (yana-rt) core to v${v}!`,
		runtimeFailed: (v, err) => `Could not auto-update yana-rt to v${v}: ${err}. Please run in Terminal: cargo install yana-rt --force`,
		btnOpenTerminal: 'Open Terminal',
		noRuntimeFound: 'No yana-rt binary found. You can install it via: cargo install yana-rt'
	};
}

async function fetchLatestStudioRelease() {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 6000);
		const res = await fetch(GITHUB_RELEASES_API, {
			signal: controller.signal,
			headers: { 'User-Agent': 'Yana-Studio-Desktop' }
		}).catch(() => null);
		clearTimeout(timer);
		if (!res || !res.ok) return null;
		const releases = await res.json().catch(() => []);
		if (!Array.isArray(releases)) return null;

		for (const r of releases) {
			const tag = r.tag_name || '';
			const match = tag.match(/^studio-v(\d+\.\d+\.\d+)/i);
			if (match) {
				return {
					tag,
					version: match[1],
					url: r.html_url || `https://github.com/yanacuti1121/Yana-AI/releases/tag/${tag}`,
					body: r.body || '',
					assets: r.assets || []
				};
			}
		}
		return null;
	} catch {
		return null;
	}
}

async function fetchLatestRuntimeVersion() {
	// Ưu tiên 1: crates.io
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 6000);
		const res = await fetch(CRATES_IO_YANA_RT_API, {
			signal: controller.signal,
			headers: { 'User-Agent': 'yana-ide (phamlongh230@gmail.com)' }
		}).catch(() => null);
		clearTimeout(timer);
		if (res && res.ok) {
			const data = await res.json().catch(() => null);
			const newest = data?.crate?.newest_version || data?.crate?.max_version;
			if (newest) {
				return {
					version: newest,
					url: `https://crates.io/crates/yana-rt/${newest}`,
					source: 'crates.io'
				};
			}
		}
	} catch {
		// Thử tiếp qua GitHub tags
	}

	// Ưu tiên 2: GitHub releases có tag rt-v*
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 6000);
		const res = await fetch(GITHUB_RELEASES_API, {
			signal: controller.signal,
			headers: { 'User-Agent': 'Yana-Studio-Desktop' }
		}).catch(() => null);
		clearTimeout(timer);
		if (!res || !res.ok) return null;
		const releases = await res.json().catch(() => []);
		if (Array.isArray(releases)) {
			for (const r of releases) {
				const tag = r.tag_name || '';
				const match = tag.match(/^rt-v(\d+\.\d+\.\d+)/i);
				if (match) {
					return {
						version: match[1],
						url: r.html_url || `https://github.com/yanacuti1121/Yana-AI/releases/tag/${tag}`,
						source: 'github'
					};
				}
			}
		}
	} catch {
		// Bỏ qua
	}
	return null;
}

async function checkStudioUpdate(silent, t) {
	const release = await fetchLatestStudioRelease();
	if (!release) return false;

	if (compareSemver(release.version, STUDIO_CURRENT_VERSION) > 0) {
		const choice = await vscode.window.showInformationMessage(
			t.studioFound(release.version, STUDIO_CURRENT_VERSION),
			t.btnDownloadStudio,
			t.btnChangelog,
			t.btnLater
		);
		if (choice === t.btnDownloadStudio || choice === t.btnChangelog) {
			vscode.env.openExternal(vscode.Uri.parse(release.url));
		}
		return true;
	}
	return false;
}

async function checkRuntimeUpdate(silent, t) {
	const currentRtVersion = await getRuntimeVersion();
	const remoteRt = await fetchLatestRuntimeVersion();

	if (!remoteRt) return false;

	// Nếu chưa cài hoặc bản remote mới hơn bản trên máy
	if (!currentRtVersion || compareSemver(remoteRt.version, currentRtVersion) > 0) {
		const choice = await vscode.window.showInformationMessage(
			t.runtimeFound(remoteRt.version, currentRtVersion),
			t.btnUpdateRuntime,
			t.btnChangelog,
			t.btnLater
		);
		if (choice === t.btnUpdateRuntime) {
			await performRuntimeUpdate(remoteRt.version, t);
		} else if (choice === t.btnChangelog && remoteRt.url) {
			vscode.env.openExternal(vscode.Uri.parse(remoteRt.url));
		}
		return true;
	}
	return false;
}

async function performRuntimeUpdate(targetVersion, t) {
	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: t.updatingRuntime(targetVersion),
		cancellable: false
	}, async (progress) => {
		progress.report({ message: 'Compiling / updating yana-rt core...' });

		const root = workspaceRoot();
		const home = os.homedir();
		const localBin = path.join(home, '.local', 'bin');
		const localRt = path.join(localBin, 'yana-rt');

		// 1. Kiểm tra nếu workspace hiện tại có Cargo.toml của yana-rt và đã build release target
		let updated = false;
		if (root) {
			const targetReleaseBin = path.join(root, 'target', 'release', 'yana-rt');
			if (fs.existsSync(targetReleaseBin)) {
				try {
					if (!fs.existsSync(localBin)) fs.mkdirSync(localBin, { recursive: true });
					if (fs.existsSync(localRt)) fs.unlinkSync(localRt);
					fs.copyFileSync(targetReleaseBin, localRt);
					fs.chmodSync(localRt, 0o755);
					updated = true;
				} catch (err) {
					console.error('[Yana Update] Failed to copy local release binary:', err);
				}
			}
		}

		// 2. Nếu chưa xong, chạy cargo install
		if (!updated) {
			await new Promise((resolve) => {
				const cmd = `cargo install yana-rt --force`;
				exec(cmd, { env: process.env, timeout: 180000 }, (error) => {
					if (!error) {
						// Nếu cargo install thành công vào ~/.cargo/bin/yana-rt, đồng bộ sang ~/.local/bin/yana-rt
						const cargoBin = path.join(home, '.cargo', 'bin', 'yana-rt');
						if (fs.existsSync(cargoBin)) {
							try {
								if (!fs.existsSync(localBin)) fs.mkdirSync(localBin, { recursive: true });
								if (fs.existsSync(localRt)) fs.unlinkSync(localRt);
								fs.copyFileSync(cargoBin, localRt);
								fs.chmodSync(localRt, 0o755);
							} catch {}
						}
					}
					resolve();
				});
			});
		}

		// Kiểm tra lại phiên bản mới sau cập nhật
		const newVer = await getRuntimeVersion();
		if (newVer && compareSemver(newVer, targetVersion) >= 0) {
			vscode.window.showInformationMessage(t.runtimeSuccess(newVer));
			// Làm mới trạng thái runtime trên status bar và panel
			try {
				await vscode.commands.executeCommand('yana.runtime.refresh');
				await vscode.commands.executeCommand('yana.models.refresh');
			} catch {}
		} else {
			const choice = await vscode.window.showErrorMessage(
				t.runtimeFailed(targetVersion, newVer ? `v${newVer} vẫn cũ` : 'không tìm thấy binary'),
				t.btnOpenTerminal,
				t.btnLater
			);
			if (choice === t.btnOpenTerminal) {
				const term = vscode.window.createTerminal('Yana Core Update');
				term.show();
				term.sendText(`cargo install yana-rt --force && cp ~/.cargo/bin/yana-rt ~/.local/bin/yana-rt 2>/dev/null || true`);
			}
		}
	});
}

async function checkForUpdates(silent = false) {
	const lang = getActiveLanguage();
	const t = getI18n(lang);

	if (!silent) {
		vscode.window.setStatusBarMessage(`$(sync~spin) ${t.checking}`, 4000);
	}

	try {
		// Kiểm tra lần lượt cả hai kênh độc lập
		const studioHasUpdate = await checkStudioUpdate(silent, t);
		const runtimeHasUpdate = await checkRuntimeUpdate(silent, t);

		if (!silent && !studioHasUpdate && !runtimeHasUpdate) {
			const currentRtVersion = await getRuntimeVersion();
			vscode.window.showInformationMessage(t.allUpToDate(STUDIO_CURRENT_VERSION, currentRtVersion));
		}
	} catch (error) {
		if (!silent) {
			const currentRtVersion = await getRuntimeVersion();
			vscode.window.showInformationMessage(t.allUpToDate(STUDIO_CURRENT_VERSION, currentRtVersion));
		}
	}
}

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('yana.updates.check', () => checkForUpdates(false))
	);

	// Kiểm tra khi khởi động ứng dụng (nếu cấu hình bật)
	const checkOnStartup = vscode.workspace.getConfiguration('yana.updates').get('checkOnStartup', true);
	if (checkOnStartup) {
		setTimeout(() => checkForUpdates(true), 10000);
	}
}

module.exports = {
	id: 'updates',
	activate,
	checkForUpdates,
	STUDIO_CURRENT_VERSION,
	parseSemver,
	compareSemver,
	getRuntimeVersion,
	fetchLatestStudioRelease,
	fetchLatestRuntimeVersion,
	checkStudioUpdate,
	checkRuntimeUpdate,
	performRuntimeUpdate
};
