/**
 * Filters `terminalIds` to only those present in `activeTerminalIds`, returning the
 * original array reference unchanged when nothing was removed (stable identity for React deps).
 */
export const retainActiveTerminalIds = (
  terminalIds: string[],
  activeTerminalIds: ReadonlySet<string>,
) => {
  const nextTerminalIds = terminalIds.filter((terminalId) => activeTerminalIds.has(terminalId));
  return nextTerminalIds.length === terminalIds.length ? terminalIds : nextTerminalIds;
};

/**
 * Same as `retainActiveTerminalIds` but for a `Record<terminalId, T>` map — returns the
 * original object reference unchanged when no keys were dropped.
 */
export const retainActiveTerminalEntries = <TState>(
  state: Record<string, TState>,
  activeTerminalIds: ReadonlySet<string>,
) => {
  const retainedStateEntries = Object.entries(state).filter(([terminalId]) =>
    activeTerminalIds.has(terminalId),
  );
  if (retainedStateEntries.length === Object.keys(state).length) {
    return state;
  }

  return Object.fromEntries(retainedStateEntries);
};
