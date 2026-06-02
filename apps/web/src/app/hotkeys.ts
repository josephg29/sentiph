import { PRIMARY_NAV_ITEMS, type PrimaryNavIndex } from "./constants";
const MAX_TICKER_QUERY_LENGTH = 16;
const TICKER_QUERY_ALLOWED_PATTERN = /[^A-Z0-9._/-]/g;

export const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable === true || target.contentEditable === "true";
};

export const parsePrimaryNavKey = (key: string): PrimaryNavIndex | null => {
  const pressed = Number.parseInt(key, 10);
  if (Number.isNaN(pressed)) {
    return null;
  }

  // Map the visible 1-based shortcut the user typed back to the stable nav index.
  const match = PRIMARY_NAV_ITEMS.find((item) => item.shortcut === pressed);
  return match ? match.index : null;
};

/**
 * Uppercases input and strips any characters outside `[A-Z0-9._/-]`, then truncates
 * to 16 characters — enforces the allowed format for stock/crypto ticker query strings.
 */
export const normalizeTickerQueryInput = (value: string): string =>
  value.toUpperCase().replace(TICKER_QUERY_ALLOWED_PATTERN, "").slice(0, MAX_TICKER_QUERY_LENGTH);
