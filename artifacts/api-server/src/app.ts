import express, { type Express } from "express";
import cors from "cors";
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
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
.row{margin:10px 0;padding:10px;background:#0c1220;border-radius:6px}
</style>
</head>
<body>
<h1>&#x1F50D; Diagnóstico de Carga</h1>
<div class="row">&#x2705; <b>HTML carga:</b> <span class="ok">SI</span></div>
<div class="row">&#x1F3A8; <b>CSS carga:</b> <span class="ok">SI (fondo azul oscuro visible)</span></div>
<div class="row" id="js-row">&#x23F3; <b>JavaScript:</b> probando...</div>
<div class="row" id="api-row">&#x23F3; <b>API:</b> probando...</div>
<div class="row" id="mod-row">&#x23F3; <b>ES Modules:</b> probando...</div>
<div class="row" id="info-row">&#x1F4BB; <b>Browser:</b> <span id="ua"></span></div>

<script>
document.getElementById('js-row').innerHTML = '&#x2705; <b>JavaScript (clásico):</b> <span class="ok">FUNCIONA</span>';
document.getElementById('ua').textContent = navigator.userAgent;

fetch('/api/crimes/types')
  .then(r => r.json())
  .then(d => { document.getElementById('api-row').innerHTML = '&#x2705; <b>API:</b> <span class="ok">FUNCIONA (' + (Array.isArray(d) ? d.length : '?') + ' tipos)</span>'; })
  .catch(e => { document.getElementById('api-row').innerHTML = '&#x274C; <b>API:</b> <span class="fail">FALLA: ' + e.message + '</span>'; });
</script>
<script type="module">
document.getElementById('mod-row').innerHTML = '&#x2705; <b>ES Modules:</b> <span class="ok">FUNCIONA</span>';
</script>
<script>
setTimeout(function(){
  var el = document.getElementById('mod-row');
  if(el.textContent.includes('probando')) {
    el.innerHTML = '&#x274C; <b>ES Modules:</b> <span class="fail">BLOQUEADO (esta es la causa del problema)</span>';
  }
}, 2000);
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

export default app;
