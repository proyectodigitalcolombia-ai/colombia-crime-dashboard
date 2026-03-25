import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crimesRouter from "./crimes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(crimesRouter);

export default router;
