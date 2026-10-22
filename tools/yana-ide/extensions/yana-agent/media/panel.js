// Webview của panel Yana. Mọi nội dung động đều đi qua textContent, không dùng innerHTML.
(function () {
	'use strict';
	const vscode = acquireVsCodeApi();
	window.vscode = vscode;
	const app = document.getElementById('app');
	const ui = { trace: null, reply: null, approval: null, pendingCall: null, tokens: { input: 0, output: 0 }, busy: false };
	const editManager = window.yanaEdits ? window.yanaEdits.create({ el, button, append, post: msg => vscode.postMessage(msg) }) : null;

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function button(className, label, onClick, title) {
		const node = el('button', className, label);
		node.addEventListener('click', onClick);
		if (title) node.title = title;
		return node;
	}

	function sanitizeMediaSrc(src) {
		if (typeof src !== 'string') return '';
		const trimmed = src.trim();
		// Allow safe base64 images with strict alphabet check
		const base64Match = trimmed.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
		if (base64Match) {
			return `data:image/${base64Match[1].toLowerCase()};base64,${base64Match[2]}`;
		}
		// Allow https or vscode-resource URLs
		if (/^(https:|vscode-webview-resource:|vscode-resource:)\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i.test(trimmed)) {
			return trimmed;
		}
		return '';
	}

	// ----- khung cố định -----
	const header = el('div', 'header');
	const brand = el('div', 'brand');
	const logoIcon = el('img', 'logo-icon');
	logoIcon.src = document.body.dataset.emblem || '';
	logoIcon.alt = '';
	// Thanh tiêu đề của view (do VS Code vẽ) đã có chữ "Yana AI" và nút Settings, nên header trong panel chỉ
	// giữ logo, trạng thái runtime và các nút hội thoại. Panel thường chỉ rộng ~270px: mọi dòng phải giữ một
	// dòng và cắt bằng "…" thay vì xuống dòng.
	const statusDot = el('span', 'status-dot');
	const statusText = el('span', 'status-label ellipsis');
	const versionBadge = el('span', 'badge mono', '…');
	brand.append(logoIcon, statusDot, statusText, versionBadge);
	header.append(brand);

	const modelRow = el('div', 'model-row');
	const modelButton = button('model-btn mono', '', () => vscode.postMessage({ type: 'pickModel' }), 'Change provider and model');
	modelRow.append(modelButton, button('ghost mono', 'Key', () => vscode.postMessage({ type: 'setKey' }), 'Save an API key for this provider'));

	// Chính sách thật của yana-rt: đọc file được phép, chạy lệnh luôn cần anh duyệt. Không có nút chế độ
	// Auto/Plan-Only vì runtime chưa hỗ trợ; trước đây chúng hiện như nút bấm được nhưng bị khoá.
	const contextRow = el('div', 'context-row');
	const workspaceText = el('span', 'ellipsis muted');
	const conversationTitle = el('span', 'ellipsis conversation');
	conversationTitle.title = 'Current conversation';
	contextRow.append(el('span', 'policy-badge mono', 'SUPERVISED'), conversationTitle, workspaceText);
	const policyNote = el('div', 'policy-note muted', 'Reads are allowed. Every command waits for your approval.');

	const feed = el('div', 'feed');
	const empty = el('div', 'empty');
	const emptyIcon = el('img', 'empty-emblem');
	emptyIcon.src = document.body.dataset.emblem || '';
	emptyIcon.alt = '';
	empty.append(emptyIcon, el('div', 'empty-title', 'Ask Yana'), el('div', 'empty-desc', 'Describe a task. Yana can read the project; any command it wants to run stops here for your approval first.'));
	feed.append(empty);

	const composer = el('div', 'composer');
	const composerBox = el('div', 'composer-box');
	const attachmentsBar = el('div', 'attachments-bar');
	attachmentsBar.style.display = 'none';

	const input = el('textarea', 'input');
	input.rows = 2;
	input.placeholder = 'Ask Yana or give it a task';

	const fileInput = el('input');
	fileInput.type = 'file';
	fileInput.accept = '*/*';
	fileInput.multiple = true;
	fileInput.style.display = 'none';

	// ----- Popover (+) & Capabilities Menu -----
	let isMenuOpen = false;
	let isPlanMode = false;
	const popover = el('div', 'composer-popover');
	popover.style.display = 'none';

	function toggleMenu(e) {
		if (e) e.stopPropagation();
		isMenuOpen = !isMenuOpen;
		if (isMenuOpen) {
			buildPopover();
			popover.style.display = 'flex';
		} else {
			popover.style.display = 'none';
		}
	}
	function closeMenu() {
		isMenuOpen = false;
		popover.style.display = 'none';
	}
	document.addEventListener('click', e => {
		if (isMenuOpen && !popover.contains(e.target)) closeMenu();
	});
	window.addEventListener('keydown', e => {
		if (e.key === 'Escape') {
			if (isMenuOpen) closeMenu();
			else if (ui.busy) vscode.postMessage({ type: 'stop' });
		}
	});

	function createPopoverItem(icon, label, desc, onClick) {
		const row = el('div', 'popover-item');
		const iconSpan = el('span', 'popover-item-icon', icon);
		const textCol = el('div', 'popover-item-text');
		const labelSpan = el('div', 'popover-item-label', label);
		const descSpan = el('div', 'popover-item-desc', desc);
		textCol.append(labelSpan, descSpan);
		row.append(iconSpan, textCol);
		row.addEventListener('click', e => {
			e.stopPropagation();
			onClick();
		});
		return row;
	}

	function buildPopover() {
		popover.replaceChildren();

		const head = el('div', 'popover-head');
		head.append(el('span', 'popover-title', 'Capabilities & Actions'), el('span', 'popover-sub', 'Esc'));
		popover.append(head);

		const sec1 = el('div', 'popover-section');
		sec1.append(el('div', 'popover-section-label', 'ATTACH & CREATE'));

		sec1.append(
			createPopoverItem('🚀', 'Getting Started Walkthrough', 'Step-by-step introduction and setup wizard', () => {
				closeMenu();
				vscode.postMessage({ type: 'openOnboarding' });
			}),
			createPopoverItem('🏠', 'Yana Home', 'Open the main Yana Home dashboard and hub', () => {
				closeMenu();
				vscode.postMessage({ type: 'home' });
			}),
			createPopoverItem('📎', 'Files & Documents', 'Attach documents (PDF, PPT, Word), code, or images', () => {
				closeMenu();
				fileInput.click();
			}),
			createPopoverItem('🎬', 'Interactive Slide Deck', 'Generate 16:9 presentation slides (/deck)', () => {
				closeMenu();
				input.value = '/deck ';
				input.focus();
			}),
			createPopoverItem('📊', 'Yana Office (Slides & Docs)', 'Write slides, preview Marp, export PDF, PPTX, Word, Excel', () => {
				closeMenu();
				vscode.postMessage({ type: 'openOffice' });
			}),
			createPopoverItem('🎨', 'Design Canvas', 'Open visual UI design canvas sandbox', () => {
				closeMenu();
				vscode.postMessage({ type: 'newCanvas' });
			}),
			createPopoverItem(isPlanMode ? '💡' : '⚡', isPlanMode ? 'Exit Plan Mode (Act Mode)' : 'Plan Mode (Read-Only)', 'Plan only; commands and file writes blocked', () => {
				isPlanMode = !isPlanMode;
				updateModeBadge();
				closeMenu();
			})
		);

		const sec2 = el('div', 'popover-section');
		sec2.append(el('div', 'popover-section-label', 'PROJECT & GOVERNANCE'));

		sec2.append(
			createPopoverItem('🤖', 'Assistant Profiles', 'Manage custom assistant personas and prompts', () => {
				closeMenu();
				window.YanaAssistants?.openAssistantManager();
			}),
			createPopoverItem('🎯', 'Tasks & Milestones', 'View task DAG, dependencies, and evidence', () => {
				closeMenu();
				vscode.postMessage({ type: 'openTasks' });
			}),
			createPopoverItem('🧠', 'Project Memory', 'View rules, facts, and AGENTS.md guidelines', () => {
				closeMenu();
				vscode.postMessage({ type: 'openMemory' });
			}),
			createPopoverItem('🛡️', 'Permissions & Leases', 'Manage authority, pending approvals, and leases', () => {
				closeMenu();
				vscode.postMessage({ type: 'openPermissions' });
			}),
			createPopoverItem('📋', 'Audit Chain Log', 'View immutable audit trail and security events', () => {
				closeMenu();
				window.YanaAuditView?.openAuditLog();
			}),
			createPopoverItem('🩺', 'Yana Doctor Diagnostics', 'Run project health and drift verification (/verify)', () => {
				closeMenu();
				window.YanaAuditView?.openDoctorScan();
			}),
			createPopoverItem('📖', 'User Guide', 'Open step-by-step manual and documentation', () => {
				closeMenu();
				vscode.postMessage({ type: 'openGuide' });
			})
		);

		popover.append(sec1, sec2);
	}

	const composerTools = el('div', 'composer-tools');

	const toolsLeft = el('div', 'composer-tools-left');
	const plusBtn = button('plus-btn', '+', toggleMenu, 'Capabilities & actions (+)');
	const modeBadge = button('mode-badge act', '', () => {
		isPlanMode = !isPlanMode;
		updateModeBadge();
	}, 'Click to toggle Plan Mode vs Act Mode');
	function updateModeBadge() {
		modeBadge.replaceChildren();
		const icon = el('span', 'mode-badge-icon', isPlanMode ? '💡' : '⚡');
		const label = el('span', 'mode-badge-text', isPlanMode ? 'Plan' : 'Act');
		modeBadge.append(icon, label);
		modeBadge.className = isPlanMode ? 'mode-badge plan' : 'mode-badge act';
	}
	updateModeBadge();

	const assistantChip = window.YanaAssistants ? window.YanaAssistants.createSelectorElement() : el('span');
	const modelPickerBtn = button('model-chip', '', () => vscode.postMessage({ type: 'pickModel' }), 'Change provider and model');
	const keyBtn = button('ghost-chip', 'Key', () => vscode.postMessage({ type: 'setKey' }), 'Save an API key for this provider');

	const toolsRight = el('div', 'composer-tools-right');
	const footerTokens = el('span', 'muted mono ellipsis tokens-label', '0 in · 0 out');
	footerTokens.title = 'Tokens reported by the provider for this conversation';

	// Movable microphone button (drag & drop or right-click to reposition left vs right)
	let micPosition = (typeof localStorage !== 'undefined' && localStorage.getItem('yana.mic.position')) || 'right';
	const micBtn = button('mic-btn', '🎙️', () => window.YanaVoice?.toggleRecording(), 'Voice input (Whisper / Cloud) · Right-click to move position');
	micBtn.style.display = 'none'; // hiện lại khi capabilities.voice.input là true (voice.js)
	micBtn.draggable = true;
	micBtn.addEventListener('dragstart', e => {
		e.dataTransfer.setData('text/plain', 'mic');
		micBtn.classList.add('dragging');
	});
	micBtn.addEventListener('dragend', () => {
		micBtn.classList.remove('dragging');
	});
	micBtn.addEventListener('contextmenu', e => {
		e.preventDefault();
		micPosition = micPosition === 'right' ? 'left' : 'right';
		try { localStorage.setItem('yana.mic.position', micPosition); } catch (_) {}
		placeMicButton();
	});

	function placeMicButton() {
		micBtn.remove();
		if (micPosition === 'left') {
			plusBtn.after(micBtn);
			micBtn.title = 'Voice input (Whisper / Cloud) · Left position · Right-click to move right';
		} else {
			sendBtn.before(micBtn);
			micBtn.title = 'Voice input (Whisper / Cloud) · Right position · Right-click to move left';
		}
	}

	[toolsLeft, toolsRight].forEach(container => {
		const isFileDrag = e => Array.from(e.dataTransfer?.types || []).some(t => t === 'Files' || t === 'text/uri-list');
		container.addEventListener('dragover', e => {
			if (isFileDrag(e)) return; // file drops are handled by the composer
			e.preventDefault();
			container.classList.add('drop-target');
		});
		container.addEventListener('dragleave', () => {
			container.classList.remove('drop-target');
		});
		container.addEventListener('drop', e => {
			if (isFileDrag(e)) return;
			e.preventDefault();
			container.classList.remove('drop-target');
			micPosition = container === toolsLeft ? 'left' : 'right';
			try { localStorage.setItem('yana.mic.position', micPosition); } catch (_) {}
			placeMicButton();
		});
	});

	const sendBtn = button('send-btn primary', '↑', submit, 'Send (Enter)');
	sendBtn.title = 'Send (Enter), Shift+Enter for new line';

	toolsLeft.append(plusBtn, modeBadge, assistantChip, modelPickerBtn, keyBtn);
	toolsRight.append(footerTokens, sendBtn);
	placeMicButton();

	composerTools.append(toolsLeft, toolsRight);

	window.YanaVoice?.init(input);
	window.YanaMentions?.init(input);

	composerBox.append(popover, window.YanaVoice ? window.YanaVoice.getIndicatorElement() : el('div'), attachmentsBar, input, composerTools, fileInput);
	composer.append(composerBox);

	app.append(header, contextRow, policyNote, feed, composer);

	// ----- hành vi đính kèm ảnh & file đa định dạng (ảnh, PDF, PPT, DOC, code) -----
	let attachedItems = [];

	function formatBytes(bytes) {
		if (!bytes || bytes <= 0) return '0 B';
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function isImageFile(file) {
		if (file.type && file.type.startsWith('image/')) return true;
		const name = (file.name || '').toLowerCase();
		return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
	}

	function getImageMimeType(file) {
		if (file.type && file.type.startsWith('image/')) return file.type;
		const name = (file.name || '').toLowerCase();
		if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
		if (/\.webp$/i.test(name)) return 'image/webp';
		if (/\.gif$/i.test(name)) return 'image/gif';
		if (/\.svg$/i.test(name)) return 'image/svg+xml';
		return 'image/png';
	}

	function getFileCategory(name, mime) {
		const ext = (name.split('.').pop() || '').toLowerCase();
		if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext) || mime?.startsWith('image/')) {
			return { type: 'image', icon: '🖼️', label: 'Image' };
		}
		if (ext === 'pdf' || mime === 'application/pdf') {
			return { type: 'pdf', icon: '📑', label: 'PDF' };
		}
		if (['ppt', 'pptx'].includes(ext) || mime?.includes('presentation')) {
			return { type: 'presentation', icon: '📊', label: 'PPT' };
		}
		if (['doc', 'docx'].includes(ext) || mime?.includes('word')) {
			return { type: 'document', icon: '📄', label: 'DOC' };
		}
		if (['xls', 'xlsx', 'csv'].includes(ext) || mime?.includes('sheet')) {
			return { type: 'spreadsheet', icon: '📈', label: 'SHEET' };
		}
		if (['txt', 'md', 'markdown', 'json', 'py', 'js', 'ts', 'jsx', 'tsx', 'rs', 'go', 'html', 'css', 'sql', 'yaml', 'yml', 'toml', 'sh'].includes(ext)) {
			return { type: 'text', icon: '📝', label: 'CODE' };
		}
		return { type: 'file', icon: '📁', label: 'FILE' };
	}

	function handleFiles(files) {
		for (const file of files) {
			if (attachedItems.length >= 8) break;
			const name = file.name || 'attachment';
			const ext = (name.split('.').pop() || '').toLowerCase();
			const mimeType = file.type || '';
			const cat = getFileCategory(name, mimeType);
			const filePath = file.path || '';

			if (cat.type === 'image') {
				const imgMime = getImageMimeType(file);
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = String(reader.result || '');
					const base64Data = dataUrl.split(',')[1];
					if (!base64Data) return;
					attachedItems.push({
						isImage: true,
						category: cat,
						mimeType: imgMime,
						data: base64Data,
						name,
						size: file.size || 0,
						url: dataUrl,
						path: filePath,
					});
					renderAttachments();
				};
				reader.readAsDataURL(file);
			} else if (cat.type === 'text' && file.size < 1024 * 1024) {
				const reader = new FileReader();
				reader.onload = () => {
					attachedItems.push({
						isImage: false,
						category: cat,
						mimeType: mimeType || 'text/plain',
						textContent: String(reader.result || ''),
						name,
						ext,
						size: file.size || 0,
						path: filePath,
					});
					renderAttachments();
				};
				reader.readAsText(file);
			} else {
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = String(reader.result || '');
					const base64Data = dataUrl.split(',')[1];
					attachedItems.push({
						isImage: false,
						category: cat,
						mimeType: mimeType || 'application/octet-stream',
						data: base64Data,
						name,
						ext,
						size: file.size || 0,
						path: filePath,
					});
					renderAttachments();
				};
				if (file.size < 25 * 1024 * 1024) {
					reader.readAsDataURL(file);
				} else {
					attachedItems.push({
						isImage: false,
						category: cat,
						mimeType: mimeType || 'application/octet-stream',
						name,
						ext,
						size: file.size || 0,
						path: filePath,
					});
					renderAttachments();
				}
			}
		}
	}

	function attachImageObj(img) {
		if (attachedItems.length >= 8 || !img?.data) return;
		attachedItems.push({
			isImage: true,
			category: getFileCategory(img.name || 'image.png', img.mimeType || 'image/png'),
			mimeType: img.mimeType || 'image/png',
			data: img.data,
			name: img.name || 'image',
			size: img.size || 0,
			url: img.url || `data:${img.mimeType || 'image/png'};base64,${img.data}`,
			path: img.path || '',
		});
		renderAttachments();
	}

	function attachFileObj(file) {
		if (attachedItems.length >= 8 || !file?.name) return;
		const cat = getFileCategory(file.name, file.mimeType || '');
		attachedItems.push({
			isImage: false,
			category: cat,
			name: file.name,
			ext: file.ext || (file.name.split('.').pop() || '').toLowerCase(),
			size: file.size || 0,
			path: file.path || '',
			textContent: file.textContent,
			data: file.data,
			mimeType: file.mimeType || 'application/octet-stream'
		});
		renderAttachments();
	}

	function insertTextAtCursor(textToInsert) {
		const start = input.selectionStart || input.value.length;
		const end = input.selectionEnd || input.value.length;
		input.value = input.value.substring(0, start) + textToInsert + input.value.substring(end);
		input.selectionStart = input.selectionEnd = start + textToInsert.length;
		input.focus();
	}

	function renderAttachments() {
		attachmentsBar.replaceChildren();
		if (attachedItems.length === 0) {
			attachmentsBar.style.display = 'none';
			return;
		}
		attachmentsBar.style.display = 'flex';
		attachedItems.forEach((item, idx) => {
			if (item.isImage) {
				const chip = el('div', 'attachment-chip');
				const thumb = el('img', 'attachment-thumb');
				const safeSrc = sanitizeMediaSrc(item.url || `data:${item.mimeType};base64,${item.data}`);
				if (safeSrc) {
					thumb.setAttribute('src', safeSrc);
				}
				thumb.alt = item.name || 'image';
				const removeBtn = el('button', 'attachment-remove', '×');
				removeBtn.title = 'Remove';
				removeBtn.addEventListener('click', e => {
					e.stopPropagation();
					attachedItems.splice(idx, 1);
					renderAttachments();
				});
				chip.append(thumb, removeBtn);
				attachmentsBar.append(chip);
			} else {
				const chip = el('div', 'attachment-chip file-chip');
				chip.title = `${item.name} (${formatBytes(item.size)})`;
				const icon = el('span', 'attachment-file-icon', item.category.icon);
				const name = el('span', 'attachment-file-name', item.name);
				const size = el('span', 'attachment-file-size mono', formatBytes(item.size));
				const removeBtn = el('button', 'attachment-remove', '×');
				removeBtn.title = 'Remove';
				removeBtn.addEventListener('click', e => {
					e.stopPropagation();
					attachedItems.splice(idx, 1);
					renderAttachments();
				});
				chip.append(icon, name, size, removeBtn);
				attachmentsBar.append(chip);
			}
		});
		if (attachedItems.length > 1) {
			const clearAll = el('button', 'attachment-clear-all', 'Clear all');
			clearAll.title = 'Remove all attachments';
			clearAll.addEventListener('click', e => {
				e.stopPropagation();
				attachedItems.length = 0;
				renderAttachments();
				input.focus();
			});
			attachmentsBar.append(clearAll);
		}
	}

	// Backspace on an empty composer removes the most recent attachment (like most chat apps).
	input.addEventListener('keydown', event => {
		if (event.key === 'Backspace' && !input.value && attachedItems.length > 0 && !event.isComposing) {
			event.preventDefault();
			attachedItems.pop();
			renderAttachments();
		}
	});

	fileInput.addEventListener('change', () => {
		handleFiles(Array.from(fileInput.files || []));
		fileInput.value = '';
	});

	input.addEventListener('paste', event => {
		const items = Array.from(event.clipboardData?.items || []);
		const pastedFiles = [];
		for (const item of items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file) pastedFiles.push(file);
			}
		}
		if (pastedFiles.length > 0) {
			event.preventDefault();
			handleFiles(pastedFiles);
		}
	});

	let dragCounter = 0;
	function handleDragDrop(event) {
		// The mic button drags with text/plain 'mic'; leave that to the toolbar's own drop handler.
		if (event.dataTransfer?.getData('text/plain') === 'mic') {
			dragCounter = 0;
			composerBox.classList.remove('drag-over');
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		dragCounter = 0;
		composerBox.classList.remove('drag-over');

		const dt = event.dataTransfer;
		if (!dt) return;

		// 1. Check raw File objects (from Finder or desktop)
		const rawFiles = Array.from(dt.files || []);
		if (rawFiles.length > 0) {
			handleFiles(rawFiles);
			return;
		}

		// 2. Check items for files
		if (dt.items && dt.items.length > 0) {
			const itemFiles = [];
			for (const item of dt.items) {
				if (item.kind === 'file') {
					const f = item.getAsFile();
					if (f) itemFiles.push(f);
				}
			}
			if (itemFiles.length > 0) {
				handleFiles(itemFiles);
				return;
			}
		}

		// 3. Check VS Code uri-list or text (from VS Code file tree explorer)
		const uriList = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
		if (uriList) {
			const lines = uriList.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
			for (const uri of lines) {
				vscode.postMessage({ type: 'droppedUri', uri });
			}
		}
	}

	// Capture phase on purpose: VS Code's webview bootstrap sends `drag-start` to the workbench (which then takes the
	// drop and opens the file in an editor) unless the event is already defaultPrevented when its own listener runs.
	window.addEventListener('dragenter', event => {
		event.preventDefault();
		dragCounter++;
		composerBox.classList.add('drag-over');
	}, true);
	window.addEventListener('dragover', event => {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		composerBox.classList.add('drag-over');
	}, true);
	window.addEventListener('dragleave', () => {
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			composerBox.classList.remove('drag-over');
		}
	}, true);
	window.addEventListener('drop', handleDragDrop, true);

	function submit() {
		if (ui.busy) {
			vscode.postMessage({ type: 'stop' });
			return;
		}
		let text = input.value.trim();
		const imagesToSend = attachedItems.filter(i => i.isImage).map(img => ({
			mimeType: img.mimeType,
			data: img.data,
			name: img.name
		}));
		const filesToSend = attachedItems.filter(i => !i.isImage).map(f => ({
			name: f.name,
			size: f.size,
			path: f.path || '',
			mimeType: f.mimeType,
			category: f.category?.label || 'File',
			textContent: f.textContent,
			data: f.data
		}));

		if (!text && imagesToSend.length === 0 && filesToSend.length === 0) return;

		if (text.startsWith('/deck ') || text.startsWith('/presentation ') || text.startsWith('/slide ')) {
			const topic = text.replace(/^\/(deck|presentation|slide)\s+/, '').trim();
			text = `Create a presentation slide deck on the topic: "${topic}".\nOutput your response containing an interactive presentation using a \`\`\`slide-deck code block with JSON structure: {"title": "${topic}", "theme": "dark", "slides": [{"title": "...", "subtitle": "...", "bullets": ["..."], "notes": "..."}]}.`;
		} else if (!text && filesToSend.length > 0) {
			const hasPresentation = filesToSend.some(f => /\.(pptx?|key|odp)$/i.test(f.name));
			const hasPdf = filesToSend.some(f => /\.pdf$/i.test(f.name));
			if (hasPresentation) {
				text = `Review and analyze the attached presentation file(s): ${filesToSend.map(f => f.name).join(', ')}.`;
			} else if (hasPdf) {
				text = `Read and analyze the attached document(s): ${filesToSend.map(f => f.name).join(', ')}.`;
			} else {
				text = `Analyze the attached file(s): ${filesToSend.map(f => f.name).join(', ')}.`;
			}
		}

		vscode.postMessage({
			type: 'send',
			text,
			images: imagesToSend,
			files: filesToSend,
			mode: isPlanMode ? 'plan' : 'act'
		});
		input.value = '';
		attachedItems = [];
		attachedImages = [];
		renderAttachments();
	}
	input.addEventListener('keydown', event => {
		if (event.key === 'Enter') {
			if (event.isComposing || event.keyCode === 229) return;
			if (!event.shiftKey) {
				event.preventDefault();
				submit();
			}
		}
	});

	function resetFeed() {
		feed.replaceChildren(empty);
		ui.trace = ui.reply = ui.approval = ui.pendingCall = null;
		ui.replyText = '';
		ui.tokens = { input: 0, output: 0 };
		footerTokens.textContent = '0 in · 0 out';
	}
	function append(node) {
		if (empty.isConnected) empty.remove();
		feed.append(node);
		feed.scrollTop = feed.scrollHeight;
	}

	function renderState(state) {
		ui.busy = state.busy;
		if (state.capabilities) {
			window.YanaAssistants?.updateCapabilities(state.capabilities);
			window.YanaVoice?.updateCapabilities(state.capabilities);
			window.YanaMentions?.updateCapabilities(state.capabilities);
		}
		versionBadge.textContent = state.runtime.found ? `v${state.runtime.version || '?'}` : '—';
		statusDot.className = state.runtime.found ? 'status-dot ok' : 'status-dot bad';
		statusText.textContent = state.runtime.found ? 'Ready' : 'No runtime';
		statusText.title = state.runtime.found ? `yana-rt at ${state.runtime.path}` : 'Set yana.runtimePath in settings';
		workspaceText.textContent = !state.workspace ? 'no folder' : state.trusted ? state.workspace : `${state.workspace} · restricted`;
		workspaceText.className = state.workspace && !state.trusted ? 'ellipsis waiting' : 'ellipsis muted';
		if (state.workspace && !state.trusted) {
			workspaceText.style.cursor = 'pointer';
			workspaceText.title = 'Workspace is in Restricted Mode. Click to Trust Folder (Tin cậy thư mục).';
			workspaceText.onclick = () => vscode.postMessage({ type: 'manageTrust' });
		} else {
			workspaceText.style.cursor = 'default';
			workspaceText.title = workspaceText.textContent;
			workspaceText.onclick = null;
		}
		modelPickerBtn.replaceChildren();
		const rawModel = state.model || 'default';
		const cleanModel = rawModel.includes('/') ? rawModel.split('/').pop() : rawModel;
		const pName = el('span', 'font-semibold model-provider', state.provider || 'ollama');
		const mName = el('span', 'model-tag', cleanModel);
		modelPickerBtn.append(pName, el('span', 'sep', '·'), mName, el('span', 'caret', '▾'));
		modelPickerBtn.title = `${state.provider || 'ollama'} · ${rawModel} (Click to change model)`;
		keyBtn.style.display = (state.provider === 'ollama' || !state.provider) ? 'none' : '';
		sendBtn.textContent = state.busy ? '■' : '↑';
		sendBtn.className = state.busy ? 'send-btn danger' : 'send-btn primary';
	}

	function renderIntent(text, at, images, files) {
		const card = el('div', 'card intent');
		const head = el('div', 'card-head mono');
		head.append(el('span', 'label', 'OPERATOR INTENT'), el('span', 'muted', at ? new Date(at).toLocaleTimeString() : ''));
		card.append(head);
		if (Array.isArray(images) && images.length > 0) {
			const gallery = el('div', 'intent-images');
			for (const img of images) {
				const thumb = el('img', 'intent-thumb');
				const safeSrc = sanitizeMediaSrc(`data:${img.mimeType};base64,${img.data}`);
				if (safeSrc) {
					thumb.setAttribute('src', safeSrc);
				}
				thumb.alt = 'attachment';
				gallery.append(thumb);
			}
			card.append(gallery);
		}
		if (Array.isArray(files) && files.length > 0) {
			const filesBox = el('div', 'intent-files');
			for (const f of files) {
				const chip = el('div', 'intent-file-chip');
				const cat = getFileCategory(f.name || '');
				const icon = el('span', 'intent-file-icon', cat.icon);
				const name = el('span', 'intent-file-name', f.name || 'File');
				const size = el('span', 'intent-file-size mono', f.size ? formatBytes(f.size) : '');
				chip.append(icon, name, size);
				filesBox.append(chip);
			}
			card.append(filesBox);
		}
		if (text) card.append(el('div', 'intent-text', text));
		append(card);
		ui.trace = null;
		ui.reply = null;
		ui.replyText = '';
	}

	// Câu trả lời hiển thị bằng Markdown an toàn (media/markdown.js). Khi đang stream, vẽ lại tối đa
	// mỗi STREAM_RENDER_MS một lần. Giữ nguyên vùng chọn chuột (selection) của người dùng để không làm
	// mất highlight khi đang copy code lúc model đang gõ.
	const STREAM_RENDER_MS = 120;
	let renderTimer = 0;
	let isUserSelecting = false;
	let renderPending = false;

	document.addEventListener('mousedown', e => {
		if (ui.reply && ui.reply.contains(e.target)) {
			isUserSelecting = true;
		}
	});
	document.addEventListener('mouseup', () => {
		if (isUserSelecting) {
			isUserSelecting = false;
			if (renderPending) {
				renderPending = false;
				renderReply();
			}
		}
	});

	function getSelectionRangeInfo(container) {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
		const range = sel.getRangeAt(0);
		if (!container || !container.contains(range.commonAncestorContainer)) return null;
		try {
			const preCaretRange = range.cloneRange();
			preCaretRange.selectNodeContents(container);
			preCaretRange.setEnd(range.startContainer, range.startOffset);
			const start = preCaretRange.toString().length;
			const end = start + range.toString().length;
			return { start, end };
		} catch (_) {
			return null;
		}
	}

	function restoreSelectionRangeInfo(container, savedSel) {
		if (!savedSel || savedSel.start === savedSel.end) return;
		const sel = window.getSelection();
		if (!sel) return;
		try {
			let charIndex = 0;
			const range = document.createRange();
			range.setStart(container, 0);
			range.collapse(true);
			const nodeStack = [container];
			let node;
			let foundStart = false;
			let stop = false;

			while (!stop && (node = nodeStack.pop())) {
				if (node.nodeType === Node.TEXT_NODE) {
					const nextCharIndex = charIndex + node.length;
					if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
						range.setStart(node, savedSel.start - charIndex);
						foundStart = true;
					}
					if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
						range.setEnd(node, savedSel.end - charIndex);
						stop = true;
					}
					charIndex = nextCharIndex;
				} else {
					let i = node.childNodes.length;
					while (i--) {
						nodeStack.push(node.childNodes[i]);
					}
				}
			}
			if (foundStart) {
				sel.removeAllRanges();
				sel.addRange(range);
			}
		} catch (_) {}
	}

	function renderReply() {
		renderTimer = 0;
		if (isUserSelecting) {
			renderPending = true;
			return;
		}
		const block = replyBlock();
		const savedSel = getSelectionRangeInfo(block);
		block.replaceChildren(window.YanaMarkdown.render(ui.replyText));
		const actionToolbar = el('div', 'reply-action-bar');
		const textToCopy = ui.replyText;
		const copyBtn = button('reply-action-btn mono', '📋 Copy', () => {
			navigator.clipboard.writeText(textToCopy).then(() => {
				copyBtn.textContent = '✓ Copied';
				copyBtn.classList.add('copied');
				setTimeout(() => {
					copyBtn.textContent = '📋 Copy';
					copyBtn.classList.remove('copied');
				}, 2000);
			}).catch(() => {
				try {
					const range = document.createRange();
					range.selectNodeContents(block);
					const sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange(range);
					document.execCommand('copy');
					copyBtn.textContent = '✓ Copied';
					copyBtn.classList.add('copied');
					setTimeout(() => {
						copyBtn.textContent = '📋 Copy';
						copyBtn.classList.remove('copied');
					}, 2000);
				} catch (_) {}
			});
		}, 'Copy response to clipboard');
		const speakBtn = button('reply-action-btn mono', '🔊 Speak', () => {
			window.YanaVoice?.speakText('', textToCopy);
		}, 'Read this response aloud');
		actionToolbar.append(copyBtn, speakBtn);
		block.append(actionToolbar);
		if (savedSel) {
			restoreSelectionRangeInfo(block, savedSel);
		} else {
			feed.scrollTop = feed.scrollHeight;
		}
	}
	function appendReply(text) {
		ui.replyText += text;
		if (!renderTimer) renderTimer = setTimeout(renderReply, STREAM_RENDER_MS);
	}

	function renderConversation(data) {
		resetFeed();
		conversationTitle.textContent = data.title || 'New conversation';
		const messages = Array.isArray(data.messages) ? data.messages : [];
		for (const message of messages) {
			if (message.role === 'user') {
				renderIntent(message.content, '');
			} else if (message.role === 'assistant') {
				ui.replyText = message.content || '';
				renderReply();
				ui.reply = null;
			}
		}
	}

	function traceCard() {
		if (ui.trace) return ui.trace;
		const card = el('div', 'card trace');
		const head = el('div', 'card-head mono');
		const title = el('span', 'running', '● Agent running…');
		head.append(title);
		const rows = el('div', 'trace-rows');
		card.append(head, rows);
		append(card);
		ui.trace = { card, title, rows, byCall: new Map() };
		return ui.trace;
	}
	function traceRow(callId, icon, text, badge, badgeClass) {
		const trace = traceCard();
		let row = trace.byCall.get(callId);
		if (!row) {
			row = { node: el('div', 'trace-row mono'), icon: el('span', 'trace-icon'), text: el('span', 'trace-text'), badge: el('span', 'chip') };
			row.node.append(row.icon, row.text, row.badge);
			trace.rows.append(row.node);
			if (callId) trace.byCall.set(callId, row);
		}
		row.icon.textContent = icon;
		if (text) {
			row.text.textContent = text;
			const matchPath = text.match(/(?:file|path|edit|in)\s+([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)/i);
			if (matchPath) {
				row.text.title = `Click to open ${matchPath[1]} in editor`;
				row.text.style.cursor = 'pointer';
				row.text.onclick = () => vscode.postMessage({ type: 'openFile', path: matchPath[1] });
			}
		}
		row.badge.textContent = badge || '';
		row.badge.className = badge ? `chip ${badgeClass}` : 'chip';
		feed.scrollTop = feed.scrollHeight;
	}

	function replyBlock() {
		if (!ui.reply) {
			ui.reply = el('div', 'reply');
			append(ui.reply);
		}
		return ui.reply;
	}

	function buildDiffCard(filePath, additions, deletions, lines, label = 'diff') {
		const card = el('div', 'diff-card mono');
		const head = el('div', 'diff-head');
		const fileSpan = el('span', 'diff-file', `${label}: ${filePath}`);
		fileSpan.title = 'Click to open file in editor';
		fileSpan.style.cursor = 'pointer';
		fileSpan.addEventListener('click', () => {
			vscode.postMessage({ type: 'openFile', path: filePath });
		});

		const stats = el('span', 'diff-stats', `+${additions || 0} `);
		stats.append(el('span', 'del', `-${deletions || 0}`));

		const actions = el('div', 'diff-head-actions');
		const openBtn = button('diff-btn-open mono', 'Open', () => {
			vscode.postMessage({ type: 'openFile', path: filePath });
		}, 'Open file in editor');
		const copyDiffBtn = button('diff-btn-copy mono', 'Copy Diff', () => {
			navigator.clipboard.writeText((lines || []).join('\n')).then(() => {
				copyDiffBtn.textContent = '✓ Copied';
				setTimeout(() => copyDiffBtn.textContent = 'Copy Diff', 2000);
			});
		}, 'Copy diff lines');
		const toggleBtn = button('diff-btn-toggle mono', '▾', () => {
			const isHidden = body.style.display === 'none';
			body.style.display = isHidden ? 'block' : 'none';
			toggleBtn.textContent = isHidden ? '▾' : '▸';
		}, 'Toggle diff visibility');
		actions.append(openBtn, copyDiffBtn, toggleBtn);

		head.append(fileSpan, stats, actions);
		card.append(head);

		const body = el('div', 'diff-body');
		(lines || []).forEach(line => {
			let lineCls = 'diff-line-ctx';
			if (line.startsWith('+')) lineCls = 'diff-line-add';
			else if (line.startsWith('-')) lineCls = 'diff-line-del';
			else if (line.startsWith('@@')) lineCls = 'diff-line-hunk';
			body.append(el('div', lineCls, line));
		});
		card.append(body);

		return card;
	}

	function renderDiffCard(filePath, additions, deletions, lines) {
		append(buildDiffCard(filePath, additions, deletions, lines));
	}

	// Điều người dùng sắp duyệt khi model xin ghi file: file nào, loại gì, những dòng nào đổi (do yana-rt gửi kèm
	// sự kiện xin duyệt). Chỉ hiển thị; việc ghi vẫn do yana-rt làm sau khi người dùng bấm Approve.
	function approvalPreview(preview) {
		const box = el('div', 'approval-preview');
		if (preview.error) {
			box.append(el('div', 'bad mono', `This write cannot be applied: ${preview.error}`));
			return box;
		}
		box.append(buildDiffCard(preview.path, preview.additions, preview.deletions, preview.lines, preview.kind));
		if (preview.truncated) box.append(el('div', 'muted', 'Only the first lines of a larger change are shown.'));
		return box;
	}

	function renderApproval(event) {
		const card = el('div', 'card approval');
		const head = el('div', 'approval-head');
		head.append(el('div', 'approval-title mono', '⚠ Approval needed'));

		// 30-minute countdown expiration timer
		let remainingSec = 30 * 60;
		if (event.expires_at) {
			const expTime = new Date(event.expires_at).getTime();
			const now = Date.now();
			if (!isNaN(expTime) && expTime > now) {
				remainingSec = Math.floor((expTime - now) / 1000);
			}
		}
		const timerBadge = el('span', 'approval-timer mono');
		let intervalId = 0;
		function updateTimer() {
			if (remainingSec <= 0) {
				timerBadge.textContent = 'Expired (30m)';
				timerBadge.className = 'approval-timer expired mono';
				approveBtn.disabled = true;
				denyBtn.disabled = true;
				if (intervalId) clearInterval(intervalId);
				return;
			}
			const m = Math.floor(remainingSec / 60);
			const s = remainingSec % 60;
			timerBadge.textContent = `⏱ ${m}:${s < 10 ? '0' : ''}${s}`;
			remainingSec--;
		}
		updateTimer();
		intervalId = setInterval(updateTimer, 1000);
		head.append(timerBadge);
		card.append(head);

		const body = el('div', 'approval-body');
		body.append(el('span', '', 'Yana wants to use '), el('code', 'cap', event.capability || ui.pendingCall?.tool || '?'));
		card.append(body);
		const summary = ui.pendingCall?.summary;
		if (summary) card.append(el('pre', 'approval-summary mono', summary));
		if (ui.pendingCall?.preview) card.append(approvalPreview(ui.pendingCall.preview));
		if (event.reason) card.append(el('div', 'muted', event.reason));
		const actions = el('div', 'approval-actions');
		const decide = decision => {
			if (intervalId) clearInterval(intervalId);
			timerBadge.remove();
			const statusSpan = el('span', decision ? 'ok mono' : 'bad mono', decision ? 'Approved' : 'Denied');
			actions.replaceChildren(statusSpan);
			if (decision) {
				const undoBtn = button('btn-sm mono', 'Undo', () => {}, 'Undo is not available yet (requires yana-rt backup restore API)');
				undoBtn.disabled = true;
				actions.append(undoBtn);
			}
			ui.reply = null;
			ui.replyText = '';
			vscode.postMessage({ type: 'decide', approvalId: event.approval_id, decision });
		};
		const approveBtn = button('approve mono', 'Approve', () => decide(true));
		const denyBtn = button('deny mono', 'Deny', () => decide(false));
		actions.append(approveBtn, denyBtn);
		card.append(actions);
		append(card);
	}

	function finishTrace(label, cls) {
		if (!ui.trace) return;
		ui.trace.title.textContent = label;
		ui.trace.title.className = cls;
	}

	function renderEvent(event) {
		if (event.type === 'text_delta') {
			appendReply(event.text || '');
		} else if (event.type === 'metrics') {
			ui.tokens.input += event.input_tokens || 0;
			ui.tokens.output += event.output_tokens || 0;
			footerTokens.textContent = `${ui.tokens.input} in · ${ui.tokens.output} out`;
		} else if (event.type === 'runtime_event') {
			renderRuntimeEvent(event);
		} else if (event.type === 'authority_denied') {
			traceRow('', '✕', `${event.authority}: ${event.reason}`, 'DENY', 'bad');
		} else if (event.type === 'awaiting_approval') {
			finishTrace('● Paused — waiting for approval', 'waiting');
			renderApproval(event);
		} else if (event.type === 'completed') {
			finishTrace('● Done', 'ok');
			if (renderPending) { renderPending = false; renderReply(); }
			if (!ui.replyText && event.message) appendReply(event.message);
		} else if (event.type === 'cancelled') {
			finishTrace('● Cancelled', 'muted');
			if (renderPending) { renderPending = false; renderReply(); }
		} else if (event.type === 'error') {
			finishTrace('● Failed', 'bad');
			const msg = event.message || 'Runtime error';
			const errCard = el('div', 'card error mono');
			const msgDiv = el('div', 'error-text', msg);
			errCard.append(msgDiv);
			if (/restricted mode|trust it|trust this folder/i.test(msg)) {
				const actionRow = el('div', 'restricted-actions');
				const trustBtn = button('btn-trust primary mono', '🛡️ Trust Workspace (Tin cậy thư mục)', () => {
					vscode.postMessage({ type: 'manageTrust' });
				}, 'Open Workspace Trust dialog to allow running commands and editing files');
				actionRow.append(trustBtn);
				errCard.append(actionRow);
			}
			append(errCard);
		}
	}

	function renderRuntimeEvent(event) {
		switch (event.kind) {
			case 'tool_requested': traceRow(event.call_id, '○', `${event.tool}: ${event.summary || ''}`, 'CHECK', 'muted'); break;
			case 'tool_approved': traceRow(event.call_id, '✓', '', 'ALLOW', 'ok'); break;
			case 'tool_started': traceRow(event.call_id, '◌', '', 'RUNNING', 'info'); break;
			case 'tool_completed':
				traceRow(event.call_id, event.ok ? '✓' : '✕', event.summary || '', event.denied ? 'DENY' : event.ok ? 'OK' : 'FAIL', event.ok ? 'ok' : 'bad');
				if (event.diff) {
					renderDiffCard(event.file || event.summary || 'modified file', event.additions || 0, event.deletions || 0, event.diff);
				}
				break;
			case 'tool_denied': traceRow(event.call_id, '✕', event.reason || '', 'DENY', 'bad'); break;
			case 'human_approval_required':
				ui.pendingCall = { tool: event.tool, summary: event.summary, preview: event.preview };
				traceRow(event.call_id, '!', `${event.tool}: ${event.summary || ''}`, 'APPROVAL', 'warn');
				break;
			case 'proposed_diff':
				renderDiffCard(event.file, event.additions, event.deletions, event.lines);
				break;
			case 'turn_completed': break;
			default: break;
		}
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'state') renderState(data);
		else if (data?.type === 'intent') renderIntent(data.text, data.at, data.images, data.files);
		else if (data?.type === 'event') renderEvent(data.event);
		else if (data?.type === 'conversation') renderConversation(data);
		else if (data?.type === 'prefill') { input.value = data.text || ''; input.focus(); }
		else if (data?.type === 'attachImage') { attachImageObj(data.image); }
		else if (data?.type === 'attachFile') { attachFileObj(data.file); }
		else if (data?.type === 'insertText') { insertTextAtCursor(data.text); }
		else if (data?.type === 'assistants') { window.YanaAssistants?.setAssistantsData(data.items, data.selectedId); }
		else if (data?.type === 'mentions') { window.YanaMentions?.setSuggestions(data); }
		else if (data?.type === 'voice.state') { window.YanaVoice?.updateVoiceState(data); }
		else if (data?.type === 'voice.transcript') { window.YanaVoice?.handleTranscript(data.text); }
		else if (data?.type === 'editProposals') { editManager?.render(data.items); }
		else if (data?.type === 'editResult') { editManager?.status(data); }
	});
	vscode.postMessage({ type: 'ready' });
})();
