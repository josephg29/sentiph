import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installFetchBridge } from "./bridge/fetchBridge";
import { VsCodeApp } from "./VsCodeApp";
import "./styles.css";

// Install the fetch bridge before any components mount.
// This intercepts all /api/* fetch calls and routes them through postMessage
// to the VS Code extension host, so hooks/components work without changes.
installFetchBridge();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root container '#root' was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <VsCodeApp />
  </StrictMode>,
);
