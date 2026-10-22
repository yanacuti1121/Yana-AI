// Voice Recording & Read Aloud Controls (Section F & P.5 of ASSISTANT-FEATURES.md)
// Strict rule: textContent only, clear privacy indicator (local vs cloud), editable before sending
(function () {
	'use strict';

	let voiceCapabilities = { input: false, output: false };
	let voiceState = { phase: 'idle', cloud: false, error: '' };
	let indicatorNode = null;
	let targetInput = null;

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function button(className, label, onClick, title) {
		const node = el('button', className, label);
		node.type = 'button';
		if (onClick) node.addEventListener('click', onClick);
		if (title) node.title = title;
		return node;
	}

	function init(inputElement) {
		targetInput = inputElement;
		indicatorNode = el('div', 'voice-indicator-banner');
		indicatorNode.style.display = 'none';
	}

	function getIndicatorElement() {
		return indicatorNode;
	}

	// Nút micro chỉ hiện khi phần trong báo giọng nói dùng được (capabilities.voice.input). Không hiện nút chưa chạy được.
	function showMic(visible) {
		document.querySelectorAll('.mic-btn').forEach(node => { node.style.display = visible ? '' : 'none'; });
	}

	function updateCapabilities(caps) {
		if (caps?.voice) {
			voiceCapabilities = caps.voice;
		}
		showMic(Boolean(voiceCapabilities.input));
	}

	function updateVoiceState(state) {
		if (!state) return;
		voiceState = Object.assign({}, voiceState, state);
		renderIndicator();
	}

	function handleTranscript(text) {
		if (!targetInput || !text) return;
		const trimmed = text.trim();
		if (!trimmed) return;
		// Insert into input box allowing user to review/edit before sending (Rule F2)
		if (targetInput.value) {
			targetInput.value += ' ' + trimmed;
		} else {
			targetInput.value = trimmed;
		}
		targetInput.focus();
		// Automatically adjust height
		targetInput.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function toggleRecording() {
		if (!voiceCapabilities.input) {
			showNotification('Voice input is not available yet. Configure voice runtime in Settings.');
			return;
		}
		if (voiceState.phase === 'recording') {
			stopRecording();
		} else {
			startRecording();
		}
	}

	function startRecording() {
		window.vscode?.postMessage({ type: 'voice.start' });
		voiceState.phase = 'recording';
		renderIndicator();
	}

	function stopRecording() {
		window.vscode?.postMessage({ type: 'voice.stop' });
		voiceState.phase = 'transcribing';
		renderIndicator();
	}

	function speakText(messageId, text) {
		if (!voiceCapabilities.output) {
			// Fallback: Check if Web Speech API is supported locally in browser/webview
			if (window.speechSynthesis && text) {
				window.speechSynthesis.cancel();
				const utterance = new SpeechSynthesisUtterance(text);
				window.speechSynthesis.speak(utterance);
				return;
			}
			showNotification('Voice read aloud is not available yet.');
			return;
		}
		window.vscode?.postMessage({ type: 'voice.speak', messageId });
	}

	function renderIndicator() {
		if (!indicatorNode) return;
		indicatorNode.replaceChildren();

		if (voiceState.phase === 'idle') {
			indicatorNode.style.display = 'none';
			return;
		}

		indicatorNode.style.display = 'flex';
		const pulse = el('span', 'voice-pulse-dot');
		const statusText = el('span', 'voice-status-text mono');

		if (voiceState.phase === 'recording') {
			pulse.className = 'voice-pulse-dot recording';
			const privacyNote = voiceState.cloud
				? 'Audio sent to cloud (OpenAI Whisper)'
				: 'Audio processed locally (whisper.cpp - private)';
			statusText.textContent = `🎙️ Recording active · ${privacyNote}`;

			const stopBtn = button('btn btn-sm danger', 'Stop & Transcribe', () => stopRecording());
			indicatorNode.append(pulse, statusText, stopBtn);
		} else if (voiceState.phase === 'transcribing') {
			pulse.className = 'voice-pulse-dot processing';
			statusText.textContent = '⏳ Transcribing audio into text…';
			indicatorNode.append(pulse, statusText);
		} else if (voiceState.phase === 'speaking') {
			pulse.className = 'voice-pulse-dot speaking';
			statusText.textContent = '🔊 Reading response aloud…';
			const stopBtn = button('btn btn-sm', 'Stop', () => {
				if (window.speechSynthesis) window.speechSynthesis.cancel();
				voiceState.phase = 'idle';
				renderIndicator();
			});
			indicatorNode.append(pulse, statusText, stopBtn);
		}

		if (voiceState.error) {
			const errSpan = el('span', 'badge warn', voiceState.error);
			indicatorNode.append(errSpan);
		}
	}

	function showNotification(msg) {
		if (!indicatorNode) return;
		indicatorNode.replaceChildren();
		indicatorNode.style.display = 'flex';
		indicatorNode.append(el('span', 'voice-status-text muted', msg));
		setTimeout(() => {
			if (voiceState.phase === 'idle') {
				indicatorNode.style.display = 'none';
			}
		}, 3000);
	}

	window.YanaVoice = {
		init,
		getIndicatorElement,
		updateCapabilities,
		updateVoiceState,
		handleTranscript,
		toggleRecording,
		startRecording,
		stopRecording,
		speakText
	};
})();
