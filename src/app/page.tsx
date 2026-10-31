import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { ContactDirectory } from "@/components/contact-directory";
import { DueContacts } from "@/components/due-contacts";
import { NewContactDialog } from "@/components/new-contact-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { findContactPage, listContactsPage } from "@/lib/contacts";
import { parseId } from "@/lib/ids";
import {
  DEFAULT_PAGE_SIZE,
  firstValue,
  PAGE_SIZE_COOKIE,
  parsePage,
  parsePageSize,
} from "@/lib/pagination";
import { toSearchWords } from "@/lib/search";

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

      {/* The search row adds 8px on top: 24px to the search on a computer, 20px on a phone. */}
      <div className="mt-3 mb-3 sm:mb-4">
        <Suspense fallback={<DueContactsSkeleton />}>
          <DueContacts />
        </Suspense>
      </div>

      <Suspense fallback={<DirectorySkeleton />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Reads the database on every request, so another browser sees the same, fresh list.
// Only one page goes to the browser: ?page=, ?q= and ?size= pick which one.
async function Directory({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const cookieStore = await cookies();

  // The size in the URL wins, then the one remembered in this browser, then 50.
  const pageSize =
    parsePageSize(params.size) ??
    parsePageSize(cookieStore.get(PAGE_SIZE_COOKIE)?.value) ??
    DEFAULT_PAGE_SIZE;
  const query = (firstValue(params.q) ?? "").trim();
  const highlightId = parseId(firstValue(params.added));

  // After "Добавить черта" (/?added=42) open the page where the new contact stands.
  let page = parsePage(params.page);
  if (highlightId !== null && params.page === undefined) {
    page = (await findContactPage(highlightId, pageSize)) ?? 1;
  }

  const list = await listContactsPage({
    page,
    pageSize,
    words: toSearchWords(query),
  });

  return (
    <ContactDirectory
      contacts={list.contacts}
      totalCount={list.totalCount}
      matchedCount={list.matchedCount}
      page={list.page}
      pageCount={list.pageCount}
      pageSize={pageSize}
      query={query}
      highlightId={highlightId}
    />
  );
}

// The same frame as the block, with the title and two rows.
function DueContactsSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Загружаем, кому пора мстить"
      className="overflow-hidden rounded-card border bg-card"
    >
      <div className="px-4 pt-4 pb-2.5 sm:px-5 sm:pt-4.5 sm:pb-3">
        <Skeleton className="h-6 w-40" />
      </div>
      {Array.from({ length: 2 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-2.5 border-t py-2.5 pr-3 pl-4 sm:gap-4 sm:px-5 sm:py-3.5"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex shrink-0 gap-2.5 sm:gap-2">
            <Skeleton className="size-11 rounded-xl sm:h-9 sm:w-24 sm:rounded-lg" />
            <Skeleton className="size-11 rounded-xl sm:h-9 sm:w-24 sm:rounded-lg" />
          </div>
        </div>
      ))}
    </div>
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
