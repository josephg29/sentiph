type RouteNotFoundProps = {
  path: string;
  onReturnHome: () => void;
};

/**
 * Sentiph runs as a single-surface console with no client-side router, so any
 * non-root URL is a dead deep link. Rather than silently rendering the app on a
 * bogus path, show an explicit recovery screen that returns the user to the console.
 */
export const RouteNotFound = ({ path, onReturnHome }: RouteNotFoundProps) => (
  <div className="route-not-found" role="alert">
    <div className="route-not-found-card">
      <div className="route-not-found-code">404</div>
      <h1 className="route-not-found-title">No route here</h1>
      <p className="route-not-found-body">
        <code className="route-not-found-path">{path}</code> isn't a Sentiph view. The console lives
        at the root — use the numbered tabs once you're back.
      </p>
      <button type="button" className="route-not-found-action" onClick={onReturnHome}>
        Back to Sentiph
      </button>
    </div>
  </div>
);
