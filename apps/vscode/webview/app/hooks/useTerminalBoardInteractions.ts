import { useCallback, useEffect, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  RefObject,
} from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  TERMINAL_DIVIDER_WIDTH,
  TERMINAL_MIN_WIDTH,
  TERMINAL_RESIZE_STEP,
  reconcileTerminalWidths,
  resizeTerminalPair,
} from "../../layout/terminalPaneSizing";
import type { TerminalView } from "../types";

type UseTerminalBoardInteractionsOptions = {
  terminalsRef: RefObject<HTMLElement | null>;
  visibleColumns: TerminalView;
  terminalWidths: Record<string, number>;
  setTerminalWidths: Dispatch<SetStateAction<Record<string, number>>>;
  setMinimizedTerminalIds: Dispatch<SetStateAction<string[]>>;
  editingTerminalId: string | null;
  setEditingTerminalId: Dispatch<SetStateAction<string | null>>;
  setTerminalNameDraft: Dispatch<SetStateAction<string>>;
};

type UseTerminalBoardInteractionsResult = {
  handleMinimizeTerminal: (terminalId: string) => void;
  handleMaximizeTerminal: (terminalId: string) => void;
  handleTerminalDividerPointerDown: (
    leftTerminalId: string,
    rightTerminalId: string,
  ) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleTerminalDividerKeyDown: (
    leftTerminalId: string,
    rightTerminalId: string,
  ) => (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  handleTerminalHeaderWheel: (event: ReactWheelEvent<HTMLElement>) => void;
};

export const measureTerminalBoardViewportWidth = (board: HTMLElement): number | null => {
  const boardWidth = board.getBoundingClientRect().width;
  if (!Number.isFinite(boardWidth) || boardWidth <= 0) {
    return null;
  }

  const boardStyles = window.getComputedStyle(board);
  const paddingLeft = Number.parseFloat(boardStyles.paddingLeft);
  const paddingRight = Number.parseFloat(boardStyles.paddingRight);
  const horizontalPadding =
    (Number.isFinite(paddingLeft) ? paddingLeft : 0) +
    (Number.isFinite(paddingRight) ? paddingRight : 0);
  const viewportWidth = Math.floor(boardWidth - horizontalPadding);
  return viewportWidth > 0 ? viewportWidth : null;
};

export const useTerminalBoardInteractions = ({
  terminalsRef,
  visibleColumns,
  terminalWidths,
  setTerminalWidths,
  setMinimizedTerminalIds,
  editingTerminalId,
  setEditingTerminalId,
  setTerminalNameDraft,
}: UseTerminalBoardInteractionsOptions): UseTerminalBoardInteractionsResult => {
  const [terminalViewportWidth, setTerminalViewportWidth] = useState<number | null>(null);

  useEffect(() => {
    const board = terminalsRef.current;
    if (!board) {
      setTerminalViewportWidth(null);
      return;
    }

    const measure = () => {
      const currentBoard = terminalsRef.current;
      if (!currentBoard) {
        setTerminalViewportWidth(null);
        return;
      }

      setTerminalViewportWidth(measureTerminalBoardViewportWidth(currentBoard));
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(board);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
    // Re-run when visibleColumns changes to re-attach observer if the DOM element changed
    // (e.g. after navigating away from terminals view and back)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalsRef, visibleColumns]);

  useEffect(() => {
    const terminalIds = visibleColumns.map((entry) => entry.terminalId);

    // Always try a fresh DOM measurement to guard against stale terminalViewportWidth
    const board = terminalsRef.current;
    const freshViewportWidth = board
      ? (measureTerminalBoardViewportWidth(board) ?? terminalViewportWidth)
      : terminalViewportWidth;

    const dividerTotalWidth = Math.max(0, terminalIds.length - 1) * TERMINAL_DIVIDER_WIDTH;
    const paneViewportWidth =
      freshViewportWidth === null ? null : Math.max(0, freshViewportWidth - dividerTotalWidth);
    setTerminalWidths((currentWidths) =>
      reconcileTerminalWidths(currentWidths, terminalIds, paneViewportWidth),
    );
  }, [setTerminalWidths, terminalsRef, terminalViewportWidth, visibleColumns]);

  const handleMinimizeTerminal = useCallback(
    (terminalId: string) => {
      if (editingTerminalId === terminalId) {
        setEditingTerminalId(null);
        setTerminalNameDraft("");
      }

      setMinimizedTerminalIds((current) => {
        if (current.includes(terminalId)) {
          return current;
        }
        return [...current, terminalId];
      });
    },
    [editingTerminalId, setEditingTerminalId, setMinimizedTerminalIds, setTerminalNameDraft],
  );

  const handleMaximizeTerminal = useCallback(
    (terminalId: string) => {
      setMinimizedTerminalIds((current) =>
        current.filter((currentTerminalId) => currentTerminalId !== terminalId),
      );
    },
    [setMinimizedTerminalIds],
  );

  const handleTerminalDividerPointerDown = useCallback(
    (leftTerminalId: string, rightTerminalId: string) => {
      return (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startX = event.clientX;
        const startLeftWidth = terminalWidths[leftTerminalId] ?? TERMINAL_MIN_WIDTH;
        const startRightWidth = terminalWidths[rightTerminalId] ?? TERMINAL_MIN_WIDTH;

        const handlePointerMove = (moveEvent: PointerEvent) => {
          const delta = moveEvent.clientX - startX;
          const resizedPair = resizeTerminalPair(
            {
              [leftTerminalId]: startLeftWidth,
              [rightTerminalId]: startRightWidth,
            },
            leftTerminalId,
            rightTerminalId,
            delta,
          );

          setTerminalWidths((current) => {
            const nextLeft = resizedPair[leftTerminalId] ?? startLeftWidth;
            const nextRight = resizedPair[rightTerminalId] ?? startRightWidth;
            if (current[leftTerminalId] === nextLeft && current[rightTerminalId] === nextRight) {
              return current;
            }

            return {
              ...current,
              [leftTerminalId]: nextLeft,
              [rightTerminalId]: nextRight,
            };
          });
        };

        const stopResize = () => {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", stopResize);
          window.removeEventListener("pointercancel", stopResize);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", stopResize);
        window.addEventListener("pointercancel", stopResize);
      };
    },
    [setTerminalWidths, terminalWidths],
  );

  const handleTerminalDividerKeyDown = useCallback(
    (leftTerminalId: string, rightTerminalId: string) => {
      return (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }

        event.preventDefault();
        const delta = event.key === "ArrowRight" ? TERMINAL_RESIZE_STEP : -TERMINAL_RESIZE_STEP;
        setTerminalWidths((currentWidths) =>
          resizeTerminalPair(currentWidths, leftTerminalId, rightTerminalId, delta),
        );
      };
    },
    [setTerminalWidths],
  );

  const handleTerminalHeaderWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (!event.target.closest(".terminal-column-header")) {
        return;
      }

      const board = terminalsRef.current;
      if (!board) {
        return;
      }

      const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
      if (!Number.isFinite(horizontalDelta) || horizontalDelta === 0) {
        return;
      }

      board.scrollLeft += horizontalDelta;
      event.preventDefault();
    },
    [terminalsRef],
  );

  return {
    handleMinimizeTerminal,
    handleMaximizeTerminal,
    handleTerminalDividerPointerDown,
    handleTerminalDividerKeyDown,
    handleTerminalHeaderWheel,
  };
};
