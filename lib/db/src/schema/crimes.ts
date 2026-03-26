import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crimeStatsTable = pgTable("crime_stats", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  crimeTypeId: text("crime_type_id").notNull(),
  crimeTypeName: text("crime_type_name").notNull(),
  department: text("department").notNull(),
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("crime_stats_year_month_idx").on(table.year, table.month),
  index("crime_stats_crime_type_idx").on(table.crimeTypeId),
  index("crime_stats_department_idx").on(table.department),
]);

export const refreshLogTable = pgTable("refresh_log", {
  id: serial("id").primaryKey(),
  lastRefreshed: timestamp("last_refreshed"),
  nextRefresh: timestamp("next_refresh"),
  status: text("status").notNull().default("idle"),
  message: text("message"),
  recordCount: integer("record_count").notNull().default(0),
});

export const insertCrimeStatsSchema = createInsertSchema(crimeStatsTable).omit({ id: true, createdAt: true });
export type InsertCrimeStat = z.infer<typeof insertCrimeStatsSchema>;
export type CrimeStat = typeof crimeStatsTable.$inferSelect;

export const insertRefreshLogSchema = createInsertSchema(refreshLogTable).omit({ id: true });
export type InsertRefreshLog = z.infer<typeof insertRefreshLogSchema>;
export type RefreshLog = typeof refreshLogTable.$inferSelect;

export const blockadeTable = pgTable("blockades", {
  id: serial("id").primaryKey(),
  corridorId: text("corridor_id").notNull(),
  department: text("department").notNull(),
  date: text("date").notNull(),
  cause: text("cause").notNull().default("comunidad"),
  location: text("location").notNull(),
  durationHours: integer("duration_hours"),
  status: text("status").notNull().default("activo"),
  notes: text("notes"),
  reporter: text("reporter"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("blockades_corridor_idx").on(table.corridorId),
  index("blockades_status_idx").on(table.status),
]);

export const insertBlockadeSchema = createInsertSchema(blockadeTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBlockade = z.infer<typeof insertBlockadeSchema>;
export type Blockade = typeof blockadeTable.$inferSelect;
