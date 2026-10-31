import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactCardActions } from "@/components/contact-card-actions";
import { Badge } from "@/components/ui/badge";
import { InteractionSection } from "@/components/interaction-section";
import { Skeleton } from "@/components/ui/skeleton";
import { formatContactFrequency } from "@/lib/contact-frequency";
import { getContact } from "@/lib/contacts";
import { formatLongDate } from "@/lib/format";
import { listContactGroups, listGroups } from "@/lib/groups";
import { parseId } from "@/lib/ids";
import { listInteractions } from "@/lib/interactions";
import { cn } from "@/lib/utils";

const EDIT_NOTICE_THRESHOLD_MS = 60_000;

// Header and field rows are shared with the skeleton, so the page does not jump when the card loads.
const HEADER_CLASS = "mt-4 mb-6 flex items-start gap-4 sm:items-center";
const TITLE_ROW_CLASS = "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1";
// Phone: buttons go below the dates lines. Computer: right after the name.
const ACTIONS_CLASS = "order-last mt-2 sm:order-none sm:mt-0";
const FIELDS_CLASS = "rounded-card border bg-card px-5 text-ui sm:px-7";
const FIELD_ROW_CLASS =
  "border-b py-3.5 last:border-b-0 sm:grid sm:grid-cols-[--spacing(50)_minmax(0,1fr)] sm:gap-4 sm:py-4";
const FIELD_LABEL_CLASS = "text-sm text-muted-foreground sm:text-ui";

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const contact = id === null ? null : await getContact(id);
  return { title: contact?.name ?? "Контакт не найден" };
}

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <div className="pt-6 sm:pt-10">
        <BackLink />
      </div>
      <Suspense fallback={<ContactCardSkeleton />}>
        <ContactCard params={params} />
      </Suspense>
    </main>
  );
}

async function ContactCard({
  params,
}: Pick<PageProps<"/contacts/[id]">, "params">) {
  const id = parseId((await params).id);
  if (id === null) notFound();

  const [contact, interactions, groupsByContact, allGroups] = await Promise.all([
    getContact(id),
    listInteractions(id),
    listContactGroups([id]),
    listGroups(),
  ]);
  if (!contact) notFound();
  const contactGroups = groupsByContact.get(id) ?? [];

  const wasEdited =
    contact.updatedAt.getTime() - contact.createdAt.getTime() >
    EDIT_NOTICE_THRESHOLD_MS;
  // Records come newest first, so the first one is the last revenge.
  const lastInteraction = interactions.at(0);

  return (
    <>
      <header className={HEADER_CLASS}>
        <ContactAvatar
          name={contact.name}
          tone="accent"
          className="size-14 text-lg"
        />
        <div className={TITLE_ROW_CLASS}>
          <h1 className="w-full font-display text-2xl leading-tight break-words sm:w-auto sm:min-w-0 sm:text-3xl">
            {contact.name}
          </h1>
          <ContactCardActions
            contactId={contact.id}
            values={{
              name: contact.name,
              howWeMet: contact.howWeMet,
              phone: contact.phone,
              email: contact.email,
              notes: contact.notes,
              contactFrequency: contact.contactFrequency,
              groupIds: contactGroups.map((group) => group.id),
            }}
            groups={allGroups}
            className={ACTIONS_CLASS}
          />
          <div className="w-full">
            <p className="mt-0.5 text-ui leading-5.5 text-card-foreground">
              {lastInteraction
                ? `мстили ${formatLongDate(lastInteraction.occurredOn)}`
                : "Пока не мстили"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Добавлен {formatLongDate(contact.createdAt)}
              {wasEdited && <> · изменён {formatLongDate(contact.updatedAt)}</>}
            </p>
          </div>
        </div>
      </header>

      <dl className={FIELDS_CLASS}>
        <TextField label="Откуда знакомы" value={contact.howWeMet} />
        <GroupsField groups={contactGroups} />
        <TextField label="Телефон" value={contact.phone} />
        <TextField label="Почта" value={contact.email} />
        {/* Never empty: no frequency reads "Не задано", a value of its own. */}
        <TextField
          label="Как часто припоминать"
          value={formatContactFrequency(contact.contactFrequency)}
        />
        <div className={FIELD_ROW_CLASS}>
          <dt className={FIELD_LABEL_CLASS}>Последняя месть</dt>
          <dd className="mt-1 sm:mt-0">
            <InteractionSection contactId={contact.id} interactions={interactions} />
          </dd>
        </div>
        <TextField label="Заметки" value={contact.notes} multiline />
      </dl>
    </>
  );
}

function TextField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  // Input is trimmed on save; trim here covers older data.
  const isEmpty = value.trim() === "";
  return (
    <div className={FIELD_ROW_CLASS}>
      <dt className={FIELD_LABEL_CLASS}>{label}</dt>
      <dd
        className={cn(
          "mt-0.5 break-words sm:mt-0",
          isEmpty ? "text-muted-foreground italic" : "text-foreground",
          multiline && !isEmpty && "whitespace-pre-wrap",
        )}
      >
        {isEmpty ? "не указано" : value}
      </dd>
    </div>
  );
}

// The groups as labels, by name, all of them: the card has the room for any number.
function GroupsField({ groups }: { groups: { id: number; name: string }[] }) {
  return (
    <div className={FIELD_ROW_CLASS}>
      <dt className={FIELD_LABEL_CLASS}>Группы</dt>
      <dd className="mt-0.5 sm:mt-0">
        {groups.length === 0 ? (
          <span className="text-muted-foreground italic">не указано</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {groups.map((group) => (
              <li key={group.id} className="max-w-full">
                <Badge variant="outline" className="h-6 max-w-full px-2.5 text-caption">
                  <span className="truncate">{group.name}</span>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function ContactCardSkeleton() {
  return (
    <div aria-busy aria-label="Загружаем карточку">
      <div className={HEADER_CLASS}>
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className={TITLE_ROW_CLASS}>
          <div className="flex h-7.5 w-full items-center sm:h-9.5 sm:w-auto">
            <Skeleton className="h-6 w-56 sm:h-7" />
          </div>
          <div className={cn("flex gap-2 sm:gap-1.5", ACTIONS_CLASS)}>
            <Skeleton className="size-11 rounded-xl sm:size-9 sm:rounded-lg" />
            <Skeleton className="size-11 rounded-xl sm:size-9 sm:rounded-lg" />
          </div>
          <div className="w-full">
            <div className="mt-0.5 flex h-5.5 items-center">
              <Skeleton className="h-3.5 w-44" />
            </div>
            {/* On a phone the dates of an edited contact take two lines. */}
            <div className="mt-0.5 flex h-10 flex-col justify-center gap-1.5 sm:h-5">
              <Skeleton className="h-3.5 w-64 max-w-full" />
              <Skeleton className="h-3.5 w-28 sm:hidden" />
            </div>
          </div>
        </div>
      </div>
      <div className={FIELDS_CLASS}>
        {/* "Откуда знакомы", "Группы", "Телефон", "Почта", "Как часто припоминать". */}
        {["w-32", "w-36", "w-40", "w-48", "w-28"].map((width) => (
          <SkeletonFieldRow key={width} width={width} />
        ))}
        {/* "Последняя месть": the record line, then the buttons row. */}
        <div className={FIELD_ROW_CLASS}>
          <div className="flex h-5 items-center sm:h-5.5">
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="mt-1 flex flex-col gap-3 sm:mt-0">
            <div className="flex h-5.5 items-center">
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="flex items-center gap-4 sm:gap-5">
              <Skeleton className="h-11 w-30 rounded-xl sm:order-last sm:h-9 sm:w-26 sm:rounded-lg" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        <SkeletonFieldRow width="w-72" />
      </div>
    </div>
  );
}

function SkeletonFieldRow({ width }: { width: string }) {
  return (
    <div className={FIELD_ROW_CLASS}>
      <div className="flex h-5 items-center sm:h-5.5">
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="mt-0.5 flex h-5.5 items-center sm:mt-0">
        <Skeleton className={cn("h-4 max-w-full", width)} />
      </div>
    </div>
  );
}
