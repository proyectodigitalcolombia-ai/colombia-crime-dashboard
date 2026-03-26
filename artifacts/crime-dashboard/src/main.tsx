import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Remove the non-module diagnostic overlay (ES modules work)
const diag = document.getElementById("js-test");
if (diag) diag.remove();

const root = document.getElementById("root")!;

try {
  if (import.meta.env.VITE_API_URL) {
    setBaseUrl(import.meta.env.VITE_API_URL);
  }
  createRoot(root).render(<App />);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message + "\n\n" + err.stack : String(err);
  root.innerHTML = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#070c15;color:#ef4444;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;padding:40px;box-sizing:border-box;text-align:center"><div style="font-size:20px;margin-bottom:20px">Error al iniciar módulos ES</div><pre style="font-size:11px;color:#f59e0b;white-space:pre-wrap;max-width:800px">${msg}</pre></div>`;
}
