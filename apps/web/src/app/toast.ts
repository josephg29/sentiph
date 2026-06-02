// Lightweight app-wide toast bus. A tiny pub/sub singleton so any module (hooks,
// mutation handlers, error paths) can surface user feedback without prop-drilling a
// context through the tree. The single <ToastHost /> subscribes and renders.

export type ToastTone = "success" | "error" | "info";

export type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
  detail?: string;
  /** Auto-dismiss delay in ms. 0 keeps the toast until dismissed (used for errors). */
  durationMs: number;
};

type ToastInput = {
  tone: ToastTone;
  message: string;
  detail?: string;
  durationMs?: number;
};

type Listener = (toasts: readonly Toast[]) => void;

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
};

let toasts: Toast[] = [];
const listeners = new Set<Listener>();
let sequence = 0;

const emit = () => {
  const snapshot = toasts;
  for (const listener of listeners) {
    listener(snapshot);
  }
};

const push = (input: ToastInput): string => {
  sequence += 1;
  const id = `toast-${sequence}`;
  const toast: Toast = {
    id,
    tone: input.tone,
    message: input.message,
    durationMs: input.durationMs ?? DEFAULT_DURATIONS[input.tone],
    ...(input.detail ? { detail: input.detail } : {}),
  };
  toasts = [...toasts, toast];
  emit();
  return id;
};

export const toastBus = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(toasts);
    return () => {
      listeners.delete(listener);
    };
  },
  dismiss(id: string): void {
    const next = toasts.filter((toast) => toast.id !== id);
    if (next.length !== toasts.length) {
      toasts = next;
      emit();
    }
  },
  clear(): void {
    if (toasts.length > 0) {
      toasts = [];
      emit();
    }
  },
};

/** Ergonomic helpers for the common cases. */
export const notify = {
  success: (message: string, detail?: string) =>
    push({ tone: "success", message, ...(detail ? { detail } : {}) }),
  error: (message: string, detail?: string) =>
    push({ tone: "error", message, ...(detail ? { detail } : {}) }),
  info: (message: string, detail?: string) =>
    push({ tone: "info", message, ...(detail ? { detail } : {}) }),
};
