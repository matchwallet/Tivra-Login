import { sql } from "drizzle-orm";
import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type DefaultToolSetting = {
  id: number | string;
  ctType: number | string;
  upi: string;
};

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  showOrderLogs: boolean("show_order_logs").notNull().default(true),
  accounts: text("accounts").array().notNull().default(sql`'{}'::text[]`),
  defaultTool: jsonb("default_tool").$type<DefaultToolSetting | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
