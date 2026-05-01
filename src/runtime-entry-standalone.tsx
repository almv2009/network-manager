import React from "react";
import type { Root } from "react-dom/client";

import StandaloneApp from "./StandaloneApp";

export function bootstrapRuntime(root: Root) {
  root.render(
    <React.StrictMode>
      <StandaloneApp />
    </React.StrictMode>,
  );
}
