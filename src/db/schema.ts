import { date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  howWeMet: text("how_we_met").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

// Revenge history: one row per "when and how". Deleted together with the contact.
export const interactions = pgTable(
  "interactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    // A plain "YYYY-MM-DD" string: never turned into a Date, so it cannot shift a day.
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    // Stored as shown, including the default text.
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The card reads one contact's records newest first. NULLS FIRST is what a plain
    // ORDER BY ... DESC means in Postgres, so the index also serves the ordering.
    index("interactions_contact_id_occurred_on_id_idx").on(
      table.contactId,
      table.occurredOn.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
  ],
);

export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
