import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactCardActions } from "@/components/contact-card-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, parseContactId } from "@/lib/contacts";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const EDIT_NOTICE_THRESHOLD_MS = 60_000;

// Header and field rows are shared with the skeleton, so the page does not jump when the card loads.
const HEADER_CLASS = "mt-4 mb-6 flex items-start gap-4 sm:items-center";
const TITLE_ROW_CLASS = "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1";
// Phone: buttons go below the dates line. Computer: right after the name.
const ACTIONS_CLASS = "order-last mt-2 sm:order-none sm:mt-0";
const FIELDS_CLASS = "rounded-card border bg-card px-5 text-ui sm:px-7";
const FIELD_ROW_CLASS =
  "border-b py-3.5 last:border-b-0 sm:grid sm:grid-cols-[--spacing(50)_minmax(0,1fr)] sm:gap-4 sm:py-4";

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseContactId((await params).id);
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
  const id = parseContactId((await params).id);
  if (id === null) notFound();

  const contact = await getContact(id);
  if (!contact) notFound();

  const wasEdited =
    contact.updatedAt.getTime() - contact.createdAt.getTime() >
    EDIT_NOTICE_THRESHOLD_MS;

  const fields = [
    { label: "Откуда знакомы", value: contact.howWeMet },
    { label: "Телефон", value: contact.phone },
    { label: "Почта", value: contact.email },
    { label: "Заметки", value: contact.notes, multiline: true },
  ];

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
            }}
            className={ACTIONS_CLASS}
          />
          <p className="w-full text-sm text-muted-foreground">
            Добавлен {formatLongDate(contact.createdAt)}
            {wasEdited && <> · изменён {formatLongDate(contact.updatedAt)}</>}
          </p>
        </div>
      </header>

      <dl className={FIELDS_CLASS}>
        {fields.map(({ label, value, multiline }) => {
          // Input is trimmed on save; trim here covers older data.
          const isEmpty = value.trim() === "";
          return (
            <div key={label} className={FIELD_ROW_CLASS}>
              <dt className="text-sm text-muted-foreground sm:text-ui">{label}</dt>
              <dd
                className={cn(
                  "mt-0.5 break-words sm:mt-0",
                  isEmpty
                    ? "text-muted-foreground italic"
                    : "text-foreground",
                  multiline && !isEmpty && "whitespace-pre-wrap",
                )}
              >
                {isEmpty ? "не указано" : value}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
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
          {/* On a phone the dates of an edited contact take two lines. */}
          <div className="flex h-10 w-full flex-col justify-center gap-1.5 sm:h-5">
            <Skeleton className="h-3.5 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-28 sm:hidden" />
          </div>
        </div>
      </div>
      <div className={FIELDS_CLASS}>
        {["w-32", "w-40", "w-48", "w-72"].map((width) => (
          <div key={width} className={FIELD_ROW_CLASS}>
            <div className="flex h-5 items-center sm:h-5.5">
              <Skeleton className="h-3.5 w-28" />
            </div>
            <div className="mt-0.5 flex h-5.5 items-center sm:mt-0">
              <Skeleton className={cn("h-4 max-w-full", width)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
