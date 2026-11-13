import { sql } from "drizzle-orm";
import {
  boolean,
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

// The sign-in tables of Better Auth (src/lib/auth.ts). Better Auth addresses the columns by
// these property names ("emailVerified", "userId"), so they are spelled the way it spells
// them; the columns themselves are snake_case like the rest. Ids are integers from Postgres
// (generateId: "serial"). The field list follows getAuthTables of @better-auth/core.

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// A person who can sign in. Created on the first sign-in by email; the owner, by the migration
// that gives them the data that was there before.
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // The name is never asked: always "".
  name: text("name").notNull(),
  // Lowercase, without spaces at the edges.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export type User = typeof users.$inferSelect;

// A sign-in on one device: the cookie holds the token.
export const sessions = pgTable(
  "sessions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// How a user signs in. Better Auth needs the table; with sign-in by email only, the token and
// password fields stay empty.
export const accounts = pgTable(
  "accounts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// Sign-in links that have not been used yet: identifier "magic-link:<hash of the code>",
// value {"type":"magic-link","email":"…"}. The row goes when the link is opened.
export const verifications = pgTable(
  "verifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// The sign-in emails sent in the last 10 minutes, one row per email: no more than 3 to one
// address (src/lib/sign-in-limit.ts). Older rows are deleted on the next request.
export const signInEmails = pgTable(
  "sign_in_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sign_in_emails_email_sent_at_idx").on(table.email, table.sentAt)],
);

// How often the owner wants to be reminded of a contact. NULL means "not set".
export const contactFrequency = pgEnum("contact_frequency", CONTACT_FREQUENCIES);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // The user who sees and changes the contact, its notes, revenge records and groups.
    // No cascade: deleting a user by hand fails instead of wiping their contacts.
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    howWeMet: text("how_we_met").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    notes: text("notes").notNull().default(""),
    contactFrequency: contactFrequency("contact_frequency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Every query of the app reads one owner's contacts.
  (table) => [index("contacts_owner_id_idx").on(table.ownerId)],
);

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
    // Groups are each user's own. No cascade, like contacts.
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id),
    // As typed, without spaces at the edges.
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Names are unique within one owner's groups, without case and with "ё" as "е": the same
    // rules as the search. Two users may each have their own "Друзья". ICU lowercases Cyrillic
    // the same way on any OS; the default libc collation does not. The index also serves
    // reading one owner's groups.
    uniqueIndex("groups_name_key").on(
      table.ownerId,
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
