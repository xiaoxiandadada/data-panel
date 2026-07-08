import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "./App";
import "../../styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("React root element is missing");
}

flushSync(() => {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

await import("./legacy-app");
