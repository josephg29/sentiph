import { appendFileSync, createWriteStream, mkdirSync } from "node:fs";
import type { WriteStream } from "node:fs";
import { join } from "node:path";

import type { TerminalSession, TerminalSessionEndReason } from "./types";

export const createDebugLog = (
  sessionId: string,
  isDebugPtyLogsEnabled: boolean,
  ptyLogDir: string,
): WriteStream | undefined => {
  if (!isDebugPtyLogsEnabled) {
    return undefined;
  }

  mkdirSync(ptyLogDir, { recursive: true });
  const filename = `${sessionId}-${Date.now()}.log`;
  return createWriteStream(join(ptyLogDir, filename), {
    flags: "a",
    encoding: "utf8",
  });
};

export const openTranscriptLog = (
  sessionId: string,
  transcriptDirectoryPath: string | undefined,
): string | undefined => {
  if (!transcriptDirectoryPath) return undefined;
  try {
    mkdirSync(transcriptDirectoryPath, { recursive: true });
    const filename = `${encodeURIComponent(sessionId)}.jsonl`;
    return join(transcriptDirectoryPath, filename);
  } catch {
    return undefined;
  }
};

export const appendTranscriptEvent = (session: TerminalSession, event: Record<string, unknown>) => {
  if (!session.transcriptLog) return;
  session.transcriptEventCount = (session.transcriptEventCount ?? 0) + 1;
  try {
    appendFileSync(session.transcriptLog, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Non-fatal: temp dir may have been cleaned up or disk full
  }
};

export const appendDebugLog = (session: TerminalSession, line: string) => {
  session.debugLog?.write(`${new Date().toISOString()} ${line}\n`);
};

export type SessionEndEvent = {
  type: "session_end";
  reason: string;
  timestamp: string;
  exitCode?: number;
  signal?: number | string;
};

export const resolveSessionEndReason = (reason: string): TerminalSessionEndReason =>
  reason === "pty_exit" || reason === "operator_stop" || reason === "operator_kill"
    ? reason
    : "session_close";

export const resolveEndedAt = (timestamp: string): string =>
  typeof timestamp === "string" ? timestamp : new Date().toISOString();

export const exitSignalFields = (
  event: SessionEndEvent,
): { exitCode?: number; signal?: number | string } => ({
  ...(typeof event.exitCode === "number" ? { exitCode: event.exitCode } : {}),
  ...(typeof event.signal === "number" || typeof event.signal === "string"
    ? { signal: event.signal }
    : {}),
});
