import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Relative import: drizzle-kit and the seed script load this file without the "@/" alias.
import { CONTACT_FREQUENCIES } from "../lib/contact-frequency";

// How often the owner wants to be reminded of a contact. NULL means "not set".
export const contactFrequency = pgEnum("contact_frequency", CONTACT_FREQUENCIES);

export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  howWeMet: text("how_we_met").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  contactFrequency: contactFrequency("contact_frequency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

// A group of contacts the owner made up: "Семья", "Теннис". A contact can be in any number.
export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // As typed, without spaces at the edges.
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Names are unique without case and with "ё" as "е": the same rules as the search.
    // ICU lowercases Cyrillic the same way on any OS; the default libc collation does not.
    uniqueIndex("groups_name_key").on(
      sql`replace(lower(${table.name} collate "ru-RU-x-icu"), 'ё', 'е')`,
    ),
  ],
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

// Who is in which group. Rows go away with the contact or the group, the other side stays.
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    // One person is in a group at most once.
    primaryKey({ columns: [table.contactId, table.groupId] }),
    // The list and "Пора мстить" read the people of one group.
    index("contact_groups_group_id_contact_id_idx").on(table.groupId, table.contactId),
  ],
);
