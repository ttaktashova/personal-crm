"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { useListHref } from "@/lib/list-return";

// Back to the page of the list the card was opened from, with the same search and size.
// A card opened from a bookmark leads to the first page.
export function BackLink() {
  const href = useListHref();

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeftIcon className="size-4" />
      Весь список
    </Link>
  );
}
