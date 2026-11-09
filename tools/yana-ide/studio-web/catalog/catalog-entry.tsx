// Danh mục toàn bộ component Cline đã lấy, chạy các ví dụ mẫu của chính Cline với màu Yana.
// Chạy từng ví dụ thật (không dùng Storybook): mỗi file *.stories.tsx xuất meta và các story; ở đây render chúng trực tiếp.
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import './catalog.css';

/* eslint-disable @typescript-eslint/no-explicit-any */
const MODULES = import.meta.glob('../vendor/cline-ui/stories/*.stories.tsx', { eager: true }) as Record<string, any>;

interface Entry { id: string; title: string; group: string; meta: any; stories: [string, any][]; }

const humanize = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

const ENTRIES: Entry[] = Object.entries(MODULES)
	.map(([file, mod]) => {
		const meta = mod.default || {};
		const title: string = meta.title || file.split('/').pop()!.replace('.stories.tsx', '');
		const [group] = title.split('/');
		const stories = Object.entries(mod).filter(([key]) => key !== 'default') as [string, any][];
		return { id: title, title, group: title.includes('/') ? group : 'Other', meta, stories };
	})
	.sort((a, b) => a.title.localeCompare(b.title));

class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
	state = { error: null as string | null };
	static getDerivedStateFromError(error: Error) { return { error: String(error?.stack || error).slice(0, 700) }; }
	componentDidCatch(_error: Error, _info: ErrorInfo) { /* hiển thị ở render */ }
	render() { return this.state.error ? <div className="story__error">{this.state.error}</div> : this.props.children; }
}

function StoryView({ meta, story, name }: { meta: any; story: any; name: string }) {
	const Final = useMemo(() => {
		const args = { ...(meta.args || {}), ...((typeof story === 'object' && story.args) || {}) };
		const ctx = { args, argTypes: meta.argTypes || {}, globals: {}, parameters: { ...(meta.parameters || {}), ...((typeof story === 'object' && story.parameters) || {}) }, viewMode: 'story', id: name, name, title: meta.title };
		// Story có hai dạng: đối tượng ({ args, render }) hoặc hàm trả về JSX (như agent-chat.stories.tsx).
		const render = typeof story === 'function' ? () => story(args, ctx) : story.render ? () => story.render(args, ctx) : null;
		const base = () => (render ? render() : meta.component ? <meta.component {...args} /> : null);
		const decorators = typeof story === 'function' ? [...(meta.decorators || [])] : [...(story.decorators || []), ...(meta.decorators || [])];
		return decorators.reduce((Inner: () => ReactNode, decorator: any) => () => decorator(Inner, ctx), base) as () => ReactNode;
	}, [meta, story, name]);
	return <Final />;
}

function Catalog() {
	const [current, setCurrent] = useState(() => decodeURIComponent(location.hash.slice(1)) || ENTRIES[0]?.id);
	useEffect(() => { location.hash = encodeURIComponent(current); }, [current]);
	const entry = ENTRIES.find(item => item.id === current) || ENTRIES[0];
	const groups = [...new Set(ENTRIES.map(item => item.group))];
	const description = entry?.meta?.parameters?.docs?.description?.component as string | undefined;
	return (
		<div className="catalog">
			<nav className="catalog__nav" aria-label="Components">
				<h1>Yana UI catalog</h1>
				<p>{ENTRIES.length} component sets from Cline's interface, in Yana colors. {ENTRIES.reduce((n, item) => n + item.stories.length, 0)} examples.</p>
				{groups.map(group => (
					<div key={group}>
						<div className="catalog__group">{group}</div>
						{ENTRIES.filter(item => item.group === group).map(item => (
							<button className="catalog__item" key={item.id} type="button" aria-current={item.id === entry?.id} onClick={() => setCurrent(item.id)}>
								{item.title.includes('/') ? item.title.split('/').slice(1).join('/') : item.title}
							</button>
						))}
					</div>
				))}
			</nav>
			<main className="catalog__main">
				{entry && (
					<>
						<h2>{entry.title}</h2>
						{description ? <p className="catalog__desc">{description}</p> : null}
						{entry.stories.map(([key, story]) => (
							<section className="story" key={key}>
								<div className="story__label">{(typeof story === 'object' && story.name) || humanize(key)}</div>
								<div className="story__body"><Guard><StoryView meta={entry.meta} story={story} name={key} /></Guard></div>
							</section>
						))}
					</>
				)}
			</main>
		</div>
	);
}

const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<Catalog />);
