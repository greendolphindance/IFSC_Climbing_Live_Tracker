import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("IFSC tracker render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell theme-dark">
        <section className="panel error-panel">
          <div className="section-title">Unable to Render Competition</div>
          <p>{this.state.error.message}</p>
          <div className="error-actions">
            <button type="button" onClick={() => {
              window.localStorage.removeItem("ifsc-round-url");
              window.location.reload();
            }}>
              Back to default round
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </section>
      </div>
    );
  }
}
