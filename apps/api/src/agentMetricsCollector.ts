import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  AgentMetricsEvent,
  AgentMetricsEventType,
  AgentRunOutcome,
  AgentRunSummary,
} from "@octogent/core";

import type { AgentRuntimeState } from "./agentStateDetection";
import type { PersistedTerminal, TerminalSessionEndReason } from "./terminalRuntime/types";

const ANSI_RE = /\x1b(?:\[[0-9;:<=>?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|.)/g;

const stripAnsi = (text: string): string =>
  text.replace(ANSI_RE, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const TOTAL_COST_RE = /total cost[:\s]+\$?([\d,]+\.?\d*)/i;
const INPUT_TOKENS_RE = /input tokens?[:\s]+([\d,]+)/i;
const OUTPUT_TOKENS_RE = /output tokens?[:\s]+([\d,]+)/i;
const TOOL_NAMES =
  "Bash|Read|Edit|Write|Grep|Glob|TodoRead|TodoWrite|MultiEdit|NotebookRead|NotebookEdit|WebFetch|WebSearch|Agent|Task";
const TOOL_PATTERN = `\\b(${TOOL_NAMES})\\s*\\(`;
const ERROR_RE = /\b(?:error|Error|ERROR|FAILED|exception)\s*:/;

const MAX_EVENTS_PER_TERMINAL = 10_000;

type TerminalAccumulator = {
  terminal: PersistedTerminal;
  startedAt: string;
  stateEnteredAt: number;
  currentState: AgentRuntimeState;
  idleMs: number;
  processingMs: number;
  tokenIn: number;
  tokenOut: number;
  tokenCostUsd: number;
  errorCount: number;
  toolsUsed: Set<string>;
  eventCount: number;
};

const parseTokenCount = (raw: string): number => Number(raw.replace(/,/g, ""));

export type AgentMetricsCollector = ReturnType<typeof createAgentMetricsCollector>;

export const createAgentMetricsCollector = (metricsDir: string) => {
  const accumulators = new Map<string, TerminalAccumulator>();
  let globalEventSeq = 0;

  const ensureDir = () => {
    mkdirSync(metricsDir, { recursive: true });
  };

  const eventsFilePath = (terminalId: string) =>
    join(metricsDir, `${encodeURIComponent(terminalId)}.jsonl`);

  const summariesFilePath = join(metricsDir, "summaries.jsonl");

  const appendEvent = (
    terminalId: string,
    tentacleId: string,
    eventType: AgentMetricsEventType,
    payload: Record<string, unknown>,
    acc: TerminalAccumulator,
  ): void => {
    if (acc.eventCount >= MAX_EVENTS_PER_TERMINAL) {
      return;
    }

    const event: AgentMetricsEvent = {
      eventId: `${terminalId}:${++globalEventSeq}`,
      terminalId,
      tentacleId,
      eventType,
      timestamp: new Date().toISOString(),
      payload,
    };

    acc.eventCount++;

    try {
      ensureDir();
      appendFileSync(eventsFilePath(terminalId), `${JSON.stringify(event)}\n`, "utf8");
    } catch {
      // Non-fatal: disk full or permission issue
    }
  };

  const onSessionStart = (terminal: PersistedTerminal): void => {
    const now = Date.now();
    accumulators.set(terminal.terminalId, {
      terminal,
      startedAt: terminal.startedAt ?? new Date().toISOString(),
      stateEnteredAt: now,
      currentState: "idle",
      idleMs: 0,
      processingMs: 0,
      tokenIn: 0,
      tokenOut: 0,
      tokenCostUsd: 0,
      errorCount: 0,
      toolsUsed: new Set(),
      eventCount: 0,
    });
  };

  const onStateChange = (terminalId: string, nextState: string): void => {
    const acc = accumulators.get(terminalId);
    if (!acc) {
      return;
    }

    const prevState = acc.currentState;
    if (prevState === nextState) {
      return;
    }

    const now = Date.now();
    const elapsed = now - acc.stateEnteredAt;

    if (prevState === "idle") {
      acc.idleMs += elapsed;
    } else if (prevState === "processing") {
      acc.processingMs += elapsed;
    }

    acc.currentState = nextState as AgentRuntimeState;
    acc.stateEnteredAt = now;

    appendEvent(
      terminalId,
      acc.terminal.tentacleId,
      "state_change",
      { from: prevState, to: nextState, elapsedMs: elapsed },
      acc,
    );
  };

  const onOutputChunk = (terminalId: string, chunk: string): void => {
    const acc = accumulators.get(terminalId);
    if (!acc) {
      return;
    }

    const text = stripAnsi(chunk);

    const costMatch = TOTAL_COST_RE.exec(text);
    if (costMatch) {
      const cost = parseTokenCount(costMatch[1] ?? "0");
      if (cost > 0) {
        acc.tokenCostUsd += cost;
        appendEvent(
          terminalId,
          acc.terminal.tentacleId,
          "token_usage",
          { costUsd: cost },
          acc,
        );
      }
    }

    const inputMatch = INPUT_TOKENS_RE.exec(text);
    if (inputMatch) {
      const count = parseTokenCount(inputMatch[1] ?? "0");
      if (count > 0) {
        acc.tokenIn += count;
      }
    }

    const outputMatch = OUTPUT_TOKENS_RE.exec(text);
    if (outputMatch) {
      const count = parseTokenCount(outputMatch[1] ?? "0");
      if (count > 0) {
        acc.tokenOut += count;
      }
    }

    for (const toolMatch of text.matchAll(new RegExp(TOOL_PATTERN, "g"))) {
      const toolName = toolMatch[1];
      if (toolName && !acc.toolsUsed.has(toolName)) {
        acc.toolsUsed.add(toolName);
        appendEvent(
          terminalId,
          acc.terminal.tentacleId,
          "tool_invocation",
          { tool: toolName },
          acc,
        );
      }
    }

    if (ERROR_RE.test(text)) {
      acc.errorCount++;
      appendEvent(
        terminalId,
        acc.terminal.tentacleId,
        "error_detected",
        { snippet: text.slice(0, 200).trim() },
        acc,
      );
    }
  };

  const inferOutcome = (
    exitCode: number | undefined,
    reason: TerminalSessionEndReason,
  ): AgentRunOutcome => {
    if (reason === "operator_kill") {
      return "killed";
    }
    if (reason === "operator_stop") {
      return "stopped";
    }
    if (exitCode === 0) {
      return "success";
    }
    if (exitCode !== undefined && exitCode !== 0) {
      return "error";
    }
    return "unknown";
  };

  const onSessionEnd = (
    terminalId: string,
    exitCode: number | undefined,
    exitSignal: number | string | undefined,
    reason: TerminalSessionEndReason,
  ): void => {
    const acc = accumulators.get(terminalId);
    if (!acc) {
      return;
    }

    const endedAt = new Date().toISOString();
    const now = Date.now();
    const elapsed = now - acc.stateEnteredAt;

    if (acc.currentState === "idle") {
      acc.idleMs += elapsed;
    } else if (acc.currentState === "processing") {
      acc.processingMs += elapsed;
    }

    const summary: AgentRunSummary = {
      terminalId,
      tentacleId: acc.terminal.tentacleId,
      tentacleName: acc.terminal.tentacleName,
      agentProvider: acc.terminal.agentProvider ?? "claude-code",
      startedAt: acc.startedAt,
      endedAt,
      durationMs: new Date(endedAt).getTime() - new Date(acc.startedAt).getTime(),
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(exitSignal !== undefined ? { exitSignal } : {}),
      outcome: inferOutcome(exitCode, reason),
      tokenIn: acc.tokenIn,
      tokenOut: acc.tokenOut,
      tokenCostUsd: acc.tokenCostUsd,
      idleMs: acc.idleMs,
      processingMs: acc.processingMs,
      errorCount: acc.errorCount,
      toolsUsed: [...acc.toolsUsed],
    };

    try {
      ensureDir();
      appendFileSync(summariesFilePath, `${JSON.stringify(summary)}\n`, "utf8");
    } catch {
      // Non-fatal
    }

    accumulators.delete(terminalId);
  };

  return { onSessionStart, onStateChange, onOutputChunk, onSessionEnd };
};
