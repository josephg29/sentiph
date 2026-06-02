import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

/**
 * Top-level error boundary. Without it, any uncaught render error blanks the
 * whole console to a white screen with no recovery path. This catches the crash,
 * shows an explicit recovery screen (matching the 404 treatment), and lets the
 * user reload without losing the URL.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the full context to the console for diagnosis; the UI stays generic.
    console.error("[sentiph] Unhandled render error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="app-crash" role="alert">
        <div className="app-crash-card">
          <div className="app-crash-code">!</div>
          <h1 className="app-crash-title">Something broke</h1>
          <p className="app-crash-body">
            The console hit an unexpected error and stopped rendering. Your agents and terminals are
            still running on the server — reloading reconnects to them.
          </p>
          {import.meta.env.DEV ? <pre className="app-crash-detail">{error.message}</pre> : null}
          <button type="button" className="app-crash-action" onClick={this.handleReload}>
            Reload console
          </button>
        </div>
      </div>
    );
  }
}
