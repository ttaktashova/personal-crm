"use client";

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { pluralize } from "@/lib/format";

// "Пора мстить" and "Скоро день рождения" show the first five people and the rest on demand.

const COLLAPSED_COUNT = 5;

// The rows to show and how many are hidden. Put `listRef` on the <ul>: after "+ещё …" the
// focus moves to the first person it revealed, since the button itself disappears.
// The list starts collapsed: give the component a `key` to collapse it again.
export function useCollapsedList<T>(items: T[]) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = items.length - visible.length;

  useEffect(() => {
    if (expanded) {
      listRef.current?.querySelectorAll<HTMLElement>("li a")[COLLAPSED_COUNT]?.focus();
    }
  }, [expanded]);

  return { listRef, visible, hiddenCount, expand: () => setExpanded(true) };
}

// The last row of the list: "+ещё 7 людишек". Nothing when nobody is hidden.
export function ShowMoreItem({
  hiddenCount,
  onClick,
}: {
  hiddenCount: number;
  onClick: () => void;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <li className="border-t">
      <button
        type="button"
        aria-expanded="false"
        onClick={onClick}
        className="flex h-13 w-full items-center justify-center gap-2 px-4 text-ui font-semibold text-primary outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:justify-start sm:px-5"
      >
        +ещё {hiddenCount} {pluralize(hiddenCount, ["людишка", "людишки", "людишек"])}
        <ChevronDownIcon aria-hidden className="size-4" />
      </button>
    </li>
  );
}
