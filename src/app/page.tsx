import type { Metadata } from "next";
import { Suspense } from "react";

import { ContactDirectory } from "@/components/contact-directory";
import { NewContactDialog } from "@/components/new-contact-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { listContacts, parseContactId } from "@/lib/contacts";

// The layout's title template skips pages of its own segment, so the suffix is spelled out here.
export const metadata: Metadata = {
  title: { absolute: "Косячники · Черный список" },
};

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-8 pb-3 sm:pt-12">
        <h1 className="font-display text-3xl sm:text-4xl">Косячники</h1>
        <NewContactDialog />
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
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="mt-3 h-4 w-28" />
      </div>
      <Skeleton className="mb-2 ml-1 h-4.5 w-4" />
      <div className="divide-y overflow-hidden rounded-card border bg-card">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
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
