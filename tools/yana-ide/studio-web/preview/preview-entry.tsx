// Trang xem thử màn Start. Mọi số trong SAMPLE là dữ liệu mẫu để nhìn bố cục; màn thật nhận dữ liệu từ yana-rt.
// Danh sách lối tắt chép đúng từ extensions/yana-agent/features/home.js (5 nhóm, 22 mục).
import { createRoot } from 'react-dom/client';

import { StartScreen, type StartData } from '../start-screen';
import './preview.css';

const item = (id: string, label: string, value: string, description = ''): { id: string; label: string; value: string; description: string } => ({ id, label, value, description });

const SAMPLE: StartData = {
	status: { editor: 'VS Code 1.141.0', runtime: 'yana-rt 1.5.2', audit: { allow: 500, deny: 0, total: 500 } },
	sections: [
		{ name: 'Chat', actions: [
			item('home', 'Yana Home', 'yana.welcome.open', 'The start page'),
			item('guide', 'User guide', 'yana.guide.open', 'Step-by-step manual'),
			item('prefs', 'Yana IDE settings', 'yana.idePreferences.open', 'Guide, approvals, assistant'),
			item('cc', 'Yana Control Center', 'yana.controlCenter.open', 'Live status of every Yana part'),
			item('focus', 'Open Yana chat', 'yana.focus', 'Right-hand panel. ⌘L'),
			item('new', 'New conversation', 'yana.chat.new'),
			item('history', 'Open a past conversation…', 'yana.chat.history'),
		] },
		{ name: 'Design & Office', actions: [
			item('canvas-new', 'New Design Canvas', 'yana.canvas.new', 'AI builds screens live; any model'),
			item('canvas-open', 'Open a design canvas…', 'yana.canvas.open'),
			item('studio-canvas', 'Studio Canvas (component editor)', 'yana.studio.canvas', 'From Yana Studio: 22 components, layers, AI edits'),
			item('office', 'Yana Office (slides & docs)', 'yana.office.open', 'Slides, reports, PowerPoint, Word & Excel'),
		] },
		{ name: 'Models & settings', actions: [
			item('model', 'Choose model', 'yana.pickModel'),
			item('key', 'Add an API key', 'yana.setApiKey'),
			item('settings', 'Yana Settings', 'yana.settings.open'),
		] },
		{ name: 'Project', actions: [
			item('memory', 'Project Memory', 'yana.memory.open', 'Sent with every conversation'),
			item('pin', 'Pin a command', 'yana.runCommands.add'),
			item('run-pinned', 'Run a pinned command…', 'yana.runCommands.pick'),
			item('tasks', 'Tasks board', 'yana.tasks.open', 'Dependencies and evidence'),
			item('task-new', 'New task', 'yana.tasks.create'),
		] },
		{ name: 'Check & govern', actions: [
			item('doctor', 'Doctor', 'yana.tool.doctor', 'Environment and dependencies'),
			item('scan', 'Scan agent setup', 'yana.tool.scan'),
			item('perms', 'Permissions', 'yana.permissions.open', 'Leases, grant, pending approvals'),
			item('hunt', 'Hunt vulnerabilities', 'yana.tool.hunt'),
			item('ref', 'Yana commands reference', 'yana.commandReference'),
		] },
	],
};

const DOWN: StartData = { ...SAMPLE, status: { editor: 'VS Code 1.141.0', runtime: null, audit: null }, sections: SAMPLE.sections.slice(0, 1) };

function Preview() {
	return (
		<div className="flex flex-wrap items-start gap-8 p-6">
			<div>
				<p className="mb-2 text-cline-ui-sm text-cline-ui-muted-foreground">Start, yana-rt running (sample data)</p>
				<div className="frame"><StartScreen data={SAMPLE} onRun={() => undefined} /></div>
			</div>
			<div>
				<p className="mb-2 text-cline-ui-sm text-cline-ui-muted-foreground">Start, yana-rt not running (empty state)</p>
				<div className="frame"><StartScreen data={DOWN} onRun={() => undefined} /></div>
			</div>
		</div>
	);
}

const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<Preview />);
