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
