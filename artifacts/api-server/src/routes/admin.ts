import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(
    users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      showOrderLogs: u.showOrderLogs,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.patch("/admin/users/:id/show-order-logs", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { showOrderLogs } = req.body as { showOrderLogs?: boolean };
  if (typeof showOrderLogs !== "boolean") {
    res.status(400).json({ error: "showOrderLogs must be boolean" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ showOrderLogs })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: updated.id, showOrderLogs: updated.showOrderLogs });
});

export default router;
