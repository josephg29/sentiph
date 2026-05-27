import { useCallback, useEffect, useState } from "react";

import { ActionButton } from "./ui/ActionButton";

type UpdateStatusResponse = {
  source: "npm" | "git" | "unknown";
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  details: string | null;
  error: string | null;
};

type Phase = "idle" | "checking" | "updating" | "updated" | "restarting" | "error";

export const UpdatesSettingsSection = () => {
  const [status, setStatus] = useState<UpdateStatusResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setPhase("checking");
    setMessage(null);
    try {
      const res = await fetch("/api/updates/status");
      if (!res.ok) {
        setPhase("error");
        setMessage(`Check failed: ${res.status}`);
        return;
      }
      const data = (await res.json()) as UpdateStatusResponse;
      setStatus(data);
      setPhase("idle");
      if (data.error) {
        setMessage(data.error);
      }
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Failed to reach the API.");
    }
  }, []);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  const applyUpdate = useCallback(async () => {
    setPhase("updating");
    setMessage("Installing update — this may take a few minutes.");
    try {
      const res = await fetch("/api/updates/apply", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error: string | null };
      if (data.ok) {
        setPhase("updated");
        setMessage("Update installed.");
        setShowRestartPrompt(true);
      } else {
        setPhase("error");
        setMessage(data.error ?? "Update failed.");
      }
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Update request failed.");
    }
  }, []);

  const restartNow = useCallback(async () => {
    setPhase("restarting");
    setMessage("Restarting Sentiph…");
    try {
      await fetch("/api/updates/restart", { method: "POST" });
    } catch {
      // The restart endpoint kills the API mid-flight; a fetch error is expected.
    }
    setShowRestartPrompt(false);
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }, []);

  const currentVersionLabel = status?.currentVersion ?? "—";
  const sourceLabel =
    status?.source === "npm"
      ? "npm install"
      : status?.source === "git"
        ? "git checkout"
        : "unknown source";

  return (
    <section className="settings-panel" aria-label="Updates">
      <header className="settings-panel-header">
        <h2>Updates</h2>
        <p>
          Check for a newer Sentiph release and install it without leaving the app. Detected
          installation: {sourceLabel}.
        </p>
      </header>

      <div className="settings-updates-row">
        <div className="settings-updates-version">
          <span className="settings-updates-label">Current</span>
          <span className="settings-updates-value">{currentVersionLabel}</span>
        </div>
        <div className="settings-updates-version">
          <span className="settings-updates-label">Latest</span>
          <span className="settings-updates-value">
            {status?.latestVersion ?? (phase === "checking" ? "Checking…" : "—")}
          </span>
        </div>
      </div>

      {status?.details ? <p className="settings-updates-details">{status.details}</p> : null}
      {message ? <p className="settings-updates-message">{message}</p> : null}

      <div className="settings-panel-actions">
        <ActionButton
          aria-label="Check for updates"
          onClick={() => {
            void checkForUpdates();
          }}
          size="dense"
          variant="info"
          disabled={phase === "checking" || phase === "updating" || phase === "restarting"}
        >
          {phase === "checking" ? "Checking…" : "Check for updates"}
        </ActionButton>
        {status?.updateAvailable && phase !== "updated" ? (
          <ActionButton
            aria-label="Install update"
            onClick={() => {
              void applyUpdate();
            }}
            size="dense"
            variant="accent"
            disabled={phase === "updating" || phase === "restarting"}
          >
            {phase === "updating" ? "Installing…" : `Update to ${status.latestVersion ?? "latest"}`}
          </ActionButton>
        ) : null}
      </div>

      {showRestartPrompt ? (
        <div className="settings-updates-restart" role="alertdialog" aria-label="Restart Sentiph">
          <p>Update installed. Restart Sentiph now to load the new version?</p>
          <div className="settings-panel-actions">
            <ActionButton
              aria-label="Restart now"
              onClick={() => {
                void restartNow();
              }}
              size="dense"
              variant="accent"
              disabled={phase === "restarting"}
            >
              {phase === "restarting" ? "Restarting…" : "Restart now"}
            </ActionButton>
            <ActionButton
              aria-label="Restart later"
              onClick={() => setShowRestartPrompt(false)}
              size="dense"
              variant="info"
              disabled={phase === "restarting"}
            >
              Later
            </ActionButton>
          </div>
        </div>
      ) : null}
    </section>
  );
};
