import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crimesRouter from "./crimes";
import blockadeRouter from "./blockades";
import roadConditionsRouter from "./road-conditions";
import authRouter from "./auth";
import armedGroupsRouter from "./armed-groups";
import routeRouter from "./route";
import newsMonitorRouter from "./news-monitor";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(crimesRouter);
router.use(blockadeRouter);
router.use(roadConditionsRouter);
router.use(armedGroupsRouter);
router.use(routeRouter);
router.use(newsMonitorRouter);

export default router;
