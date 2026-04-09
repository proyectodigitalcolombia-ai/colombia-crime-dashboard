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
import emailAlertsRouter from "./email-alerts";
import userRoutesRouter from "./user-routes";
import telegramMonitorRouter from "./telegram-monitor";

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
router.use(emailAlertsRouter);
router.use(userRoutesRouter);
router.use(telegramMonitorRouter);

export default router;
