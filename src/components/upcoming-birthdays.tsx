import { io } from "next/cache";

import {
  UpcomingBirthdaysList,
  type UpcomingBirthdayItem,
} from "@/components/upcoming-birthdays-list";
import { formatBirthdayDate, formatBirthdayWhen } from "@/lib/birthday";
import { listUpcomingBirthdays } from "@/lib/birthdays";
import { todayIsoDate } from "@/lib/dates";
import { listGroups } from "@/lib/groups";
import { resolveGroupFilter } from "@/lib/pagination";
import { requireUser } from "@/lib/session";

// "Скоро день рождения" on the main page: birthdays today and in the next 7 days.
// Nothing at all when there are none: no title, no empty card. With a group chosen
// (?group=) only the people of that group are counted.
// Reads the database on every request, so another browser sees the same block.
export async function UpcomingBirthdays({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const user = await requireUser();
  // "Today" belongs to the request, not to the prerendered shell.
  await io();
  const today = todayIsoDate();
  const params = await searchParams;
  const groupId = resolveGroupFilter(params.group, await listGroups(user.id));
  const people = await listUpcomingBirthdays(user.id, today, groupId);

  if (people.length === 0) return null;

  const items: UpcomingBirthdayItem[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    when: formatBirthdayWhen(person.nextOn, today),
    date: formatBirthdayDate(person.nextOn),
  }));
  // Keyed by the group: another group starts a new list, showing the first five again.
  return <UpcomingBirthdaysList key={groupId ?? "all"} people={items} />;
}
