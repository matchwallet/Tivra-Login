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

export default router;
