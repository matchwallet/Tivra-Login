import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth";

const router = Router();

router.post("/admin/users", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { email, name, password, role } = req.body as {
    email?: unknown;
    name?: unknown;
    password?: unknown;
    role?: unknown;
  };
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 100) {
    res.status(400).json({ error: "Name required (1-100 chars)" });
    return;
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 128) {
    res.status(400).json({ error: "Password must be 6-128 chars" });
    return;
  }
  const finalRole = role === "admin" ? "admin" : "user";

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({ email, name: name.trim(), passwordHash, role: finalRole })
    .returning();

  req.log.info({ createdBy: req.authUser!.id, newUserId: user.id, role: finalRole }, "admin created user");
  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    showOrderLogs: user.showOrderLogs,
    createdAt: user.createdAt.toISOString(),
  });
});

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
