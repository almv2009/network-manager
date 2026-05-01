import React from "react";
import type { Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import EnterpriseApp from "./EnterpriseApp";
import { SessionProvider } from "./session";

type RuntimeErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class RuntimeErrorBoundary extends React.Component<{ children: React.ReactNode }, RuntimeErrorBoundaryState> {
  state: RuntimeErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): RuntimeErrorBoundaryState {
    const message = error instanceof Error ? error.message : "Unexpected runtime error.";
    return {
      hasError: true,
      message,
    };
  }

  componentDidCatch(error: unknown) {
    console.error("runtime_error_boundary", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="nm-app min-h-screen">
          <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center p-6">
            <section className="app-card w-full rounded-3xl border p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SgT Network Manager</p>
              <h1 className="mt-3 text-2xl font-semibold text-slate-900">The app hit a runtime error.</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Refresh this page. If the issue repeats, sign out and back in.
              </p>
              <p className="mt-3 text-xs text-slate-500">Error: {this.state.message}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium"
                  onClick={() => window.location.reload()}
                >
                  Refresh page
                </button>
                <a href="/auth/sign-out" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
                  Sign out
                </a>
              </div>
            </section>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function bootstrapRuntime(root: Root) {
  root.render(
    <React.StrictMode>
      <RuntimeErrorBoundary>
        <BrowserRouter>
          <SessionProvider>
            <EnterpriseApp />
          </SessionProvider>
        </BrowserRouter>
      </RuntimeErrorBoundary>
    </React.StrictMode>,
  );
}
