import "server-only";

import { runQuery } from "@/db";
import { groups } from "@/db/schema";

// The groups a new user starts with: "Стартовые группы" of the contact-groups spec. The owner
// keeps the groups the app started with (0005); these are for everyone who signs in later.
// Names are user-facing, hence in Russian.
export const STARTER_GROUP_NAMES = [
  "Бывшие",
  "Должники",
  "Коллеги",
  "Не любят котиков",
  "Родственники",
] as const;

// Five empty groups of the user's own. Safe to call again: a name the user already has stays
// as it is (the unique index groups_name_key), nothing is added twice.
export async function createStarterGroups(ownerId: number): Promise<void> {
  await runQuery("createStarterGroups", (db) =>
    db
      .insert(groups)
      .values(STARTER_GROUP_NAMES.map((name) => ({ name, ownerId })))
      .onConflictDoNothing(),
  );
}
