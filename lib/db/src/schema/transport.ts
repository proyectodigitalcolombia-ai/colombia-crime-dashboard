import { pgTable, text, serial, integer, timestamp, index, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transportTenantsTable = pgTable("transport_tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nit: text("nit").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transport_tenants_name_idx").on(table.name),
]);

export const insertTransportTenantSchema = createInsertSchema(transportTenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransportTenant = z.infer<typeof insertTransportTenantSchema>;
export type TransportTenant = typeof transportTenantsTable.$inferSelect;

export const transportUsersTable = pgTable("transport_users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("controlador"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transport_users_email_idx").on(table.email),
  index("transport_users_tenant_idx").on(table.tenantId),
]);

export const insertTransportUserSchema = createInsertSchema(transportUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransportUser = z.infer<typeof insertTransportUserSchema>;
export type TransportUser = typeof transportUsersTable.$inferSelect;

export const transportDispatchesTable = pgTable("transport_dispatches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  consecutive: text("consecutive").notNull(),
  manifest: text("manifest"),
  plate: text("plate").notNull(),
  trailer: text("trailer"),
  brand: text("brand"),
  vehicleClass: text("vehicle_class"),
  model: text("model"),
  color: text("color"),
  transportCompany: text("transport_company"),
  driver: text("driver"),
  driverCc: text("driver_cc"),
  driverPhone: text("driver_phone"),
  generator: text("generator"),
  insurer: text("insurer"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  via: text("via"),
  departureDate: text("departure_date"),
  departureTime: text("departure_time"),
  restrictionStart: text("restriction_start"),
  restrictionEnd: text("restriction_end"),
  status: text("status").notNull().default("a_tiempo"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transport_dispatches_tenant_idx").on(table.tenantId),
  index("transport_dispatches_plate_idx").on(table.plate),
  index("transport_dispatches_status_idx").on(table.status),
]);

export const insertTransportDispatchSchema = createInsertSchema(transportDispatchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransportDispatch = z.infer<typeof insertTransportDispatchSchema>;
export type TransportDispatch = typeof transportDispatchesTable.$inferSelect;

export const transportCheckpointsTable = pgTable("transport_checkpoints", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => transportDispatchesTable.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  location: text("location").notNull(),
  plannedDate: text("planned_date"),
  plannedTime: text("planned_time"),
  adjustedDate: text("adjusted_date"),
  adjustedTime: text("adjusted_time"),
  realDate: text("real_date"),
  realTime: text("real_time"),
  novelty: text("novelty"),
  checkpointNotes: text("checkpoint_notes"),
  distanceKm: real("distance_km"),
  timeHours: real("time_hours"),
  speedKmh: real("speed_kmh"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transport_checkpoints_dispatch_idx").on(table.dispatchId),
]);

export const insertTransportCheckpointSchema = createInsertSchema(transportCheckpointsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransportCheckpoint = z.infer<typeof insertTransportCheckpointSchema>;
export type TransportCheckpoint = typeof transportCheckpointsTable.$inferSelect;

export const transportObservationsTable = pgTable("transport_observations", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => transportDispatchesTable.id, { onDelete: "cascade" }),
  observationType: text("observation_type").notNull().default("otro"),
  detail: text("detail").notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transport_observations_dispatch_idx").on(table.dispatchId),
]);

export const insertTransportObservationSchema = createInsertSchema(transportObservationsTable).omit({ id: true, createdAt: true });
export type InsertTransportObservation = z.infer<typeof insertTransportObservationSchema>;
export type TransportObservation = typeof transportObservationsTable.$inferSelect;
