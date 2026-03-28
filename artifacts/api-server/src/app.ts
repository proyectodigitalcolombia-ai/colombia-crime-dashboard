import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use("/api", router);

app.get("/diag", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Diagnóstico SafeNode</title>
<style>
body{background:#070c15;color:#fff;font-family:sans-serif;padding:30px;font-size:16px}
h1{color:#00d4ff}
.ok{color:#22c55e;font-weight:bold}
.fail{color:#ef4444;font-weight:bold}
.warn{color:#f59e0b;font-weight:bold}
.row{margin:8px 0;padding:10px 14px;background:#0c1220;border-radius:6px}
pre{background:#000;padding:8px;border-radius:4px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
</style>
</head>
<body>
<h1>&#x1F50D; Diagnóstico de Carga</h1>
<div class="row">&#x2705; <b>HTML:</b> <span class="ok">OK</span></div>
<div class="row">&#x1F3A8; <b>CSS inline:</b> <span class="ok">OK (fondo azul oscuro)</span></div>
<div class="row" id="js-row">&#x23F3; <b>JS clásico:</b> probando...</div>
<div class="row" id="api-row">&#x23F3; <b>API:</b> probando...</div>
<div class="row" id="mod-row">&#x23F3; <b>ES Modules inline:</b> probando...</div>
<div class="row" id="css-file-row">&#x23F3; <b>CSS archivo externo:</b> probando...</div>
<div class="row" id="js-file-row">&#x23F3; <b>JS archivo externo (React):</b> probando...</div>
<div class="row" id="gf-row">&#x23F3; <b>Google Fonts:</b> probando...</div>
<div class="row" id="err-row" style="display:none">&#x274C; <b>Errores JS:</b><pre id="err-text"></pre></div>
<div class="row">&#x1F4BB; <b>Browser:</b> <span id="ua" style="font-size:12px"></span></div>

<script>
document.getElementById('js-row').innerHTML = '&#x2705; <b>JS clásico:</b> <span class="ok">OK</span>';
document.getElementById('ua').textContent = navigator.userAgent;

window.onerror = function(msg, src, line, col, err) {
  var box = document.getElementById('err-row');
  box.style.display = 'block';
  document.getElementById('err-text').textContent += (src||'') + ':' + line + ' ' + msg + '\\n';
};
window.onunhandledrejection = function(e) {
  var box = document.getElementById('err-row');
  box.style.display = 'block';
  document.getElementById('err-text').textContent += 'Promise rejected: ' + (e.reason?.message || e.reason) + '\\n';
};

fetch('/api/crimes/types')
  .then(r => r.json())
  .then(d => { document.getElementById('api-row').innerHTML = '&#x2705; <b>API:</b> <span class="ok">OK (' + (Array.isArray(d) ? d.length : '?') + ' tipos)</span>'; })
  .catch(e => { document.getElementById('api-row').innerHTML = '&#x274C; <b>API:</b> <span class="fail">FALLA: ' + e.message + '</span>'; });

// Test CSS external file
var cssLink = document.createElement('link');
cssLink.rel = 'stylesheet'; cssLink.href = '/assets/index-Dw5n0C4o.css';
cssLink.onload = function() { document.getElementById('css-file-row').innerHTML = '&#x2705; <b>CSS archivo externo:</b> <span class="ok">OK (96KB cargado)</span>'; };
cssLink.onerror = function() { document.getElementById('css-file-row').innerHTML = '&#x274C; <b>CSS archivo externo:</b> <span class="fail">FALLA al cargar</span>'; };
document.head.appendChild(cssLink);

// Test Google Fonts
var gfLink = document.createElement('link');
gfLink.rel = 'stylesheet'; gfLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';
gfLink.onload = function() { document.getElementById('gf-row').innerHTML = '&#x2705; <b>Google Fonts:</b> <span class="ok">OK</span>'; };
gfLink.onerror = function() { document.getElementById('gf-row').innerHTML = '&#x26A0;&#xFE0F; <b>Google Fonts:</b> <span class="warn">NO CARGA (esto bloquea el render)</span>'; };
document.head.appendChild(gfLink);

// Test JS external file
var s = document.createElement('script');
s.src = '/assets/vendor-ui-DJ5w2OR1.js'; s.type = 'module';
s.onload = function() { document.getElementById('js-file-row').innerHTML = '&#x2705; <b>JS archivo externo:</b> <span class="ok">OK (vendor chunk cargó)</span>'; };
s.onerror = function(e) { document.getElementById('js-file-row').innerHTML = '&#x274C; <b>JS archivo externo:</b> <span class="fail">FALLA al cargar</span>'; };
document.head.appendChild(s);

setTimeout(function(){
  ['css-file-row','js-file-row','gf-row'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && el.textContent.includes('probando')) el.innerHTML = el.innerHTML.replace('probando...', '<span class="warn">SIN RESPUESTA (timeout)</span>');
  });
}, 5000);
</script>
<script type="module">
document.getElementById('mod-row').innerHTML = '&#x2705; <b>ES Modules inline:</b> <span class="ok">OK</span>';
</script>
</body>
</html>`);
});

const dashboardDist = path.join(__dirname, "../../crime-dashboard/dist/public");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist, { index: false }));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ name: "Colombia Crime Statistics API", status: "operational" });
  });
}

/* ── Global error handler — converts body-parser HTML errors to JSON ────────
   express.json() default limit is 100 KB; large PDFs exceed it and Express
   responds with raw HTML which breaks JSON.parse() in the frontend.
   This middleware catches those errors and returns a clean JSON response.
   ──────────────────────────────────────────────────────────────────────── */
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "El archivo es demasiado grande (máx 25 MB). Redúzcalo antes de enviarlo." });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido en la petición." });
  }
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: err.message ?? "Error interno del servidor" });
});

export default app;
