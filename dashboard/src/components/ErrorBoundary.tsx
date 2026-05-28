import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("PassReady dashboard error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "1.5rem",
            background: "#0a1628",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ color: "#34d399", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.12em" }}>
            PASSREADY
          </p>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.5rem" }}>
            Dashboard hit an error
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#94a3b8" }}>
            {this.state.error.message || "Something went wrong loading the app."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.25rem",
              width: "100%",
              minHeight: "48px",
              borderRadius: "12px",
              border: "none",
              background: "#059669",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.875rem",
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
