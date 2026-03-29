import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crimesRouter from "./crimes";
import blockadeRouter from "./blockades";
import roadConditionsRouter from "./road-conditions";
import inviasClosuresRouter from "./invias-closures";
import authRouter from "./auth";
import armedGroupsRouter from "./armed-groups";
import routeRouter from "./route";
import newsMonitorRouter from "./news-monitor";
import restrictionsSyncRouter from "./restrictions-sync";
import companiesRouter from "./companies";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(crimesRouter);
router.use(blockadeRouter);
router.use(roadConditionsRouter);
router.use(inviasClosuresRouter);
router.use(armedGroupsRouter);
router.use(routeRouter);
router.use(newsMonitorRouter);
router.use(restrictionsSyncRouter);
router.use(companiesRouter);

export default router;
