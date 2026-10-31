import { io } from "next/cache";

import { CatSad } from "@/components/cat-sad";
import { DueContactsList, type DueContactItem } from "@/components/due-contacts-list";
import { formatContactFrequency } from "@/lib/contact-frequency";
import { todayIsoDate } from "@/lib/dates";
import { formatDueLabel } from "@/lib/format";
import { listGroups } from "@/lib/groups";
import { listDueContacts } from "@/lib/keep-in-touch";
import { resolveGroupFilter } from "@/lib/pagination";

// "Пора мстить" on the main page, or the "Пока некому мстить" card when no one is due.
// With a group chosen (?group=) only the people of that group are counted.
// Reads the database on every request, so another browser sees the same block.
export async function DueContacts({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  // "Today" belongs to the request, not to the prerendered shell.
  await io();
  const today = todayIsoDate();
  const params = await searchParams;
  const groupId = resolveGroupFilter(params.group, await listGroups());
  const contacts = await listDueContacts(today, groupId);

  if (contacts.length === 0) {
    return (
      <section className="flex items-center gap-3.5 rounded-card border bg-card px-4 py-2.5 sm:gap-4 sm:px-5 sm:py-3">
        <CatSad />
        <h2 className="font-display text-subtitle leading-tight whitespace-nowrap text-foreground sm:text-lg">
          Пока некому мстить
        </h2>
      </section>
    );
  }

  const items: DueContactItem[] = contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    frequency: formatContactFrequency(contact.contactFrequency),
    due: contact.dueOn === null ? "ещё не мстили" : formatDueLabel(contact.dueOn, today),
  }));
  // Keyed by the group: another group starts a new list, showing the first five again.
  return <DueContactsList key={groupId ?? "all"} contacts={items} />;
}
