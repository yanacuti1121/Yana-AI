// Màn "Start" của Yana, dựng bằng component Cline đã lấy (vendor/cline-ui). Thuần trình bày: nhận dữ liệu qua props.
// Host (extension) sẽ gửi dữ liệu thật; chỗ nào chưa có thì hiện "unavailable", không điền số giả.
import { AgentQuickActions, type AgentQuickAction } from './vendor/cline-ui/components/agent-quick-actions';
import { AgentWelcomeHero } from './vendor/cline-ui/components/agent-welcome-hero';
import { SessionStatus } from './vendor/cline-ui/components/session-status';

export interface StartSection {
	name: string;
	actions: AgentQuickAction[];
}

export interface StartStatus {
	editor: string | null; // ví dụ "VS Code 1.141.0"
	runtime: string | null; // ví dụ "yana-rt 1.5.2"; null khi yana-rt không chạy
	audit: { allow: number; deny: number; total: number } | null; // null khi chưa đọc được audit
}

export interface StartData {
	sections: StartSection[];
	status: StartStatus;
}

const UNAVAILABLE = 'unavailable';

function Core({ title, value, running }: { title: string; value: string | null; running: boolean }) {
	return (
		<div className="min-w-0 rounded-cline-ui-md bg-cline-ui-muted px-2.5 py-2">
			<div className="text-cline-ui-xs text-cline-ui-muted-foreground">{title}</div>
			<div className="mt-0.5 truncate text-cline-ui-sm font-cline-ui-semibold text-cline-ui-foreground">{value ?? UNAVAILABLE}</div>
			<SessionStatus className="mt-1" label={running ? 'running' : 'not running'} tone={running ? 'running' : 'error'} />
		</div>
	);
}

function StatusCard({ status }: { status: StartStatus }) {
	const audit = status.audit;
	return (
		<div className="rounded-cline-ui-lg border border-cline-ui-border bg-cline-ui-card p-3">
			<div className="grid grid-cols-2 gap-2">
				<Core title="Editor core" value={status.editor} running={status.editor !== null} />
				<Core title="Yana core" value={status.runtime} running={status.runtime !== null} />
			</div>
			<p className="mt-2 text-cline-ui-xs text-cline-ui-muted-foreground">
				{audit ? `Audit: ${audit.allow} allowed, ${audit.deny} denied (last ${audit.total})` : `Audit: ${UNAVAILABLE}`}
			</p>
		</div>
	);
}

export function StartScreen({ data, onRun }: { data: StartData; onRun: (command: string) => void }) {
	return (
		<main className="yana-start flex flex-col gap-4 p-3 text-cline-ui-foreground">
			<AgentWelcomeHero />
			<StatusCard status={data.status} />
			{data.sections.map(section => (
				<section key={section.name} aria-label={section.name}>
					<h2 className="mb-1.5 px-1 text-cline-ui-xs font-cline-ui-semibold uppercase tracking-wider text-cline-ui-muted-foreground">{section.name}</h2>
					<AgentQuickActions actions={section.actions} onSelect={action => onRun(action.value)} />
				</section>
			))}
		</main>
	);
}
