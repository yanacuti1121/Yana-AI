import { useEffect, useRef, useState } from "react";
import { Terminal as Xterm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import type { TerminalSession } from "./types";
import { studioTerminalTheme } from "./terminal-theme";
import { translate, type Locale } from "./i18n";

export function Terminal({
  session,
  visible,
  active,
  onActivate,
  onError,
  locale,
}: {
  session: TerminalSession;
  visible: boolean;
  active: boolean;
  onActivate: () => void;
  onError: (message: string) => void;
  locale: Locale;
}) {
  const t = translate(locale);
  const element = useRef<HTMLDivElement>(null);
  const terminal = useRef<Xterm | null>(null);
  const fitter = useRef<FitAddon | null>(null);
  const searcher = useRef<SearchAddon | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [exit, setExit] = useState<number | null>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    if (!element.current) return;
    let disposed = false;
    const instance = new Xterm({
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      scrollback: 10000,
      allowProposedApi: false,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      theme: studioTerminalTheme,
    });
    const fit = new FitAddon();
    const find = new SearchAddon();
    instance.loadAddon(fit);
    instance.loadAddon(find);
    instance.open(element.current);
    terminal.current = instance;
    fitter.current = fit;
    searcher.current = find;
    const fail = (error: unknown) => {
      if (!disposed) errorRef.current(String(error));
    };
    instance.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f"
      ) {
        setSearchOpen(true);
        return false;
      }
      if (event.metaKey && ["c", "v", "a"].includes(event.key.toLowerCase()))
        return false;
      return true;
    });
    const input = instance.onData((text) => {
      void window.studio.terminalWrite(session.id, text).catch(fail);
    });
    const resize = instance.onResize((size) => {
      void window.studio
        .terminalResize(session.id, size.cols, size.rows)
        .catch(fail);
    });
    const unsubscribe = window.studio.on("terminal:data", (event) => {
      if (event.id !== session.id) return;
      instance.write(event.data, () => {
        if (!disposed)
          void window.studio
            .terminalAck(session.id, event.sequence)
            .catch(fail);
      });
    });
    const unsubExit = window.studio.on("terminal:exit", (event) => {
      if (event.id === session.id) setExit(event.exitCode);
    });
    let fitFrame = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver(() => {
      if (fitFrame) return;
      fitFrame = requestAnimationFrame(() => {
        fitFrame = 0;
        const target = element.current;
        if (!target || target.clientWidth <= 0 || target.clientHeight <= 0)
          return;
        if (
          target.clientWidth === lastWidth &&
          target.clientHeight === lastHeight
        )
          return;
        lastWidth = target.clientWidth;
        lastHeight = target.clientHeight;
        fit.fit();
      });
    });
    observer.observe(element.current);
    void import("@xterm/addon-webgl")
      .then(({ WebglAddon }) => {
        if (disposed) return;
        try {
          const addon = new WebglAddon();
          addon.onContextLoss(() => addon.dispose());
          instance.loadAddon(addon);
        } catch {}
      })
      .catch(() => {});
    void window.studio.terminalSubscribe(session.id).catch(fail);
    return () => {
      disposed = true;
      if (fitFrame) cancelAnimationFrame(fitFrame);
      observer.disconnect();
      unsubscribe();
      unsubExit();
      input.dispose();
      resize.dispose();
      instance.dispose();
    };
  }, [session.id]);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fitter.current?.fit();
      if (active) terminal.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, active]);
  return (
    <div
      className={`terminal-pane ${active ? "focused" : ""}`}
      hidden={!visible}
      data-terminal={session.id}
      onPointerDown={onActivate}
    >
      <button
        className="pane-caption"
        aria-label={`Focus ${session.label}`}
        onClick={() => {
          onActivate();
          terminal.current?.focus();
        }}
      >
        <span>{session.label}</span>
        <span>{session.root}</span>
      </button>
      {searchOpen && (
        <div className="terminal-search">
          <input
            aria-label="Find in terminal"
            autoFocus
            value={search}
            placeholder={t("terminalSearch")}
            onChange={(event) => {
              setSearch(event.target.value);
              searcher.current?.findNext(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") searcher.current?.findNext(search);
              if (event.key === "Escape") {
                setSearchOpen(false);
                terminal.current?.focus();
              }
            }}
          />
          <button
            onClick={() => setSearchOpen(false)}
            aria-label="Close terminal search"
          >
            ×
          </button>
        </div>
      )}
      <div ref={element} className="terminal-emulator" />
      {exit !== null && (
        <div className="exit-status">
          {t("terminalExit")} · exit {exit}. +
        </div>
      )}
    </div>
  );
}
