import { useSyncExternalStore } from "react";

// The list view the card was opened from (/?q=петров&page=2&size=100), kept per tab,
// so "Весь список" and deletion return to the same page, search and size.
const STORAGE_KEY = "contact-list-href";
const FIRST_PAGE = "/";

// Storage may be blocked (strict private mode): then the card leads to the first page.
export function rememberListHref(href: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    // Not remembered: "Весь список" opens the first page.
  }
}

export function readListHref(): string {
  try {
    const href = sessionStorage.getItem(STORAGE_KEY);
    // Only a path of this site, never another origin ("//host").
    return href?.startsWith("/") && !href.startsWith("//") ? href : FIRST_PAGE;
  } catch {
    return FIRST_PAGE;
  }
}

// The value changes only on the list page, where nobody reads it, so there is nothing to subscribe to.
const subscribe = () => () => {};

// On the server and during hydration the link points to the first page;
// right after hydration it switches to the remembered view.
export function useListHref(): string {
  return useSyncExternalStore(subscribe, readListHref, () => FIRST_PAGE);
}
