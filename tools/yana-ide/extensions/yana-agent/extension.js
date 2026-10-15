'use strict';
// Panel Yana ở thanh bên phải: chat qua yana-rt, vệt tool call, thẻ duyệt của con người.
// Chỉ hiển thị sự kiện yana-rt thật sự phát ra. Không có số liệu, tiến độ hay diff giả.

const vscode = require('vscode');
const crypto = require('node:crypto');
const path = require('node:path');
const { resolveBinary, runtimeVersion, startTurn, supportsTurnControls } = require('./runtime');
const models = require('./features/models');
const { memorySystem } = require('./features/project');
const { instructionsOf, composeSystem } = require('./features/assistant-system');
const usage = require('./features/usage');
const conversations = require('./features/conversations');
const approvalStore = require('./features/approval-store');
const auditLog = require('./features/audit-log');
const changes = require('./features/changes');
const edits = require('./features/edits');
const { EDIT_INSTRUCTIONS } = require('./features/edit-protocol');
const MAX_HISTORY_MESSAGES = 40; // 20 lượt hỏi đáp gần nhất gửi kèm làm ngữ cảnh
// Chỉ dùng khi yana-rt quá cũ để chặn ghi thật: lúc đó Plan chỉ là lời nhờ model.
const PLAN_HINT = '[Plan Mode - Do not edit any files or execute write commands. Only analyze and provide a step-by-step plan]';

class YanaPanel {
	constructor(context) {
		this.context = context;
		this.view = undefined;
		this.shownId = undefined; // hội thoại panel đang hiển thị
		this.active = undefined;
		this.binary = '';
		this.version = '';
	}

	config() {
		const cfg = vscode.workspace.getConfiguration('yana');
		return { provider: cfg.get('provider', 'ollama'), model: cfg.get('model', ''), baseUrl: cfg.get('baseUrl', ''), runtimePath: cfg.get('runtimePath', '') };
	}

	async refreshRuntime() {
		this.binary = resolveBinary(this.config().runtimePath);
		this.version = await runtimeVersion(this.binary);
		this.postState();
	}

	postState() {
		const { provider, model } = this.config();
		const folder = vscode.workspace.workspaceFolders?.[0];
		this.post({
			type: 'state',
			runtime: { found: Boolean(this.binary), version: this.version, path: this.binary },
			provider,
			model,
			workspace: folder ? folder.name : '',
			busy: Boolean(this.active),
			trusted: vscode.workspace.isTrusted,
			capabilities: {
				approvalPreview: true,
				filePatch: false,
				modes: false,
				reasoningEffort: false,
				temperature: false,
				maxTokens: false,
				toolAllowlist: false,
				mentions: true,
				assistants: true,
				voice: { input: false, output: false },
				office: { slides: true, pdf: false }
			}
		});
	}

	post(message) {
		this.view?.webview.postMessage(message);
	}

	// Vẽ lại feed khi người dùng chuyển sang hội thoại khác (không vẽ lại khi chỉ thêm lượt mới).
	showConversation(force) {
		const current = conversations.active();
		if (!force && current?.id === this.shownId) return;
		this.shownId = current?.id;
		this.post({ type: 'conversation', title: current?.title || 'New conversation', messages: current?.messages || [] });
	}

	// System prompt của hội thoại mới: Project Memory + hướng dẫn của trợ lý đang chọn.
	systemFor(root) {
		const items = this.context.globalState.get('yana.assistants.v1', this.defaultAssistants());
		const selectedId = this.context.globalState.get('yana.assistants.selected', items[0]?.id || '');
		const base = composeSystem(memorySystem(root), instructionsOf(items, selectedId));
		return base ? `${base}\n\n${EDIT_INSTRUCTIONS}` : EDIT_INSTRUCTIONS;
	}

	async newConversation() {
		if (this.active) return;
		const folder = vscode.workspace.workspaceFolders?.[0];
		await conversations.create(this.systemFor(folder?.uri.fsPath));
		this.showConversation(true);
	}

	resolveWebviewView(view) {
		this.view = view;
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		view.webview.options = { enableScripts: true, localResourceRoots: [media] };
		view.webview.html = this.html(view.webview, media);
		view.webview.onDidReceiveMessage(message => this.onMessage(message));
		this.refreshRuntime();
	}

	html(webview, media) {
		const nonce = crypto.randomBytes(16).toString('base64');
		const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
		const markdown = webview.asWebviewUri(vscode.Uri.joinPath(media, 'markdown.js'));
		const assistantsJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'assistants.js'));
		const voiceJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'voice.js'));
		const mentionsJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'mentions.js'));
		const auditViewJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'audit-view.js'));
		const editsJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'edits.js'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
		const emblem = webview.asWebviewUri(vscode.Uri.joinPath(media, 'yana-emblem.svg'));
		const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: blob: https:; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};`;
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}"></head>
<body data-emblem="${emblem}"><div id="app"></div><script nonce="${nonce}" src="${markdown}"></script><script nonce="${nonce}" src="${assistantsJs}"></script><script nonce="${nonce}" src="${voiceJs}"></script><script nonce="${nonce}" src="${mentionsJs}"></script><script nonce="${nonce}" src="${auditViewJs}"></script><script nonce="${nonce}" src="${editsJs}"></script><script nonce="${nonce}" src="${js}"></script></body></html>`;
	}

	async onMessage(message) {
		switch (message?.type) {
			case 'ready': {
				this.showConversation(true);
				this.postAssistants();
				return this.refreshRuntime();
			}
			case 'home': return vscode.commands.executeCommand('yana.welcome.open');
			case 'onboarding':
			case 'openOnboarding': return vscode.commands.executeCommand('yana.onboarding.open');
			case 'guide':
			case 'openGuide': return vscode.commands.executeCommand('yana.guide.open');
			case 'history': return vscode.commands.executeCommand('yana.chat.history');
			case 'settings': return vscode.commands.executeCommand('yana.settings.open');
			case 'send': return this.send(String(message.text || ''), Array.isArray(message.images) ? message.images : [], message.mode === 'plan' ? 'plan' : 'act', Array.isArray(message.files) ? message.files : []);
			case 'decide': return this.decide(String(message.approvalId || ''), message.decision === true);
			case 'stop': return this.active?.stop();
			case 'editApply': {
				const res = await edits.apply(message.id);
				this.post({ type: 'editResult', id: message.id, ok: res.ok, error: res.error });
				return;
			}
			case 'editReject': {
				edits.reject(message.id);
				this.post({ type: 'editResult', id: message.id, ok: false, error: 'Rejected' });
				return;
			}
			case 'editPreview': {
				try {
					await edits.preview(message.id);
				} catch (err) {
					vscode.window.showErrorMessage(`Yana edit preview: ${err.message}`);
				}
				return;
			}
			case 'reset': return this.newConversation();
			case 'pickModel': return vscode.commands.executeCommand('yana.pickModel');
			case 'setKey': return vscode.commands.executeCommand('yana.setApiKey');
			case 'manageTrust': return vscode.commands.executeCommand('workbench.trust.manage');
			case 'openFile': {
				if (message.path) {
					const folder = vscode.workspace.workspaceFolders?.[0];
					let fullPath = String(message.path).trim();
					if (!path.isAbsolute(fullPath) && folder) {
						fullPath = path.join(folder.uri.fsPath, fullPath);
					}
					const uri = vscode.Uri.file(fullPath);
					return vscode.window.showTextDocument(uri).then(undefined, () => {
						vscode.commands.executeCommand('vscode.open', uri);
					});
				}
				return;
			}
			case 'openSettings': return vscode.commands.executeCommand('yana.modelsRuntime.open');
			case 'droppedUri': return this.handleDroppedUri(String(message.uri || ''));
			case 'exportPresentation':
			case 'exportPresentationHtml': return this.exportPresentation(message.deck);
			case 'openOffice': return vscode.commands.executeCommand('yana.office.open');
			case 'newCanvas': return vscode.commands.executeCommand('yana.canvas.new');
			case 'openTasks': return vscode.commands.executeCommand('yana.tasks.open');
			case 'openMemory': return vscode.commands.executeCommand('yana.memory.open');
			case 'openPermissions': return vscode.commands.executeCommand('yana.permissions.open');
			case 'assistants.list': return this.postAssistants();
			case 'assistants.save': return this.saveAssistant(message.assistant);
			case 'assistants.delete': return this.deleteAssistant(message.id);
			case 'assistants.select': return this.selectAssistant(message.id);
			case 'mention.query': return this.queryMentions(String(message.text || ''));
			case 'voice.start':
			case 'voice.stop':
			case 'voice.speak': {
				this.post({ type: 'voice.state', phase: 'idle', cloud: false, error: 'Voice runtime not configured (see Settings)' });
				return;
			}
			case 'audit.load': this.post(auditLog.loadForView()); return;
			case 'office.export': return message.kind === 'audit' ? auditLog.exportLog() : undefined;
			// Công cụ chẩn đoán chạy trong terminal riêng, chỉ các tên cố định này.
			case 'runTool': return /^(doctor|scan|hunt|score|map|ci|cost)$/.test(String(message.tool)) ? vscode.commands.executeCommand(`yana.tool.${message.tool}`) : undefined;
			case 'buildScreen': {
				const taskText = `Implement the UI design from screen "${message.name || 'Canvas Screen'}" as clean, modular code for this project.\n\nHTML Preview:\n\`\`\`html\n${message.html}\n\`\`\``;
				return this.send(taskText, []);
			}
			case 'voiceInput': {
				vscode.window.showInformationMessage('Yana Voice: Speech input (whisper.cpp / cloud) is configured in Settings (F1-F4).', 'Open Settings')
					.then(choice => { if (choice === 'Open Settings') vscode.commands.executeCommand('yana.settings.open'); });
				return;
			}
			default: return undefined;
		}
	}

	defaultAssistants() {
		return [
			{
				id: 'ast_careful',
				name: 'Careful Reviewer',
				description: 'Plans carefully, explains logic before changes',
				provider: 'anthropic',
				model: 'claude-3-5-sonnet-20241022',
				mode: 'act',
				instructions: 'Be thorough, verify evidence before making claims, and prioritize safety.',
				tools: { write: true, run: true }
			},
			{
				id: 'ast_fast',
				name: 'Fast Coder',
				description: 'Quick iterations, minimal explanations',
				provider: 'openai',
				model: 'gpt-4o',
				mode: 'act',
				instructions: 'Provide concise, production-ready code with minimal overhead.',
				tools: { write: true, run: true }
			}
		];
	}

	async postAssistants() {
		const items = this.context.globalState.get('yana.assistants.v1', this.defaultAssistants());
		const selectedId = this.context.globalState.get('yana.assistants.selected', items[0]?.id || '');
		this.post({ type: 'assistants', items, selectedId });
	}

	async saveAssistant(assistant) {
		if (!assistant || !assistant.name) return;
		let items = this.context.globalState.get('yana.assistants.v1', this.defaultAssistants());
		const idx = items.findIndex(a => a.id === assistant.id);
		if (idx >= 0) {
			items[idx] = assistant;
		} else {
			if (items.length >= 30) items = items.slice(0, 29);
			items.push(assistant);
		}
		await this.context.globalState.update('yana.assistants.v1', items);
		this.post({ type: 'assistants.result', ok: true, id: assistant.id });
		this.postAssistants();
	}

	async deleteAssistant(id) {
		let items = this.context.globalState.get('yana.assistants.v1', this.defaultAssistants());
		items = items.filter(a => a.id !== id);
		await this.context.globalState.update('yana.assistants.v1', items);
		let selectedId = this.context.globalState.get('yana.assistants.selected', '');
		if (selectedId === id) {
			selectedId = items[0]?.id || '';
			await this.context.globalState.update('yana.assistants.selected', selectedId);
		}
		this.post({ type: 'assistants.result', ok: true });
		this.postAssistants();
	}

	async selectAssistant(id) {
		await this.context.globalState.update('yana.assistants.selected', id);
		const items = this.context.globalState.get('yana.assistants.v1', this.defaultAssistants());
		const ast = items.find(a => a.id === id);
		if (ast && ast.provider) {
			const cfg = vscode.workspace.getConfiguration('yana');
			if (ast.provider) await cfg.update('provider', ast.provider, vscode.ConfigurationTarget.Global);
			if (ast.model) await cfg.update('model', ast.model, vscode.ConfigurationTarget.Global);
		}
		this.postAssistants();
		this.refreshRuntime();
	}

	async queryMentions(query) {
		try {
			const pattern = query ? `**/*${query}*` : '**/*';
			const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 20);
			const folder = vscode.workspace.workspaceFolders?.[0];
			const rootPath = folder ? folder.uri.fsPath : '';
			const items = uris.map(u => {
				const relPath = rootPath && u.fsPath.startsWith(rootPath)
					? u.fsPath.slice(rootPath.length).replace(/^[/\\]/, '')
					: u.fsPath;
				return {
					kind: 'file',
					label: u.path.split('/').pop() || relPath,
					path: relPath
				};
			});
			this.post({ type: 'mentions', query, items });
		} catch {
			this.post({ type: 'mentions', query, items: [] });
		}
	}

	async apiKey(provider) {
		return (await this.context.secrets.get(`yana.key.${provider}`)) || '';
	}

	async handleDroppedUri(rawUri) {
		try {
			let uri;
			if (rawUri.startsWith('file://') || rawUri.startsWith('vscode-')) {
				uri = vscode.Uri.parse(rawUri);
			} else if (rawUri.startsWith('/')) {
				uri = vscode.Uri.file(rawUri);
			}
			if (!uri) return;
			const name = uri.path.split('/').pop() || 'file';
			const ext = name.split('.').pop()?.toLowerCase();
			const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
			if (ext && imageExts.includes(ext)) {
				const bytes = await vscode.workspace.fs.readFile(uri);
				const base64 = Buffer.from(bytes).toString('base64');
				const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
				this.view?.webview.postMessage({
					type: 'attachImage',
					image: {
						mimeType,
						data: base64,
						name,
						url: `data:${mimeType};base64,${base64}`
					}
				});
			} else {
				let size = 0;
				let textContent = undefined;
				let base64 = undefined;
				try {
					const stat = await vscode.workspace.fs.stat(uri);
					size = stat.size;
					if (size <= 25 * 1024 * 1024) {
						const bytes = await vscode.workspace.fs.readFile(uri);
						const isText = ['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'html', 'css', 'scss', 'csv', 'sql', 'sh', 'xml'].includes(ext || '');
						if (isText && size <= 500 * 1024) {
							textContent = Buffer.from(bytes).toString('utf8');
						} else {
							base64 = Buffer.from(bytes).toString('base64');
						}
					}
				} catch {}
				this.view?.webview.postMessage({
					type: 'attachFile',
					file: {
						name,
						size,
						path: uri.fsPath,
						textContent,
						data: base64
					}
				});
			}
		} catch (err) {
			console.error('Failed to handle dropped uri:', err);
		}
	}

	async exportPresentation(deck) {
		if (!deck || !Array.isArray(deck.slides)) return;
		const folder = vscode.workspace.workspaceFolders?.[0];
		const sanitizedTitle = (deck.title || 'presentation').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9 -]/g, '').trim() || 'presentation';
		const defaultUri = folder
			? vscode.Uri.joinPath(folder.uri, `${sanitizedTitle}.deck.html`)
			: undefined;

		const targetUri = await vscode.window.showSaveDialog({
			defaultUri,
			filters: { 'Presentation & Slide Deck': ['html', 'pptx'] },
			saveLabel: 'Save Presentation'
		});
		if (!targetUri) return;

		const html = this.generateStandaloneDeckHtml(deck);
		await vscode.workspace.fs.writeFile(targetUri, Buffer.from(html, 'utf8'));

		const jsonUri = targetUri.with({ path: targetUri.path.replace(/\.[^.]+$/, '.presentation.json') });
		await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(deck, null, 2), 'utf8'));

		const action = await vscode.window.showInformationMessage(
			`Presentation exported: ${targetUri.fsPath}. Ready for fullscreen presentation or printing to PDF.`,
			'Open in Browser', 'Show in Finder'
		);
		if (action === 'Open in Browser') {
			vscode.env.openExternal(targetUri);
		} else if (action === 'Show in Finder') {
			vscode.commands.executeCommand('revealFileInOS', targetUri);
		}
	}

	generateStandaloneDeckHtml(deck) {
		const title = deck.title || 'Presentation';
		const slides = Array.isArray(deck.slides) ? deck.slides : [];
		const slidesJson = JSON.stringify(slides);
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #080c14; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  .deck-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
  .slide-frame { width: 100%; max-width: 1200px; aspect-ratio: 16 / 9; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.6); padding: 50px 60px; display: flex; flex-direction: column; justify-content: center; position: relative; }
  .slide-title { font-size: 36px; font-weight: 800; color: #38bdf8; margin-bottom: 12px; line-height: 1.25; }
  .slide-subtitle { font-size: 20px; color: #94a3b8; margin-bottom: 24px; }
  .slide-bullets { font-size: 20px; line-height: 1.8; margin-left: 30px; color: #e2e8f0; }
  .slide-code { background: #020617; border: 1px solid #1e293b; padding: 16px 20px; border-radius: 8px; font-family: monospace; font-size: 16px; color: #38bdf8; margin-top: 16px; overflow-x: auto; }
  .deck-bar { height: 60px; background: #0b0f19; border-top: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; font-size: 14px; }
  .btn { background: #1e293b; color: #f8fafc; border: 0; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn:hover { background: #334155; }
  .btn.primary { background: #2563eb; color: #fff; }
  .btn.primary:hover { background: #1d4ed8; }
  .notes-box { display: none; position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); width: 80%; max-width: 900px; background: rgba(15, 23, 42, 0.95); border: 1px solid #334155; border-radius: 8px; padding: 16px 20px; font-size: 14px; color: #cbd5e1; font-style: italic; backdrop-filter: blur(8px); }
  @media print {
    body { background: #fff; color: #000; overflow: visible; height: auto; }
    .deck-bar, .notes-box { display: none !important; }
    .deck-container { padding: 0; display: block; }
    .slide-frame { page-break-after: always; width: 100vw; height: 56.25vw; aspect-ratio: 16 / 9; box-shadow: none; border: 0; background: #fff; color: #000; padding: 40px; }
    .slide-title { color: #0284c7; }
    .slide-bullets { color: #334155; }
  }
</style>
</head>
<body>
<div class="deck-container">
  <div class="slide-frame" id="slideFrame"></div>
  <div class="notes-box" id="notesBox"></div>
</div>
<div class="deck-bar">
  <div><strong>${title}</strong></div>
  <div style="display:flex; gap:12px; align-items:center;">
    <button class="btn" id="prevBtn">◀ Prev</button>
    <span id="counter" style="font-family:monospace; font-weight:600; min-width:60px; text-align:center;">1 / 1</span>
    <button class="btn" id="nextBtn">Next ▶</button>
    <button class="btn" id="notesBtn">📝 Notes</button>
    <button class="btn primary" id="fsBtn">Full Screen (F)</button>
  </div>
</div>
<script>
  const slides = ${slidesJson};
  let current = 0;
  let showNotes = false;
  const frame = document.getElementById('slideFrame');
  const counter = document.getElementById('counter');
  const notesBox = document.getElementById('notesBox');
  function render() {
    if (!slides.length) return;
    const s = slides[current];
    counter.textContent = (current + 1) + ' / ' + slides.length;
    document.getElementById('prevBtn').disabled = current === 0;
    document.getElementById('nextBtn').disabled = current === slides.length - 1;
    let html = '<div class="slide-title">' + (s.title || '') + '</div>';
    if (s.subtitle) html += '<div class="slide-subtitle">' + s.subtitle + '</div>';
    if (s.bullets && s.bullets.length) {
      html += '<ul class="slide-bullets">' + s.bullets.map(b => '<li>' + b + '</li>').join('') + '</ul>';
    }
    if (s.code) html += '<pre class="slide-code"><code>' + s.code + '</code></pre>';
    frame.innerHTML = html;
    notesBox.textContent = s.notes ? 'Speaker Notes: ' + s.notes : 'No speaker notes.';
  }
  document.getElementById('prevBtn').onclick = () => { if (current > 0) { current--; render(); } };
  document.getElementById('nextBtn').onclick = () => { if (current < slides.length - 1) { current++; render(); } };
  document.getElementById('notesBtn').onclick = () => { showNotes = !showNotes; notesBox.style.display = showNotes ? 'block' : 'none'; };
  document.getElementById('fsBtn').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };
  window.onkeydown = e => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { if (current < slides.length - 1) { current++; render(); } }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (current > 0) { current--; render(); } }
    else if (e.key === 'n' || e.key === 'N') { showNotes = !showNotes; notesBox.style.display = showNotes ? 'block' : 'none'; }
    else if (e.key === 'f' || e.key === 'F') { document.getElementById('fsBtn').click(); }
  };
  render();
</script>
</body>
</html>`;
	}

	async preflight() {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!this.binary) {
			return { error: 'yana-rt not found. Set its path in the yana.runtimePath setting.' };
		}
		if (!folder) {
			return { error: 'Open a folder before giving Yana a task.' };
		}
		if (!vscode.workspace.isTrusted) {
			return { error: 'This folder is in Restricted Mode. Trust it (Manage in the warning bar) before giving yana-rt a task, because yana-rt can run commands in this folder.' };
		}
		const { provider, model, baseUrl } = this.config();
		if (!models.info(provider)) {
			return { error: `Provider "${provider}" is not in the yana-rt catalog. Pick another one in Models & Runtime.` };
		}
		if (provider === 'custom' && !baseUrl) {
			return { error: 'The custom provider needs yana.baseUrl. Set it in Models & Runtime.' };
		}
		const key = await this.apiKey(provider);
		if (models.needsKey(provider) && !key) {
			return { error: `No API key for ${provider}. Run "Yana: Set Provider API Key".` };
		}
		return { cwd: folder.uri.fsPath, provider, model, baseUrl, key };
	}

	// Chế độ Plan, giới hạn độ dài và nhiệt độ. Chỉ gửi khi yana-rt hiểu; bản cũ sẽ từ chối trường lạ và làm hỏng cả lượt chat.
	async applyTurnControls(payload, mode) {
		const cfg = vscode.workspace.getConfiguration('yana');
		const maxTokens = cfg.get('chat.maxTokens', null);
		const temperature = cfg.get('chat.temperature', null);
		const wanted = mode === 'plan' || Number.isInteger(maxTokens) || typeof temperature === 'number';
		if (!wanted) return;
		if (!(await supportsTurnControls(this.binary))) {
			if (mode === 'plan') payload.task = `${PLAN_HINT}\n${payload.task}`;
			if (!this.warnedOldRuntime) {
				this.warnedOldRuntime = true;
				vscode.window.showWarningMessage('Yana: this yana-rt is too old to enforce Plan mode or apply reply length and temperature. Plan mode is only a request to the model until you install a newer yana-rt.');
			}
			return;
		}
		if (mode === 'plan') payload.mode = 'plan';
		if (Number.isInteger(maxTokens) && maxTokens > 0) payload.max_tokens = maxTokens;
		if (typeof temperature === 'number') payload.temperature = temperature;
	}

	async send(text, images = [], mode = 'act', files = []) {
		let task = text.trim();
		if ((!task && images.length === 0 && files.length === 0) || this.active) {
			return;
		}
		const ready = await this.preflight();
		if (ready.error) {
			this.post({ type: 'event', event: { type: 'error', message: ready.error } });
			return;
		}
		const conversation = await conversations.ensureActive(() => this.systemFor(ready.cwd));
		this.shownId = conversation.id;
		this.post({ type: 'intent', text: task, at: new Date().toISOString(), images, files });

		if (files.length > 0) {
			const folder = vscode.workspace.workspaceFolders?.[0];
			let filesContext = '\n\n[Attached Files]:';
			for (const f of files) {
				let filePath = f.path;
				if (!filePath && f.data && folder) {
					try {
						const attachDir = vscode.Uri.joinPath(folder.uri, '.yana-ai', 'attachments');
						await vscode.workspace.fs.createDirectory(attachDir);
						const targetUri = vscode.Uri.joinPath(attachDir, f.name);
						const buf = Buffer.from(f.data, 'base64');
						await vscode.workspace.fs.writeFile(targetUri, buf);
						filePath = targetUri.fsPath;
					} catch (saveErr) {
						console.warn('Could not save external attachment to workspace:', saveErr);
					}
				}
				filesContext += `\n- **${f.name}** (${f.category || 'Document'}): ${filePath || f.name}`;
				if (f.textContent && f.textContent.length < 5000) {
					filesContext += `\n\`\`\`\n${f.textContent}\n\`\`\``;
				}
			}
			task = (task || 'Please review and process the attached file(s).') + filesContext;
		}

		const payload = { task: task || 'Analyze the attached image(s)', history: conversation.messages.slice(-MAX_HISTORY_MESSAGES), session_id: conversation.id };
		if (ready.key) {
			payload.api_key = ready.key;
		}
		if (images.length > 0) {
			payload.images = images;
		}
		// Project Memory đi qua trường system của yana-rt. Nó được chụp lúc tạo hội thoại và giữ nguyên
		// suốt hội thoại, để system prompt không đổi giữa chừng.
		if (conversation.system) {
			payload.system = conversation.system;
		}
		if (ready.provider === 'custom') {
			payload.base_url = ready.baseUrl;
			payload.custom_keyless = !ready.key;
		}
		await this.applyTurnControls(payload, mode);
		const summaryLabel = text.trim() || (files.length > 0 ? `[${files.length} Attached File(s)]` : images.length === 1 ? '[Attached Image]' : `[${images.length} Images]`);
		this.run({ ...ready, resume: false, payload, conversationId: conversation.id }, summaryLabel);
	}

	async decide(approvalId, decision) {
		if (!approvalId || this.active) {
			return;
		}
		const ready = await this.preflight();
		if (ready.error) {
			this.post({ type: 'event', event: { type: 'error', message: ready.error } });
			return;
		}
		const payload = { approval_id: approvalId, decision, decided_by: 'human:yana-studio' };
		if (ready.key) {
			payload.api_key = ready.key;
		}
		// Tiếp tục đúng lượt đang chờ duyệt, để phần trả lời sau khi duyệt được lưu chung với câu hỏi gốc.
		const pending = this.pendingTurn || {};
		this.pendingTurn = undefined;
		this.run({ ...ready, resume: true, payload, conversationId: pending.conversationId, priorReply: pending.reply }, pending.task || '');
	}

	run(options, task) {
		let reply = options.priorReply || '';
		let paused = false;
		const tokens = { input: 0, output: 0 };
		this.active = startTurn(
			{ binary: this.binary, cwd: options.cwd, provider: options.provider, model: options.model, resume: options.resume, payload: options.payload },
			event => {
				if (event.type === 'text_delta') {
					reply += event.text || '';
				}
				if (event.type === 'metrics') {
					tokens.input += event.input_tokens || 0;
					tokens.output += event.output_tokens || 0;
				}
				if (event.type === 'awaiting_approval') {
					paused = true;
				}
				if (event.type === 'error' && /cannot persist pending approval/.test(event.message || '')) {
					approvalStore.offer(options.cwd);
				}
				this.post({ type: 'event', event });
			},
			() => {
				this.active = undefined;
				usage.record(this.context, { root: options.cwd, provider: options.provider, model: options.model, ...tokens })
					.catch(() => undefined); // thống kê không được làm hỏng lượt chat

				if (paused) {
					this.pendingTurn = { conversationId: options.conversationId, task, reply };
				} else if (task && reply && options.conversationId) {
					conversations.appendTurn(options.conversationId, task, reply)
						.catch(error => vscode.window.showErrorMessage(`Yana: could not save the conversation: ${error.message}`));
					if (options.cwd) {
						try {
							const items = edits.propose(reply, options.cwd);
							if (items && items.length > 0) {
								this.post({ type: 'editProposals', items });
							}
						} catch (err) {
							console.warn('Failed to propose edits:', err);
						}
					}
				}
				this.postState();
			},
		);
		this.postState();
	}
}

// Chọn provider/model và lưu API key nằm ở features/models.js (catalog đầy đủ của yana-rt).
function activate(context) {
	require('./features').activateAll(context);
	const panel = new YanaPanel(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('yana.panel', panel, { webviewOptions: { retainContextWhenHidden: true } }),
		vscode.commands.registerCommand('yana.focus', () => vscode.commands.executeCommand('yana.panel.focus')),
		vscode.commands.registerCommand('yana.assistants.get', () => ({
			items: context.globalState.get('yana.assistants.v1', panel.defaultAssistants()),
			selectedId: context.globalState.get('yana.assistants.selected', ''),
		})),
		vscode.commands.registerCommand('yana.assistants.select', id => panel.selectAssistant(String(id))),
		vscode.commands.registerCommand('yana.chat.new', async () => {
			await panel.newConversation();
			await vscode.commands.executeCommand('yana.panel.focus');
		}),
		conversations.onDidChange(() => panel.showConversation(false)),
		// Điền sẵn chữ vào ô chat (dùng khi Design Canvas cũ gửi mô tả sang chat), người dùng tự bấm Send.
		vscode.commands.registerCommand('yana.chat.prefill', async text => {
			await vscode.commands.executeCommand('yana.panel.focus');
			panel.post({ type: 'prefill', text: String(text || '').slice(0, 8000) });
		}),
		vscode.workspace.onDidGrantWorkspaceTrust(() => panel.postState()),
		// Đổi cấu hình hoặc lưu/xoá API key: khung chat nạp lại runtime và trạng thái model.
		changes.listen(['config', 'secrets'], () => panel.refreshRuntime()),
	);
}

function deactivate() {}

module.exports = { activate, deactivate };
