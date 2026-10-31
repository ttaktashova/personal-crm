import "server-only";

import { sql } from "drizzle-orm";

import { runQuery } from "@/db";
import { contactGroups, contacts, interactions } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";

export type DueContact = {
  id: number;
  name: string;
  contactFrequency: ContactFrequency;
  // "YYYY-MM-DD" since when revenge is due; null when there has been no revenge yet.
  dueOn: string | null;
};

// Contacts with a frequency whose term since the last revenge record has come by `today`
// ("YYYY-MM-DD" in the app time zone: Postgres' current_date would use the session zone).
// A week is 7 days; a month, a quarter and a year are calendar ones, and Postgres moves
// 31.01 + 1 month to 28.02 by itself. Order: no revenge yet first, then the earliest term,
// then the name in the same Russian collation as the contact list; id breaks the last ties.
// With `groupId` only the people of that group are counted, in the same order.
export async function listDueContacts(
  today: string,
  groupId: number | null,
): Promise<DueContact[]> {
  const inGroup =
    groupId === null
      ? sql``
      : sql`and exists (
          select 1 from ${contactGroups} cg
          where cg.contact_id = c.id and cg.group_id = ${groupId}::integer
        )`;

  const rows = await runQuery("listDueContacts", (db) =>
    db.execute<{
      id: number;
      name: string;
      contact_frequency: ContactFrequency;
      due_on: string | null;
    }>(sql`
      select id, name, contact_frequency, due_on::text as due_on
      from (
        select c.id, c.name, c.contact_frequency,
          (last.occurred_on + case c.contact_frequency
            when 'week' then interval '7 days'
            when 'month' then interval '1 month'
            when 'quarter' then interval '3 months'
            when 'year' then interval '1 year'
          end)::date as due_on
        from ${contacts} c
        left join lateral (
          select max(i.occurred_on) as occurred_on
          from ${interactions} i
          where i.contact_id = c.id
        ) last on true
        where c.contact_frequency is not null ${inGroup}
      ) due
      where due_on is null or due_on <= ${today}::date
      order by due_on asc nulls first, name collate "ru-RU-x-icu", id
    `),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    contactFrequency: row.contact_frequency,
    dueOn: row.due_on,
  }));
}
