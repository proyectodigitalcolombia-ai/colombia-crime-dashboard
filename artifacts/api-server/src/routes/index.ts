import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crimesRouter from "./crimes";
import blockadeRouter from "./blockades";

const router: IRouter = Router();

router.use(healthRouter);
router.use(crimesRouter);
router.use(blockadeRouter);

export default router;
