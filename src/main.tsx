import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import EnterpriseApp from "./App";
import StandaloneApp from "./StandaloneApp";
import "./index.css";
import { SessionProvider } from "./session";

const runtimeMode =
  ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_APP_RUNTIME || "standalone").trim();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {runtimeMode === "enterprise" ? (
      <BrowserRouter>
        <SessionProvider>
          <EnterpriseApp />
        </SessionProvider>
      </BrowserRouter>
    ) : (
      <StandaloneApp />
    )}
  </React.StrictMode>
);
