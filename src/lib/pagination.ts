// Pages of the contact list: allowed sizes, URL values and links.
// Used both on the server (page.tsx) and in the browser (switcher, size picker).

import { parseId } from "@/lib/ids";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

// The size the owner picked last in this browser. Only the number, no personal data.
export const PAGE_SIZE_COOKIE = "contact-list-size";

type SearchParamValue = string | string[] | undefined;

// A repeated parameter (?page=2&page=3) arrives as an array: the first one wins.
export function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// "abc", "0" or "-3" mean the first page. A number past the last page is clamped
// by the list query, so it opens the last page.
export function parsePage(value: SearchParamValue): number {
  const text = firstValue(value);
  if (text === undefined || !/^\d+$/.test(text)) return 1;
  const page = Number(text);
  if (page < 1) return 1;
  return Math.min(page, Number.MAX_SAFE_INTEGER);
}

// Only 25, 50 or 100; anything else is ignored, so the remembered size or 50 applies.
export function parsePageSize(value: SearchParamValue): PageSize | null {
  const text = firstValue(value);
  return PAGE_SIZES.find((allowed) => String(allowed) === text) ?? null;
}

// The size in the address wins, then the one remembered in this browser (its cookie value), then 50.
export function resolvePageSize(
  param: SearchParamValue,
  rememberedValue: string | undefined,
): PageSize {
  return parsePageSize(param) ?? parsePageSize(rememberedValue) ?? DEFAULT_PAGE_SIZE;
}

// The first contact of the current page stays on screen after the size changes:
// page 3 by 50 (contacts 101–150) is page 5 by 25 and page 2 by 100.
export function pageForSizeChange(page: number, oldSize: number, newSize: number): number {
  return Math.floor(((page - 1) * oldSize) / newSize) + 1;
}

export type PageItem = number | "ellipsis";

// Page numbers for the switcher: the first, the last, the current one and `siblings`
// on each side of it. A gap of one number shows that number, not an ellipsis:
// "1 2 3 … 20", not "1 … 3 … 20".
export function getPageItems(current: number, pageCount: number, siblings: number): PageItem[] {
  const shown = new Set([1, pageCount]);
  for (let page = current - siblings; page <= current + siblings; page++) {
    if (page >= 1 && page <= pageCount) shown.add(page);
  }

  const items: PageItem[] = [];
  let previous = 0;
  for (const page of [...shown].sort((a, b) => a - b)) {
    if (page - previous === 2) items.push(previous + 1);
    else if (page - previous > 2) items.push("ellipsis");
    items.push(page);
    previous = page;
  }
  return items;
}

// The group of ?group=3: its id if such a group exists, otherwise null, which means "Все".
// A missing parameter, a word, a number that is not an id and a deleted group all give null,
// so an old bookmark opens the whole list instead of an error.
export function resolveGroupFilter(
  value: SearchParamValue,
  groups: { id: number }[],
): number | null {
  const id = parseId(firstValue(value));
  return id !== null && groups.some((group) => group.id === id) ? id : null;
}

// The one place that builds list URLs: /?group=3&q=петров&page=2&size=100.
// Defaults stay out of the URL: no group at "Все", no page on the first one,
// no size at 50, no empty search.
export function buildListHref({
  group,
  q,
  page,
  size,
}: {
  group?: number | null;
  q?: string;
  page: number;
  size: PageSize;
}): string {
  const params = new URLSearchParams();
  if (group != null) params.set("group", String(group));
  const query = q?.trim();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (size !== DEFAULT_PAGE_SIZE) params.set("size", String(size));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}
