import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

window.addEventListener("error", (event) => {
  const fallback = document.getElementById("boot-fallback");
  if (fallback && !document.querySelector("[data-passready-mounted]")) {
    fallback.innerHTML = `<p style="color:#fca5a5;font-size:0.875rem">Load error: ${event.message}</p>`;
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <div data-passready-mounted="">
        <App />
      </div>
    </ErrorBoundary>
  </StrictMode>,
);
