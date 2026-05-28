import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import meRouter from "./me";
import { createPlatformRouter } from "./platform-proxy";
import { PLATFORMS } from "./platforms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(meRouter);

// Register a proxy router per platform: /api/tivra/*, /api/miles/*, etc.
for (const config of PLATFORMS) {
  router.use(createPlatformRouter(config));
}

export default router;
