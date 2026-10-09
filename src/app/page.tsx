import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ContactDirectory } from "@/components/contact-directory";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listContacts, parseContactId } from "@/lib/contacts";

export const metadata: Metadata = {
  title: "Контакты",
};

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between gap-4 pt-8 pb-2 sm:pt-12">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Контакты
        </h1>
        <Link
          href="/contacts/new"
          className={buttonVariants({ size: "lg", className: "px-4" })}
        >
          <PlusIcon data-icon="inline-start" />
          Добавить контакт
        </Link>
      </header>

      <Suspense fallback={<DirectorySkeleton />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Reads the database on every request, so another browser sees the same, fresh list.
async function Directory({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const { added } = await searchParams;
  const contacts = await listContacts();

  return (
    <ContactDirectory
      contacts={contacts}
      highlightId={parseContactId(added)}
    />
  );
}

function DirectorySkeleton() {
  return (
    <div aria-busy aria-label="Загружаем контакты">
      <div className="pt-2 pb-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-3 h-4 w-28" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
