import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/me/accounts", requireAuth, async (req: AuthedRequest, res) => {
  const [user] = await db
    .select({ accounts: usersTable.accounts })
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);
  res.json({ accounts: user?.accounts ?? [] });
});

router.put("/me/accounts", requireAuth, async (req: AuthedRequest, res) => {
  const { accounts } = req.body as { accounts?: unknown };
  if (
    !Array.isArray(accounts) ||
    !accounts.every((a) => typeof a === "string" && a.length > 0 && a.length <= 64)
  ) {
    res.status(400).json({ error: "accounts must be an array of non-empty strings" });
    return;
  }
  const deduped = Array.from(new Set(accounts as string[]));
  const [updated] = await db
    .update(usersTable)
    .set({ accounts: deduped })
    .where(eq(usersTable.id, req.authUser!.id))
    .returning({ accounts: usersTable.accounts });
  res.json({ accounts: updated?.accounts ?? [] });
});

// Default-tool setting — per-user, server-side so it follows the user across devices.
router.get("/me/default-tool", requireAuth, async (req: AuthedRequest, res) => {
  const [user] = await db
    .select({ defaultTool: usersTable.defaultTool })
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);
  res.json({ defaultTool: user?.defaultTool ?? null });
});

router.put("/me/default-tool", requireAuth, async (req: AuthedRequest, res) => {
  const { defaultTool } = req.body as { defaultTool?: unknown };
  if (defaultTool !== null && defaultTool !== undefined) {
    const t = defaultTool as Record<string, unknown>;
    const idOk = typeof t.id === "string" || typeof t.id === "number";
    const ctOk = typeof t.ctType === "string" || typeof t.ctType === "number";
    const upiOk = typeof t.upi === "string" && t.upi.length > 0 && t.upi.length <= 128;
    if (!idOk || !ctOk || !upiOk) {
      res.status(400).json({ error: "defaultTool must be null or { id, ctType, upi }" });
      return;
    }
  }
  const payload = (defaultTool ?? null) as { id: number | string; ctType: number | string; upi: string } | null;
  const [updated] = await db
    .update(usersTable)
    .set({ defaultTool: payload })
    .where(eq(usersTable.id, req.authUser!.id))
    .returning({ defaultTool: usersTable.defaultTool });
  res.json({ defaultTool: updated?.defaultTool ?? null });
});

export default router;
