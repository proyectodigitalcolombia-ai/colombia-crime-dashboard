import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    name: "Colombia Crime Statistics API",
    version: "1.0.0",
    description: "API de estadísticas de delitos en Colombia - Policía Nacional",
    endpoints: {
      health: "/api/healthz",
      crimeTypes: "/api/crimes/types",
      years: "/api/crimes/years",
      nationalMonthly: "/api/crimes/national-monthly",
      byDepartment: "/api/crimes/by-department",
      refreshStatus: "/api/crimes/refresh-status",
      refresh: "POST /api/crimes/refresh",
    },
    dashboard: "https://colombia-crime-dashboard.onrender.com",
    status: "operational",
  });
});

app.use("/api", router);

export default app;
