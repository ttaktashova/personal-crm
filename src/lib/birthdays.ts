import "server-only";

import { sql } from "drizzle-orm";

import { runQuery } from "@/db";
import { contactGroups, contacts } from "@/db/schema";

export type UpcomingBirthday = {
  id: number;
  name: string;
  // "YYYY-MM-DD": the next birthday, today or later.
  nextOn: string;
};

// How many days after today still count as "soon": today and the next 7 days.
const DAYS_AHEAD = 7;

// The people whose birthday is today or in the next 7 days, by day and month only.
// `today` is "YYYY-MM-DD" in the app time zone (Postgres' current_date would use the session
// zone). The birthday in year y is the 1st of the month plus (day − 1): for 29 February in a
// common year that is 1 March, the month does not match, and that year is skipped — so
// nobody born on 29 February is in the block in a common year. This year and the next are
// tried: the earliest not before today is the next birthday, across the New Year too.
// Order: the nearest first, then the name in the same Russian collation as the contact
// list; id breaks the last ties. With `groupId` only the people of that group are counted.
// Only the owner's contacts count: another user's people are never here.
export async function listUpcomingBirthdays(
  ownerId: number,
  today: string,
  groupId: number | null,
): Promise<UpcomingBirthday[]> {
  const year = Number(today.slice(0, 4));
  const inGroup =
    groupId === null
      ? sql``
      : sql`and exists (
          select 1 from ${contactGroups} cg
          where cg.contact_id = c.id and cg.group_id = ${groupId}::integer
        )`;

  const rows = await runQuery("listUpcomingBirthdays", (db) =>
    db.execute<{ id: number; name: string; next_on: string }>(sql`
      select id, name, next_on::text as next_on
      from (
        select c.id, c.name,
          (
            select min(candidates.on_date)
            from (
              select make_date(years.y, c.birth_month, 1) + (c.birth_day - 1) as on_date
              from (values (${year}::integer), (${year}::integer + 1)) as years(y)
            ) candidates
            where extract(month from candidates.on_date) = c.birth_month
              and candidates.on_date >= ${today}::date
          ) as next_on
        from ${contacts} c
        where c.owner_id = ${ownerId}::integer and c.birth_month is not null ${inGroup}
      ) upcoming
      where next_on <= ${today}::date + ${DAYS_AHEAD}::integer
      order by next_on, name collate "ru-RU-x-icu", id
    `),
  );

  return rows.map((row) => ({ id: row.id, name: row.name, nextOn: row.next_on }));
}
