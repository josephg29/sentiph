/**
 * Shallow structural-equality helpers shared by persisted-UI-state logic.
 *
 * Kept dependency-free on purpose — the repo ships no deep-equal library, and
 * these comparators only ever walk known, flat shapes. Each early-returns on
 * reference identity before doing any work, which a generic deep-equal would
 * lose.
 */

export const areStringArraysEqual = (
  left: string[] | undefined,
  right: string[] | undefined,
): boolean => {
  if (left === right) {
    return true;
  }

  const nextLeft = left ?? [];
  const nextRight = right ?? [];
  if (nextLeft.length !== nextRight.length) {
    return false;
  }

  return nextLeft.every((value, index) => value === nextRight[index]);
};

export const areNumberRecordMapsEqual = (
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
): boolean => {
  if (left === right) {
    return true;
  }

  const leftEntries = Object.entries(left ?? {});
  const rightEntries = right ?? {};
  if (leftEntries.length !== Object.keys(rightEntries).length) {
    return false;
  }

  return leftEntries.every(([key, value]) => rightEntries[key] === value);
};
