const express = require("express");
const path = require("path");

const app = express();
const DIST = path.join(__dirname, "dist", "public");

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

app.use(
  express.static(DIST, {
    maxAge: req => {
      if (req && req.url && req.url.includes("/assets/")) return "1y";
      return 0;
    },
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      } else if (filePath.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
      }
    },
  }),
);

app.get("*", (req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

const port = Number(process.env.PORT) || 4173;
app.listen(port, "0.0.0.0", () => {
  console.log(`Dashboard serving on port ${port}`);
});
