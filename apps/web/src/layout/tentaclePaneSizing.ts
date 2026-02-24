export const TENTACLE_MIN_WIDTH = 320;
export const TENTACLE_RESIZE_STEP = 24;
export const TENTACLE_DIVIDER_WIDTH = 6;

export type TentacleWidthMap = Record<string, number>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sumWidths = (widths: TentacleWidthMap, tentacleIds: string[]): number =>
  tentacleIds.reduce((sum, tentacleId) => sum + (widths[tentacleId] ?? TENTACLE_MIN_WIDTH), 0);

const splitWidthsEvenly = (
  tentacleIds: string[],
  targetWidth: number,
  minWidth: number,
): TentacleWidthMap => {
  if (tentacleIds.length === 0) {
    return {};
  }

  const minimumTotal = minWidth * tentacleIds.length;
  if (targetWidth < minimumTotal) {
    return tentacleIds.reduce<TentacleWidthMap>((acc, tentacleId) => {
      acc[tentacleId] = minWidth;
      return acc;
    }, {});
  }

  const base = Math.floor(targetWidth / tentacleIds.length);
  let remainder = targetWidth - base * tentacleIds.length;

  return tentacleIds.reduce<TentacleWidthMap>((acc, tentacleId) => {
    const bonus = remainder > 0 ? 1 : 0;
    if (remainder > 0) {
      remainder -= 1;
    }
    acc[tentacleId] = Math.max(minWidth, base + bonus);
    return acc;
  }, {});
};

const normalizeToTargetWidth = (
  widths: TentacleWidthMap,
  tentacleIds: string[],
  targetWidth: number,
  minWidth: number,
): TentacleWidthMap => {
  const minimumTotal = minWidth * tentacleIds.length;
  if (targetWidth < minimumTotal) {
    return splitWidthsEvenly(tentacleIds, targetWidth, minWidth);
  }

  const next = { ...widths };
  const total = sumWidths(next, tentacleIds);
  if (total === targetWidth) {
    return next;
  }

  if (total < targetWidth) {
    let delta = targetWidth - total;
    let cursor = 0;
    while (delta > 0) {
      const tentacleId = tentacleIds[cursor % tentacleIds.length];
      if (!tentacleId) {
        break;
      }
      next[tentacleId] = (next[tentacleId] ?? minWidth) + 1;
      delta -= 1;
      cursor += 1;
    }
    return next;
  }

  let delta = total - targetWidth;
  while (delta > 0) {
    let changed = false;
    for (const tentacleId of tentacleIds) {
      const current = next[tentacleId] ?? minWidth;
      if (current <= minWidth) {
        continue;
      }

      next[tentacleId] = current - 1;
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
  left: TentacleWidthMap,
  right: TentacleWidthMap,
  tentacleIds: string[],
): boolean => {
  if (Object.keys(left).length !== Object.keys(right).length) {
    return false;
  }

  return tentacleIds.every((tentacleId) => left[tentacleId] === right[tentacleId]);
};

export const reconcileTentacleWidths = (
  currentWidths: TentacleWidthMap,
  tentacleIds: string[],
  viewportWidth: number | null,
  minWidth = TENTACLE_MIN_WIDTH,
): TentacleWidthMap => {
  if (tentacleIds.length === 0) {
    return {};
  }

  const currentIds = Object.keys(currentWidths);
  const idsChanged =
    currentIds.length !== tentacleIds.length ||
    tentacleIds.some((tentacleId) => currentWidths[tentacleId] === undefined);

  const hasMeasuredViewport =
    typeof viewportWidth === "number" && Number.isFinite(viewportWidth) && viewportWidth > 0;

  let next: TentacleWidthMap;
  if (idsChanged) {
    next = splitWidthsEvenly(
      tentacleIds,
      hasMeasuredViewport ? Math.floor(viewportWidth) : minWidth * tentacleIds.length,
      minWidth,
    );
  } else {
    next = tentacleIds.reduce<TentacleWidthMap>((acc, tentacleId) => {
      acc[tentacleId] = Math.max(minWidth, Math.floor(currentWidths[tentacleId] ?? minWidth));
      return acc;
    }, {});
  }

  if (hasMeasuredViewport) {
    next = normalizeToTargetWidth(next, tentacleIds, Math.floor(viewportWidth), minWidth);
  }

  if (areWidthsEqual(currentWidths, next, tentacleIds)) {
    return currentWidths;
  }

  return next;
};

export const resizeTentaclePair = (
  widths: TentacleWidthMap,
  leftTentacleId: string,
  rightTentacleId: string,
  delta: number,
  minWidth = TENTACLE_MIN_WIDTH,
) => {
  const leftWidth = widths[leftTentacleId] ?? minWidth;
  const rightWidth = widths[rightTentacleId] ?? minWidth;
  const combinedWidth = leftWidth + rightWidth;
  const nextLeftWidth = clamp(leftWidth + delta, minWidth, combinedWidth - minWidth);
  const nextRightWidth = combinedWidth - nextLeftWidth;

  if (nextLeftWidth === leftWidth && nextRightWidth === rightWidth) {
    return widths;
  }

  return {
    ...widths,
    [leftTentacleId]: nextLeftWidth,
    [rightTentacleId]: nextRightWidth,
  };
};
