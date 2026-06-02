import { useCallback, useEffect, useRef } from "react";

import { replayTerminalHistory } from "../terminalReplay";
import { wheelDeltaToScrollLines } from "../terminalWheel";

type ActiveTerminal = {
  write: (value: string, callback?: () => void) => void;
  scrollLines: (lineCount: number) => void;
  clear: () => void;
  reset: () => void;
  clearSelection?: () => void;
  refresh?: (start: number, end: number) => void;
  rows: number;
};

type UseXtermInstanceOptions = {
  terminalId: string;
  layoutVersion?: string | number | undefined;
  /** Forwards terminal keystrokes to the socket (`sendInput`). */
  onData: (data: string) => void;
  /** Sends a debounced resize to the socket (`sendResize`). */
  onResize: (cols: number, rows: number) => void;
  /** Reports the dynamic-import failure path so the caller can show a fallback. */
  onSetupError: () => void;
};

type UseXtermInstanceResult = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Bridges socket `history` messages, buffering until the terminal exists. */
  handleHistory: (data: string) => void;
  /** Bridges socket `output` messages, buffering until the terminal exists. */
  handleOutput: (data: string) => void;
  /** Flushes a resize sync when the socket (re)opens. */
  requestResizeSync: () => void;
};

/**
 * Owns the xterm instance: the dynamic import + terminal construction/theming,
 * the wheel/pointer/visibility listeners, the ResizeObserver and resize-debounce
 * scheduler, and the `layoutVersion` re-fit effect. It also keeps the
 * pending-history/pending-output buffers so socket data that arrives before the
 * terminal is constructed (or while in test mode) is replayed once xterm loads.
 *
 * The test-mode short-circuit (`import.meta.env.MODE === "test"`) is preserved
 * here so jsdom never tries to load xterm. The setup effect is keyed on
 * `[terminalId]` (re-create the terminal when the id changes) and the re-fit
 * effect on `[layoutVersion]`, both matching the original component exactly.
 * Socket callbacks are read through refs so they never re-trigger setup.
 */
export const useXtermInstance = ({
  terminalId,
  layoutVersion,
  onData,
  onResize,
  onSetupError,
}: UseXtermInstanceOptions): UseXtermInstanceResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<ActiveTerminal | null>(null);
  const fitAddonRef = useRef<{ fit: () => void } | null>(null);
  const requestResizeSyncRef = useRef<() => void>(() => {});

  const activeTerminalRef = useRef<ActiveTerminal | null>(null);
  const pendingHistoryRef = useRef<string | null>(null);
  const pendingOutputRef = useRef<string[]>([]);

  const callbacksRef = useRef({ onData, onResize, onSetupError });
  callbacksRef.current = { onData, onResize, onSetupError };

  const handleHistory = useCallback((data: string) => {
    const activeTerminal = activeTerminalRef.current;
    if (activeTerminal) {
      const viewport = containerRef.current?.querySelector<HTMLElement>(".xterm-viewport") ?? null;
      replayTerminalHistory(activeTerminal, data, viewport);
      return;
    }

    pendingHistoryRef.current = data;
    pendingOutputRef.current.length = 0;
  }, []);

  const handleOutput = useCallback((data: string) => {
    const activeTerminal = activeTerminalRef.current;
    if (activeTerminal) {
      activeTerminal.write(data);
      return;
    }

    pendingOutputRef.current.push(data);
  }, []);

  const requestResizeSync = useCallback(() => {
    requestResizeSyncRef.current();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: terminalId is an intentional re-init trigger — a new terminal id must rebuild the xterm instance and reset its buffers, preserving the pre-split single-effect behavior.
  useEffect(() => {
    let isCancelled = false;
    let cleanupTerminal = () => {};
    requestResizeSyncRef.current = () => {};
    // Reset per-terminal buffers so a terminalId change starts clean, matching
    // the original effect where these were declared inside the effect body.
    activeTerminalRef.current = null;
    pendingHistoryRef.current = null;
    pendingOutputRef.current.length = 0;

    if (import.meta.env.MODE === "test") {
      return () => {
        isCancelled = true;
        requestResizeSyncRef.current = () => {};
        cleanupTerminal();
      };
    }

    void (async () => {
      if (!containerRef.current) {
        return;
      }

      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("xterm"),
          import("@xterm/addon-fit"),
        ]);

        if (isCancelled || !containerRef.current) {
          return;
        }

        const rootFontSize = Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        );
        const terminalFontSize = Number.isFinite(rootFontSize)
          ? Math.max(13, Math.round(rootFontSize * 0.82))
          : 13;
        const terminalBackground =
          window
            .getComputedStyle(document.documentElement)
            .getPropertyValue("--terminal-bg")
            .trim() || "#101722";

        const terminal = new Terminal({
          cursorBlink: true,
          cursorInactiveStyle: "bar",
          cursorStyle: "bar",
          cursorWidth: 2,
          fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
          fontSize: terminalFontSize,
          theme: {
            background: terminalBackground,
            foreground: "#e8e8e8",
            cursor: "#fafafa",
            cursorAccent: terminalBackground,
            selectionBackground: "#555",
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        fitAddon.fit();
        terminal.focus();

        try {
          const { Unicode11Addon } = await import("xterm-addon-unicode11");
          const unicode11Addon = new Unicode11Addon();
          terminal.loadAddon(unicode11Addon);
          terminal.unicode.activeVersion = "11";
        } catch {
          // Non-critical: terminal works without unicode11, just with less accurate character widths
        }
        activeTerminalRef.current = terminal;

        if (pendingHistoryRef.current !== null) {
          replayTerminalHistory(terminal, pendingHistoryRef.current, null);
          pendingHistoryRef.current = null;
        }
        if (pendingOutputRef.current.length > 0) {
          for (const chunk of pendingOutputRef.current) {
            terminal.write(chunk);
          }
          pendingOutputRef.current.length = 0;
        }

        const wheelListenerTarget = containerRef.current;
        const viewportWheelTarget =
          wheelListenerTarget.querySelector<HTMLElement>(".xterm-viewport") ?? wheelListenerTarget;
        const onPointerDown = () => {
          terminal.focus();
        };
        const onWheel = (event: WheelEvent) => {
          const lines = wheelDeltaToScrollLines(event.deltaY, event.deltaMode);
          if (lines === 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          terminal.scrollLines(lines);
        };
        wheelListenerTarget.addEventListener("pointerdown", onPointerDown, {
          capture: true,
        });
        viewportWheelTarget.addEventListener("wheel", onWheel, {
          passive: false,
        });

        let resizeDebounceTimer: number | null = null;
        let lastSentCols = -1;
        let lastSentRows = -1;

        const sendResize = () => {
          if (terminal.cols === lastSentCols && terminal.rows === lastSentRows) {
            return;
          }

          callbacksRef.current.onResize(terminal.cols, terminal.rows);
          lastSentCols = terminal.cols;
          lastSentRows = terminal.rows;
        };

        const scheduleResizeSync = () => {
          if (resizeDebounceTimer !== null) {
            window.clearTimeout(resizeDebounceTimer);
          }
          resizeDebounceTimer = window.setTimeout(() => {
            resizeDebounceTimer = null;
            sendResize();
          }, 60);
        };
        requestResizeSyncRef.current = scheduleResizeSync;

        const onDataDisposable = terminal.onData((data) => {
          callbacksRef.current.onData(data);
        });

        let observer: ResizeObserver | null = null;
        if ("ResizeObserver" in window) {
          observer = new ResizeObserver(() => {
            fitAddon.fit();
            scheduleResizeSync();
          });
          observer.observe(containerRef.current);
        }

        const onVisibilityChange = () => {
          if (document.visibilityState !== "visible") {
            return;
          }
          fitAddon.fit();
          if (typeof terminal.rows === "number" && terminal.rows > 0) {
            terminal.refresh(0, terminal.rows - 1);
          }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        scheduleResizeSync();
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;
        cleanupTerminal = () => {
          wheelListenerTarget.removeEventListener("pointerdown", onPointerDown, true);
          viewportWheelTarget.removeEventListener("wheel", onWheel);
          if (resizeDebounceTimer !== null) {
            window.clearTimeout(resizeDebounceTimer);
          }
          observer?.disconnect();
          document.removeEventListener("visibilitychange", onVisibilityChange);
          onDataDisposable.dispose();
          terminal.dispose();
          activeTerminalRef.current = null;
          terminalRef.current = null;
          fitAddonRef.current = null;
          requestResizeSyncRef.current = () => {};
        };
      } catch {
        callbacksRef.current.onSetupError();
      }
    })();

    return () => {
      isCancelled = true;
      requestResizeSyncRef.current = () => {};
      cleanupTerminal();
    };
  }, [terminalId]);

  useEffect(() => {
    if (layoutVersion === undefined) {
      return;
    }

    const activeTerminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!activeTerminal || !fitAddon) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      fitAddon.fit();
      requestResizeSyncRef.current();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [layoutVersion]);

  return {
    containerRef,
    handleHistory,
    handleOutput,
    requestResizeSync,
  };
};
