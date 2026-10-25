import { io } from "next/cache";

import { CatSad } from "@/components/cat-sad";
import { DueContactsList, type DueContactItem } from "@/components/due-contacts-list";
import { formatContactFrequency } from "@/lib/contact-frequency";
import { todayIsoDate } from "@/lib/dates";
import { formatDueLabel } from "@/lib/format";
import { listDueContacts } from "@/lib/keep-in-touch";

// "Пора мстить" on the main page, or the "Пока некому мстить" card when no one is due.
// Reads the database on every request, so another browser sees the same block.
export async function DueContacts() {
  // "Today" belongs to the request, not to the prerendered shell.
  await io();
  const today = todayIsoDate();
  const contacts = await listDueContacts(today);

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
  return <DueContactsList contacts={items} />;
}
