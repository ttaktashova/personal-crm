"use client";

import Link from "next/link";

import { ShowMoreItem, useCollapsedList } from "@/components/show-more";

// Texts are ready on the server, where "today" is known.
export type UpcomingBirthdayItem = {
  id: number;
  name: string;
  when: string; // "сегодня", "завтра", "через 3 дня"
  date: string; // "17 ноября"
};

// Looks like "Пора мстить" (due-contacts-list.tsx), without buttons in the rows.
// The whole list comes from the server; saving a contact revalidates the main page.
export function UpcomingBirthdaysList({ people }: { people: UpcomingBirthdayItem[] }) {
  const { listRef, visible, hiddenCount, expand } = useCollapsedList(people);

  return (
    <section
      aria-labelledby="upcoming-birthdays-title"
      className="overflow-hidden rounded-card border bg-card"
    >
      <h2
        id="upcoming-birthdays-title"
        className="px-4 pt-4 pb-2.5 font-display text-title leading-tight text-foreground sm:px-5 sm:pt-4.5 sm:pb-3 sm:text-xl"
      >
        Скоро день рождения
      </h2>
      <ul ref={listRef}>
        {visible.map((person) => (
          <li key={person.id} className="border-t py-2.5 pr-3 pl-4 sm:px-5 sm:py-3.5">
            <Link
              href={`/contacts/${person.id}`}
              className="rounded-sm font-semibold break-words text-foreground underline decoration-border-strong underline-offset-3 hover:decoration-current focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
            >
              {person.name}
            </Link>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-primary">{person.when}</span> · {person.date}
            </p>
          </li>
        ))}
        <ShowMoreItem hiddenCount={hiddenCount} onClick={expand} />
      </ul>
    </section>
  );
}
