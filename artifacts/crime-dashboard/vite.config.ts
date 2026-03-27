import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const isReplit = process.env.REPL_ID !== undefined;
const isProduction = process.env.NODE_ENV === "production";

const rawPort = process.env.PORT;
let port = 3000;
if (rawPort) {
  port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
} else if (isReplit && !isProduction) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const basePath = process.env.BASE_PATH ?? (isReplit ? null : "/");
if (!basePath) {
  throw new Error("BASE_PATH environment variable is required but was not provided.");
}

function removeCrossOriginPlugin() {
  return {
    name: "remove-crossorigin",
    transformIndexHtml(html: string) {
      return html
        .replace(/(<script[^>]*)\scrossorigin/g, "$1")
        .replace(/(<link[^>]*(?:modulepreload|stylesheet)[^>]*)\scrossorigin/g, "$1");
    },
  };
}

function blobLoaderPlugin() {
  return {
    name: "blob-loader",
    transformIndexHtml(html: string) {
      const scriptMatch = html.match(/<script type="module" src="([^"]+)"><\/script>/);
      const cssMatch = html.match(/<link rel="stylesheet" href="([^"]+)">/);
      if (!scriptMatch || !cssMatch) return html;
      const jsUrl = scriptMatch[1];
      const cssUrl = cssMatch[1];
      let result = html
        .replace(/<script type="module" src="[^"]+"><\/script>/g, "")
        .replace(/<link rel="modulepreload"[^>]+>/g, "")
        .replace(/<link rel="stylesheet" href="[^"]+">/g, "");
      const loader = `
<script>
(async function() {
  try {
    var r1 = fetch('${jsUrl}'), r2 = fetch('${cssUrl}');
    var jsRes = await r1, cssRes = await r2;
    if (!jsRes.ok) throw new Error('JS ' + jsRes.status);
    if (!cssRes.ok) throw new Error('CSS ' + cssRes.status);
    var css = await cssRes.text();
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    var code = await jsRes.text();
    var blob = new Blob([code], {type: 'application/javascript'});
    var url = URL.createObjectURL(blob);
    await import(url);
    URL.revokeObjectURL(url);
  } catch(e) {
    var el = document.getElementById('app-loader');
    if (el) el.innerHTML = '<p style="color:#ef4444;padding:20px">Error al cargar: ' + e.message + '. Recargue la pagina.</p>';
  }
})();
</script>`;
      return result.replace("</body>", loader + "\n</body>");
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    removeCrossOriginPlugin(),
    ...(isProduction ? [blobLoaderPlugin()] : []),
    ...(isReplit && !isProduction
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(__dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "assets/app.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
