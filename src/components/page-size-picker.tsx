"use client";

import Link from "next/link";
import { Fragment } from "react";

import {
  buildListHref,
  pageForSizeChange,
  PAGE_SIZE_COOKIE,
  PAGE_SIZES,
  type PageSize,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // a year

// Only a click remembers the size: a link with ?size= shows it but leaves the choice alone.
function rememberPageSize(size: PageSize) {
  try {
    document.cookie = `${PAGE_SIZE_COOKIE}=${size}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // Cookies are blocked: the size still changes, it is just not remembered.
  }
}

// "По: 25 · 50 · 100" next to the counter. Not shown when everything fits in 25.
// The first contact of the current page stays on screen after the change.
export function PageSizePicker({
  page,
  pageSize,
  query,
  matchedCount,
  onNavigate,
}: {
  page: number;
  pageSize: PageSize;
  query: string;
  matchedCount: number;
  onNavigate: (href: string) => void;
}) {
  if (matchedCount <= PAGE_SIZES[0]) return null;

  return (
    <div
      role="group"
      aria-label="Сколько показывать на странице"
      className="flex shrink-0 items-center text-sm text-muted-foreground"
    >
      <span className="mr-0.5">По:</span>
      {PAGE_SIZES.map((size, index) => {
        const href = buildListHref({
          q: query,
          page: pageForSizeChange(page, pageSize, size),
          size,
        });
        const isSelected = size === pageSize;
        return (
          <Fragment key={size}>
            {index > 0 && <span aria-hidden>·</span>}
            {/* Small numbers keep the row as low as the counter; on a phone the hit
                area is still 44×44: 44px wide, and the pseudo-element adds the height. */}
            <Link
              href={href}
              scroll={false}
              aria-current={isSelected ? "true" : undefined}
              onNavigate={(event) => {
                event.preventDefault();
                rememberPageSize(size);
                onNavigate(href);
              }}
              className={cn(
                "relative inline-flex h-5 w-11 items-center justify-center rounded-sm tabular-nums transition-colors after:absolute after:inset-x-0 after:-inset-y-3 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring sm:w-9",
                isSelected ? "font-semibold text-primary" : "hover:text-foreground",
              )}
            >
              {size}
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}
