import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, parseContactId } from "@/lib/contacts";
import { formatDate, formatDateTime } from "@/lib/format";

const EDIT_NOTICE_THRESHOLD_MS = 60_000;

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseContactId((await params).id);
  const contact = id === null ? null : await getContact(id);
  return { title: contact?.name ?? "Контакт не найден" };
}

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16">
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

  return (
    <>
      <header className="mt-4 mb-8 flex items-center gap-4">
        <ContactAvatar name={contact.name} className="size-14 text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {contact.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Добавлен {formatDate(contact.createdAt)}
            {wasEdited && <> · изменён {formatDateTime(contact.updatedAt)}</>}
          </p>
        </div>
      </header>

      {/* A new key after each save re-creates the form with the saved values. */}
      <ContactForm
        key={contact.updatedAt.toISOString()}
        mode="edit"
        contactId={contact.id}
        initialValues={{
          name: contact.name,
          howWeMet: contact.howWeMet,
          phone: contact.phone,
          email: contact.email,
          notes: contact.notes,
        }}
      />
    </>
  );
}

function ContactCardSkeleton() {
  return (
    <div aria-busy aria-label="Загружаем карточку">
      <div className="mt-4 mb-8 flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
