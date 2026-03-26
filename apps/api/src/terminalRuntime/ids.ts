import { TERMINAL_ID_PREFIX } from "./constants";

export const parseTerminalNumber = (terminalId: string): number | null => {
  if (!terminalId.startsWith(TERMINAL_ID_PREFIX)) {
    return null;
  }

  const numericPart = terminalId.slice(TERMINAL_ID_PREFIX.length);
  if (!/^\d+$/.test(numericPart)) {
    return null;
  }

  const parsed = Number.parseInt(numericPart, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
};
