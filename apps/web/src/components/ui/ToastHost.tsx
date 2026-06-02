import { useEffect, useRef, useState } from "react";

import { type Toast, toastBus } from "../../app/toast";

/**
 * Single subscriber for the app-wide toast bus. Renders a polite live region so
 * screen readers announce feedback, and auto-dismisses each toast after its
 * duration (errors linger longer / until dismissed). One host per app.
 */
export const ToastHost = () => {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => toastBus.subscribe(setToasts), []);

  useEffect(() => {
    const active = timers.current;
    for (const toast of toasts) {
      if (toast.durationMs > 0 && !active.has(toast.id)) {
        const handle = setTimeout(() => {
          active.delete(toast.id);
          toastBus.dismiss(toast.id);
        }, toast.durationMs);
        active.set(toast.id, handle);
      }
    }
    // Drop timers for toasts that no longer exist (manually dismissed).
    const liveIds = new Set(toasts.map((toast) => toast.id));
    for (const [id, handle] of active) {
      if (!liveIds.has(id)) {
        clearTimeout(handle);
        active.delete(id);
      }
    }
  }, [toasts]);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const handle of active.values()) {
        clearTimeout(handle);
      }
      active.clear();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <section className="toast-host" aria-label="Notifications">
      <ol className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <li
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <div className="toast-body">
              <span className="toast-message">{toast.message}</span>
              {toast.detail ? <span className="toast-detail">{toast.detail}</span> : null}
            </div>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => toastBus.dismiss(toast.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
