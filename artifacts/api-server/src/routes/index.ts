import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trendsRouter from "./trends";
import huntRouter from "./hunt";
import domainsRouter from "./domains";
import savedRouter from "./saved";
import statsRouter from "./stats";
import hunterRouter from "./hunter";
import newsRouter from "./news";
import workersRouter from "./workers";
import diamondsRouter from "./diamonds";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trendsRouter);
router.use(huntRouter);
router.use(domainsRouter);
router.use(savedRouter);
router.use(statsRouter);
router.use(hunterRouter);
router.use(diamondsRouter);
router.use(newsRouter);
router.use(workersRouter);

export default router;
