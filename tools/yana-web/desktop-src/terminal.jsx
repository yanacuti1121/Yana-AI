// Yana AI — unified local workspace.
//
// The runtime tab embeds the real `yana-rt chat` process through Electron's
// PTY bridge. The Studio tab keeps the existing loopback-only code-server
// workspace. Both stay mounted after first use so switching pages does not
// discard a chat session, editor tab, or terminal buffer.
import React from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
import { L, PageHeader } from './components.jsx';
import { IS_ELECTRON } from './lib/is-electron.js';

const { useEffect, useRef, useState } = React;

function xtermTheme() {
  const style = getComputedStyle(document.documentElement);
  const value = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: value('--runtime-terminal-bg', '#0b1020'),
    foreground: value('--ink', '#e8eefb'),
    cursor: value('--sakura', '#ffb7c5'),
    cursorAccent: value('--runtime-terminal-bg', '#0b1020'),
    selectionBackground: value('--primary-soft', 'rgba(56, 189, 248, .24)'),
    black: '#0f172a',
    red: '#fb7185',
    green: value('--matcha', '#4ade80'),
    yellow: '#facc15',
    blue: value('--lotus-blue', '#38bdf8'),
    magenta: value('--sakura', '#f48fb1'),
    cyan: '#67e8f9',
    white: '#e8eefb',
    brightBlack: '#64748b',
    brightRed: '#fda4af',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#7dd3fc',
    brightMagenta: '#f9a8d4',
    brightCyan: '#a5f3fc',
    brightWhite: '#ffffff',
  };
}

function LotusWatermark() {
  return (
    <svg className="runtime-lotus" viewBox="0 0 240 180" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M120 145c-25-20-39-46-38-78 24 8 38 28 38 57 0-29 14-49 38-57 1 32-13 58-38 78Z" />
        <path d="M120 143c-38-8-63-29-73-61 31-1 55 15 73 48-18-33-16-62 5-86 19 24 18 57-5 99Z" />
        <path d="M120 143c38-8 63-29 73-61-31-1-55 15-73 48 18-33 16-62-5-86-19 24-18 57 5 99Z" />
        <path d="M49 145c35 15 107 15 142 0M67 158c28 10 78 10 106 0" opacity=".7" />
      </g>
    </svg>
  );
}

function RuntimeFact({ tone, label, value }) {
  return (
    <div className="runtime-fact">
      <span className={`runtime-fact-dot ${tone}`} aria-hidden="true" />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function BrowserRuntimeNotice() {
  return (
    <div className="runtime-browser-notice">
      <span className="runtime-browser-orbit" aria-hidden="true" />
      <h2>{L('Yana Core lives on your machine', 'Yana Core chạy trên máy của anh', 'Yana Core는 로컬 기기에서 실행됩니다', 'Yana Core 在本机运行')}</h2>
      <p>{L(
        'Open this workspace in the Yana AI desktop app to attach the real yana-rt PTY. The browser build never emulates or bypasses the runtime.',
        'Mở workspace bằng app Yana AI để kết nối PTY thật của yana-rt. Bản trình duyệt không giả lập hoặc đi vòng qua runtime.',
        '실제 yana-rt PTY를 연결하려면 Yana AI 데스크톱 앱에서 여세요. 브라우저 빌드는 런타임을 모방하거나 우회하지 않습니다.',
        '请在 Yana AI 桌面应用中打开以连接真实的 yana-rt PTY。浏览器版本不会模拟或绕过运行时。',
      )}</p>
    </div>
  );
}

function RuntimeTerminal({ onStatus }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontSize: 13,
      lineHeight: 1.28,
      letterSpacing: 0.2,
      fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
      scrollback: 10_000,
      theme: xtermTheme(),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    // RESIZE FIX (found in review): fitAddon.fit() only updates xterm.js's
    // own visual grid. Without telling the backend pty_bridge the new
    // size too, the real pty (and whatever's running inside it) silently
    // drifts out of sync with what's actually on screen — line wrapping,
    // curses-style redraws, and `tput cols`/`$COLUMNS` all go stale. This
    // is a best-effort call (no-op with a caught error on a platform that
    // doesn't support it, or before the session has actually started) —
    // never blocks the resize from applying visually even if it fails.
    const fit = () => {
      try {
        fitAddon.fit();
        window.yana.ptyResize?.({ cols: terminal.cols, rows: terminal.rows }).catch(() => {});
      } catch (_) {}
    };
    requestAnimationFrame(fit);

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fit));
    resizeObserver.observe(containerRef.current);

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = xtermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });

    const unsubscribeData = window.yana.onPtyData((chunk) => terminal.write(chunk));
    const unsubscribeExit = window.yana.onPtyExit((code) => {
      onStatus('exited');
      terminal.write(`\r\n\x1b[2m[yana-rt exited: ${code ?? 'unknown'}]\x1b[0m\r\n`);
    });
    const inputSubscription = terminal.onData((data) => window.yana.ptyWrite(data));

    onStatus('starting');
    window.yana.ptyStart({ cols: terminal.cols, rows: terminal.rows, args: [] }).then((result) => {
      if (result?.ok === false) {
        onStatus('exited');
        terminal.write(`\x1b[31m${result.error}\x1b[0m\r\n`);
      } else {
        onStatus('running');
        terminal.focus();
      }
    }).catch((error) => {
      onStatus('exited');
      terminal.write(`\x1b[31m${error.message}\x1b[0m\r\n`);
    });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      unsubscribeData();
      unsubscribeExit();
      inputSubscription.dispose();
      window.yana.ptyStop();
      terminal.dispose();
    };
  }, [onStatus]);

  return <div ref={containerRef} className="runtime-xterm" aria-label="yana-rt chat terminal" />;
}

function RuntimeWorkspace({ active }) {
  const [started, setStarted] = useState(false);
  const [instance, setInstance] = useState(0);
  const [status, setStatus] = useState('idle');
  const setRuntimeStatus = React.useCallback((next) => setStatus(next), []);

  useEffect(() => {
    if (active && IS_ELECTRON) setStarted(true);
  }, [active]);

  const restart = () => {
    setStatus('starting');
    setInstance((value) => value + 1);
  };

  return (
    <section className="runtime-workspace" data-status={status}>
      <aside className="runtime-rail">
        <div>
          <span className="runtime-eyebrow">YANA LOCAL RUNTIME</span>
          <h2>Core Console</h2>
          <p>{L(
            'A real local chat session. Provider, tools, approvals, history and cost tracking stay inside yana-rt.',
            'Phiên chat local thật. Provider, tool, phê duyệt, lịch sử và theo dõi chi phí đều nằm trong yana-rt.',
            '실제 로컬 채팅 세션입니다. 공급자, 도구, 승인, 기록과 비용 추적은 yana-rt 내부에 유지됩니다.',
            '真实的本地聊天会话。提供商、工具、审批、历史和成本跟踪均保留在 yana-rt 内。',
          )}</p>
        </div>
        <div className="runtime-facts">
          <RuntimeFact tone="blue" label={L('Engine', 'Lõi', '엔진', '引擎')} value="yana-rt" />
          <RuntimeFact tone="pink" label={L('Transport', 'Kết nối', '전송', '传输')} value="Local PTY" />
          <RuntimeFact tone="green" label={L('Authority', 'Quyền kiểm soát', '권한', '权限')} value="Rust guards" />
        </div>
        <div className="runtime-status" aria-live="polite">
          <span className={`runtime-status-dot ${status}`} />
          <span>{status === 'running'
            ? L('Runtime connected', 'Runtime đã kết nối', '런타임 연결됨', '运行时已连接')
            : status === 'starting'
              ? L('Starting runtime…', 'Đang khởi động runtime…', '런타임 시작 중…', '正在启动运行时…')
              : status === 'exited'
                ? L('Runtime stopped', 'Runtime đã dừng', '런타임 중지됨', '运行时已停止')
                : L('Ready to attach', 'Sẵn sàng kết nối', '연결 준비됨', '准备连接')}</span>
        </div>
        {status === 'exited' && IS_ELECTRON && (
          <button className="runtime-restart" onClick={restart}>
            {L('Restart yana-rt', 'Khởi động lại yana-rt', 'yana-rt 재시작', '重启 yana-rt')}
          </button>
        )}
      </aside>
      <div className="runtime-terminal-frame">
        <LotusWatermark />
        {IS_ELECTRON
          ? started && <RuntimeTerminal key={instance} onStatus={setRuntimeStatus} />
          : <BrowserRuntimeNotice />}
      </div>
    </section>
  );
}

export function TerminalPanel({ active }) {
  const [view, setView] = useState('runtime');
  const [studioLoaded, setStudioLoaded] = useState(false);

  useEffect(() => {
    if (active && view === 'studio') setStudioLoaded(true);
  }, [active, view]);

  return (
    <div className="terminal-page" style={{ display: active ? 'flex' : 'none' }}>
      <PageHeader
        title={L('Local Workspace', 'Không gian local', '로컬 워크스페이스', '本地工作区')}
        sub={L(
          'Talk to yana-rt directly, or open the full local Studio.',
          'Trò chuyện trực tiếp với yana-rt, hoặc mở Studio local đầy đủ.',
          'yana-rt와 직접 대화하거나 전체 로컬 Studio를 여세요.',
          '直接与 yana-rt 对话，或打开完整的本地 Studio。',
        )}
      >
        <div className="terminal-tabs" role="tablist" aria-label={L('Workspace view', 'Chế độ workspace', '워크스페이스 보기', '工作区视图')}>
          <button role="tab" aria-selected={view === 'runtime'} className={view === 'runtime' ? 'active' : ''} onClick={() => setView('runtime')}>
            <span className="terminal-tab-orb core" /> Yana Core
          </button>
          <button role="tab" aria-selected={view === 'studio'} className={view === 'studio' ? 'active' : ''} onClick={() => setView('studio')}>
            <span className="terminal-tab-orb studio" /> Studio
          </button>
        </div>
      </PageHeader>

      <div className="terminal-view" role="tabpanel" hidden={view !== 'runtime'}>
        <RuntimeWorkspace active={active && view === 'runtime'} />
      </div>

      <div className="terminal-view studio-view" role="tabpanel" hidden={view !== 'studio'}>
        {studioLoaded ? (
          <iframe src="http://127.0.0.1:8092" title="Yana Studio (code-server)" />
        ) : (
          <div className="studio-placeholder">
            <span className="runtime-browser-orbit" aria-hidden="true" />
            <p>{L('Studio loads only when opened.', 'Studio chỉ tải khi anh mở.', 'Studio는 열 때만 로드됩니다.', 'Studio 仅在打开时加载。')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
