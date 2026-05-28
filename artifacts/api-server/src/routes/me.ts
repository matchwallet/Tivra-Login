import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import type { DefaultToolSetting, DefaultToolsMap } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { PLATFORMS } from "./platforms";

const router = Router();

const VALID_SLUGS = new Set(PLATFORMS.map((p) => p.slug));

// Normalize a stored value (which may be legacy flat shape OR a map) into a map.
function normalizeToMap(stored: unknown): DefaultToolsMap {
  if (!stored || typeof stored !== "object") return {};
  const obj = stored as Record<string, unknown>;
  // Legacy single-tool shape: { id, ctType, upi }
  if ("id" in obj && "ctType" in obj && "upi" in obj) {
    return { tivra: obj as unknown as DefaultToolSetting };
  }
  // Already a map — filter to known slugs.
  const out: DefaultToolsMap = {};
  for (const [k, v] of Object.entries(obj)) {
    if (VALID_SLUGS.has(k) && v && typeof v === "object") {
      out[k] = v as DefaultToolSetting;
    }
  }
  return out;
}

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

// GET returns a per-platform map: { tivra: {...} | null, miles: {...} | null, ... }
router.get("/me/default-tool", requireAuth, async (req: AuthedRequest, res) => {
  const [user] = await db
    .select({ defaultTool: usersTable.defaultTool })
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);
  res.json({ defaultTools: normalizeToMap(user?.defaultTool) });
});

// PUT body: { platform: "tivra" | "miles" | ..., defaultTool: {id, ctType, upi} | null }
// Merges into the existing per-platform map.
router.put("/me/default-tool", requireAuth, async (req: AuthedRequest, res) => {
  const { platform, defaultTool } = req.body as { platform?: unknown; defaultTool?: unknown };
  if (typeof platform !== "string" || !VALID_SLUGS.has(platform)) {
    res.status(400).json({ error: `platform must be one of: ${[...VALID_SLUGS].join(", ")}` });
    return;
  }
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
  const [user] = await db
    .select({ defaultTool: usersTable.defaultTool })
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);
  const map = normalizeToMap(user?.defaultTool);
  if (defaultTool === null || defaultTool === undefined) {
    delete map[platform];
  } else {
    map[platform] = defaultTool as DefaultToolSetting;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ defaultTool: map })
    .where(eq(usersTable.id, req.authUser!.id))
    .returning({ defaultTool: usersTable.defaultTool });
  res.json({ defaultTools: normalizeToMap(updated?.defaultTool) });
});

export default router;
