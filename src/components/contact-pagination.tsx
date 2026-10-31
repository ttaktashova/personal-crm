"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { buildListHref, getPageItems, type PageSize } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// Two sets of numbers, switched by CSS only, so server and browser render the same HTML.
// Computer: one neighbour on each side, "‹ 1 … 4 [5] 6 … 20 ›" — 9 buttons at most.
// Phone: no neighbours, "‹ 1 … [5] … 20 ›" — 7 buttons of 44px fit in 343px.
const LAYOUTS = [
  { siblings: 1, className: "hidden sm:flex" },
  { siblings: 0, className: "flex sm:hidden" },
];

// 44×44 on a phone, 40×40 on a computer.
const ITEM_SIZE = "size-11 sm:size-10";

// Under the list. Not shown when everything fits on one page.
export function ContactPagination({
  group,
  page,
  pageCount,
  query,
  pageSize,
  onNavigate,
}: {
  group: number | null;
  page: number;
  pageCount: number;
  query: string;
  pageSize: PageSize;
  onNavigate: (href: string) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <Pagination aria-label="Страницы списка">
        {LAYOUTS.map(({ siblings, className }) => (
          <PaginationContent key={siblings} className={cn("gap-1", className)}>
            <PaginationItem>
              <Arrow
                label="Предыдущая страница"
                href={
                  page > 1
                    ? buildListHref({ group, q: query, page: page - 1, size: pageSize })
                    : null
                }
                onNavigate={onNavigate}
              >
                <ChevronLeftIcon />
              </Arrow>
            </PaginationItem>
            {getPageItems(page, pageCount, siblings).map((item, index) => (
              <PaginationItem key={item === "ellipsis" ? `ellipsis-${index}` : item}>
                {item === "ellipsis" ? (
                  <PaginationEllipsis className={ITEM_SIZE} />
                ) : (
                  <PageLink
                    href={buildListHref({ group, q: query, page: item, size: pageSize })}
                    isActive={item === page}
                    onNavigate={onNavigate}
                  >
                    {item}
                  </PageLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <Arrow
                label="Следующая страница"
                href={
                  page < pageCount
                    ? buildListHref({ group, q: query, page: page + 1, size: pageSize })
                    : null
                }
                onNavigate={onNavigate}
              >
                <ChevronRightIcon />
              </Arrow>
            </PaginationItem>
          </PaginationContent>
        ))}
      </Pagination>
      <p className="text-sm text-muted-foreground">
        Страница {page} из {pageCount}
      </p>
    </div>
  );
}

// The list owns the navigation: it scrolls to the top of the list and dims the old page
// while the new one loads. Ctrl+click still opens the page in a new tab.
function PageLink({
  href,
  isActive,
  onNavigate,
  children,
  ...props
}: {
  href: string;
  isActive?: boolean;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <PaginationLink
      href={href}
      isActive={isActive}
      scroll={false}
      onNavigate={(event) => {
        event.preventDefault();
        onNavigate(href);
      }}
      className={cn(ITEM_SIZE, "tabular-nums")}
      {...props}
    >
      {children}
    </PaginationLink>
  );
}

// "‹" on the first page and "›" on the last one are not links, just dimmed icons.
function Arrow({
  label,
  href,
  onNavigate,
  children,
}: {
  label: string;
  href: string | null;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
}) {
  if (href === null) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={label}
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), ITEM_SIZE, "opacity-50")}
      >
        {children}
      </span>
    );
  }

  return (
    <PageLink href={href} onNavigate={onNavigate} aria-label={label}>
      {children}
    </PageLink>
  );
}
