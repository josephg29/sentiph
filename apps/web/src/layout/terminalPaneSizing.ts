export const TERMINAL_MIN_WIDTH = 370;
export const TERMINAL_RESIZE_STEP = 24;
export const TERMINAL_DIVIDER_WIDTH = 6;

export type TerminalWidthMap = Record<string, number>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sumWidths = (widths: TerminalWidthMap, terminalIds: string[]): number =>
  terminalIds.reduce((sum, terminalId) => sum + (widths[terminalId] ?? TERMINAL_MIN_WIDTH), 0);

const splitWidthsEvenly = (
  terminalIds: string[],
  targetWidth: number,
  minWidth: number,
): TerminalWidthMap => {
  if (terminalIds.length === 0) {
    return {};
  }

  const minimumTotal = minWidth * terminalIds.length;
  if (targetWidth < minimumTotal) {
    return terminalIds.reduce<TerminalWidthMap>((acc, terminalId) => {
      acc[terminalId] = minWidth;
      return acc;
    }, {});
  }

  const base = Math.floor(targetWidth / terminalIds.length);
  let remainder = targetWidth - base * terminalIds.length;

  return terminalIds.reduce<TerminalWidthMap>((acc, terminalId) => {
    const bonus = remainder > 0 ? 1 : 0;
    if (remainder > 0) {
      remainder -= 1;
    }
    acc[terminalId] = Math.max(minWidth, base + bonus);
    return acc;
  }, {});
};

const normalizeToTargetWidth = (
  widths: TerminalWidthMap,
  terminalIds: string[],
  targetWidth: number,
  minWidth: number,
): TerminalWidthMap => {
  const minimumTotal = minWidth * terminalIds.length;
  if (targetWidth < minimumTotal) {
    return splitWidthsEvenly(terminalIds, targetWidth, minWidth);
  }

  const next = { ...widths };
  const total = sumWidths(next, terminalIds);
  if (total === targetWidth) {
    return next;
  }

  if (total < targetWidth) {
    let delta = targetWidth - total;
    let cursor = 0;
    while (delta > 0) {
      const terminalId = terminalIds[cursor % terminalIds.length];
      if (!terminalId) {
        break;
      }
      next[terminalId] = (next[terminalId] ?? minWidth) + 1;
      delta -= 1;
      cursor += 1;
    }
    return next;
  }

  let delta = total - targetWidth;
  while (delta > 0) {
    let changed = false;
    for (const terminalId of terminalIds) {
      const current = next[terminalId] ?? minWidth;
      if (current <= minWidth) {
        continue;
      }

      next[terminalId] = current - 1;
      delta -= 1;
      changed = true;
      if (delta === 0) {
        break;
      }
    }

    if (!changed) {
      break;
    }
  }

  return next;
};

const areWidthsEqual = (
  left: TerminalWidthMap,
  right: TerminalWidthMap,
  terminalIds: string[],
): boolean => {
  if (Object.keys(left).length !== Object.keys(right).length) {
    return false;
  }

  return terminalIds.every((terminalId) => left[terminalId] === right[terminalId]);
};

export const reconcileTerminalWidths = (
  currentWidths: TerminalWidthMap,
  terminalIds: string[],
  viewportWidth: number | null,
  minWidth = TERMINAL_MIN_WIDTH,
): TerminalWidthMap => {
  if (terminalIds.length === 0) {
    return {};
  }

  const currentIds = Object.keys(currentWidths);
  const idsChanged =
    currentIds.length !== terminalIds.length ||
    terminalIds.some((terminalId) => currentWidths[terminalId] === undefined);

  const hasMeasuredViewport =
    typeof viewportWidth === "number" && Number.isFinite(viewportWidth) && viewportWidth > 0;

  let next: TerminalWidthMap;
  if (idsChanged) {
    next = splitWidthsEvenly(
      terminalIds,
      hasMeasuredViewport ? Math.floor(viewportWidth) : minWidth * terminalIds.length,
      minWidth,
    );
  } else {
    next = terminalIds.reduce<TerminalWidthMap>((acc, terminalId) => {
      acc[terminalId] = Math.max(minWidth, Math.floor(currentWidths[terminalId] ?? minWidth));
      return acc;
    }, {});
  }

  if (hasMeasuredViewport) {
    next = normalizeToTargetWidth(next, terminalIds, Math.floor(viewportWidth), minWidth);
  }

  if (areWidthsEqual(currentWidths, next, terminalIds)) {
    return currentWidths;
  }

  return next;
};

export const resizeTerminalPair = (
  widths: TerminalWidthMap,
  leftTerminalId: string,
  rightTerminalId: string,
  delta: number,
  minWidth = TERMINAL_MIN_WIDTH,
) => {
  const leftWidth = widths[leftTerminalId] ?? minWidth;
  const rightWidth = widths[rightTerminalId] ?? minWidth;
  const combinedWidth = leftWidth + rightWidth;
  const nextLeftWidth = clamp(leftWidth + delta, minWidth, combinedWidth - minWidth);
  const nextRightWidth = combinedWidth - nextLeftWidth;

  if (nextLeftWidth === leftWidth && nextRightWidth === rightWidth) {
    return widths;
  }

  return {
    ...widths,
    [leftTerminalId]: nextLeftWidth,
    [rightTerminalId]: nextRightWidth,
  };
};
