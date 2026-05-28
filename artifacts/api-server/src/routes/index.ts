import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tivraProxyRouter from "./tivra-proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tivraProxyRouter);

export default router;
