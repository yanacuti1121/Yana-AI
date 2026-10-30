'use strict';
// Biến ảnh chụp của `yana-rt status --json` thành các dòng cho view Status. Không dùng `vscode`,
// nên test chạy thẳng bằng node (tests/status-model.test.cjs). Chỉ đọc những trường đã biết:
// lệnh hoặc nội dung hội thoại không bao giờ được đưa lên giao diện.

const SCHEMA = 1;
const MAX_TEXT = 120;
const MS_PER_MINUTE = 60 * 1000;
const COUNTABLE = new Set(['Claude Code']); // chạy thành nhiều tiến trình cho một phiên, nên số đếm dễ gây hiểu nhầm với tên khác

const STATES = {
	halted: { icon: 'error', label: 'Halted by Giám Thị' },
	ask: { icon: 'bell', label: 'Needs your decision' },
	deny: { icon: 'circle-slash', label: 'Just blocked a call' },
	run: { icon: 'play-circle', label: 'Sessions are running' },
	idle: { icon: 'circle-outline', label: 'Nothing running' },
	unknown: { icon: 'question', label: 'Unknown: a source could not be read' },
};
const DECISION_ICON = { allow: 'pass', deny: 'error', block: 'error', warn: 'warning' };

function clean(value, limit = MAX_TEXT) {
	const flat = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
	return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function expiresIn(iso, now) {
	const left = Date.parse(iso) - now.getTime();
	if (!Number.isFinite(left)) return '';
	if (left <= 0) return 'expired';
	return `${Math.max(1, Math.round(left / MS_PER_MINUTE))} min left`;
}

function engineLabel(engine) {
	const name = clean(engine?.name, 40);
	return engine?.count > 1 && COUNTABLE.has(name) ? `${name} ×${engine.count}` : name;
}

function groupRow(label, icon, children, description) {
	return { label, icon, description: description ?? String(children.length), children };
}

function approvalRows(list, now) {
	return list.map(item => ({
		label: clean(item?.capability, 40) || 'approval',
		icon: 'shield',
		description: expiresIn(item?.expires_at, now),
		tooltip: `${clean(item?.reason)}\nApprove or deny at the terminal (yana-rt authority).`,
	}));
}

function auditRows(list) {
	return list.map(entry => ({
		label: clean(entry?.tool, 40) || '?',
		icon: DECISION_ICON[String(entry?.decision).toLowerCase()] || 'circle-outline',
		description: clean(entry?.decision, 20),
		tooltip: clean(entry?.ts, 40),
	}));
}

/** Rows for the Status view, and how many things need a person (for the badge). */
function toRows(snapshot, now = new Date()) {
	if (!snapshot || snapshot.schema !== SCHEMA) {
		const found = snapshot && snapshot.schema !== undefined ? `schema ${clean(snapshot.schema, 10)}` : 'no schema';
		return { rows: [{ label: `Unsupported status format (${found})`, icon: 'warning', tooltip: 'Update Yana Studio or yana-rt so both speak the same status schema.' }], attention: 0, state: 'unknown' };
	}
	const state = STATES[snapshot.state] ? snapshot.state : 'unknown';
	const rows = [{ label: STATES[state].label, icon: STATES[state].icon, description: '', tooltip: 'Headline state, worst first: halted, waiting, blocked, running, idle.' }];
	const approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : [];
	if (approvals.length) rows.push(groupRow('Waiting for you', 'bell', approvalRows(approvals, now)));
	const engines = Array.isArray(snapshot.engines) ? snapshot.engines : [];
	if (engines.length) rows.push(groupRow('Running', 'play-circle', engines.map(engine => ({ label: engineLabel(engine), icon: 'pulse', tooltip: 'The program is alive; this does not say it is busy.' }))));
	const audit = Array.isArray(snapshot.audit) ? snapshot.audit : [];
	if (audit.length) rows.push(groupRow('Recent activity', 'output', auditRows(audit), ''));
	const missing = Array.isArray(snapshot.unavailable) ? snapshot.unavailable.map(name => clean(name, 20)) : [];
	if (missing.length) rows.push({ label: `Could not read: ${missing.join(', ')}`, icon: 'warning', tooltip: 'These sources failed, so the state above may be incomplete.' });
	const attention = Array.isArray(snapshot.attention) ? snapshot.attention.length : 0;
	return { rows, attention, state };
}

/** Rows to show when the command itself failed; null means "not something we can explain". */
function failureRows(error) {
	const message = String(error?.message || '');
	if (/unrecognized subcommand/i.test(message)) {
		return [{ label: 'This yana-rt has no "status" command', icon: 'warning', tooltip: 'Update yana-rt to a version that includes "yana-rt status", or set yana.runtimePath to one that does.' }];
	}
	return null;
}

module.exports = { toRows, failureRows, clean, engineLabel, expiresIn, SCHEMA };
