import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tivraProxyRouter from "./tivra-proxy";
import adminRouter from "./admin";
import meRouter from "./me";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(meRouter);
router.use(tivraProxyRouter);

export default router;
