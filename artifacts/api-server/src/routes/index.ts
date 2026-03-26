import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crimesRouter from "./crimes";
import blockadeRouter from "./blockades";
import roadConditionsRouter from "./road-conditions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(crimesRouter);
router.use(blockadeRouter);
router.use(roadConditionsRouter);

export default router;
