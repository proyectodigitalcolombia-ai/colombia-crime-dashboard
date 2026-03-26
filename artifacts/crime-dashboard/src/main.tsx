import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Diagnostic: show progress before React mounts
const root = document.getElementById("root")!;
root.innerHTML = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#070c15;color:#00d4ff;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:18px;z-index:9999">Iniciando aplicación...</div>';

try {
  if (import.meta.env.VITE_API_URL) {
    setBaseUrl(import.meta.env.VITE_API_URL);
  }

  createRoot(root).render(<App />);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message + "\n\n" + err.stack : String(err);
  root.innerHTML = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#070c15;color:#ef4444;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;padding:40px;box-sizing:border-box;text-align:center"><div style="font-size:20px;margin-bottom:20px">Error al iniciar</div><pre style="font-size:11px;color:#f59e0b;white-space:pre-wrap;max-width:800px">${msg}</pre></div>`;
}
