"use client";

import { ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";

import { CatConfused } from "@/components/cat-confused";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactPagination } from "@/components/contact-pagination";
import { PageSizePicker } from "@/components/page-size-picker";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { ContactListItem } from "@/lib/contacts";
import { formatContactCount } from "@/lib/format";
import { splitGroupBadges } from "@/lib/group-badges";
import type { GroupItem } from "@/lib/groups";
import { rememberListHref } from "@/lib/list-return";
import { buildListHref, type PageSize } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// The URL follows the search field this long after the last key.
const SEARCH_DELAY_MS = 300;

// The groups of a person in a row of the list: this many labels, the rest as "+2".
const MAX_GROUP_BADGES = 3;

type LetterGroup = { letter: string; contacts: ContactListItem[] };

function getGroupLetter(name: string): string {
  const first = (Array.from(name.trim())[0] ?? "").toUpperCase();
  if (first === "Ё") return "Е";
  return /\p{L}/u.test(first) ? first : "#";
}

// Contacts arrive sorted by name, so each letter is one contiguous run.
// A page that starts in the middle of a letter starts with that letter's heading.
function groupByLetter(contacts: ContactListItem[]): LetterGroup[] {
  const groups: LetterGroup[] = [];
  for (const contact of contacts) {
    const letter = getGroupLetter(contact.name);
    const last = groups.at(-1);
    if (last?.letter === letter) {
      last.contacts.push(contact);
    } else {
      groups.push({ letter, contacts: [contact] });
    }
  }
  return groups;
}

// One page of the list comes from the server; the group, the page, the search and the size
// live in the URL (?group=, ?page=, ?q=, ?size=). The field shows letters as they are typed,
// and the URL follows a moment later, so the server searches all contacts.
export function ContactDirectory({
  contacts,
  totalCount,
  matchedCount,
  allCount,
  group,
  page,
  pageCount,
  pageSize,
  query,
  highlightId,
}: {
  contacts: ContactListItem[];
  totalCount: number; // the people of the chosen group, or everybody
  matchedCount: number;
  allCount: number; // all contacts: no contacts at all is not the same as an empty group
  group: GroupItem | null;
  page: number;
  pageCount: number;
  pageSize: PageSize;
  query: string;
  highlightId: number | null;
}) {
  const router = useRouter();
  const groupId = group?.id ?? null;
  const [isPending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // What the field shows, and the search last sent to the URL.
  const [inputValue, setInputValue] = useState(query);
  const [sentQuery, setSentQuery] = useState(query);

  // The search in the URL changed not by typing (Back, "Весь список", a new contact):
  // the field follows the URL. A reply to our own typing leaves the field alone,
  // so letters typed in the meantime stay.
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    if (query !== sentQuery) {
      setInputValue(query);
      setSentQuery(query);
    }
  }

  // The card's "Весь список" and deletion come back to this view; a just-added
  // contact (?added=) is not part of it.
  useEffect(() => {
    rememberListHref(buildListHref({ group: groupId, q: query, page, size: pageSize }));
  }, [groupId, query, page, pageSize]);

  useEffect(() => {
    if (highlightId !== null) {
      document
        .getElementById(`contact-${highlightId}`)
        ?.scrollIntoView({ block: "center" });
    }
  }, [highlightId]);

  // A transition keeps the old page on screen, dimmed, until the new one arrives.
  function navigate(href: string, history: "push" | "replace" = "push") {
    startTransition(() => {
      router[history](href, { scroll: false });
    });
  }

  // Page switcher and size picker: the search row goes to the top of the screen,
  // not the top of the main page with "Пора мстить".
  function showPage(href: string) {
    topRef.current?.scrollIntoView({ block: "start" });
    navigate(href);
  }

  // The first letters start a search: a new history entry. Later edits replace it,
  // so Back returns to where the search started instead of going letter by letter.
  const sendSearch = useEffectEvent((text: string) => {
    navigate(
      buildListHref({ group: groupId, q: text, page: 1, size: pageSize }),
      sentQuery ? "replace" : "push",
    );
    setSentQuery(text);
  });

  useEffect(() => {
    const text = inputValue.trim();
    if (text === sentQuery) return;
    const timer = setTimeout(() => sendSearch(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [inputValue, sentQuery]);

  // The cross and Esc clear at once, without the pause, keeping the group and the page size.
  function clearSearch() {
    setInputValue("");
    inputRef.current?.focus();
    if (sentQuery) {
      setSentQuery("");
      navigate(buildListHref({ group: groupId, page: 1, size: pageSize }));
    }
  }

  // No page switcher and no size picker here: there is nothing to switch.
  if (allCount === 0) {
    return (
      <div className="rounded-card border bg-card px-6 py-16 text-center">
        <p className="font-display text-xl">Здесь пока никого нет</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Нажмите «Добавить черта», чтобы записать первого человека.
        </p>
      </div>
    );
  }

  if (group && totalCount === 0) {
    return (
      <div className="rounded-card border bg-card px-6 py-16 text-center">
        <p className="font-display text-xl break-words">
          В группе «{group.name}» пока никого нет
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Добавьте человека в группу в окне «Редактировать контакт».
        </p>
      </div>
    );
  }

  const isSearching = query !== "";
  const groups = isSearching
    ? [{ letter: "", contacts }]
    : groupByLetter(contacts);

  return (
    <div ref={topRef}>
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 pt-2 pb-3 backdrop-blur">
        <form role="search" onSubmit={(event) => event.preventDefault()}>
          <InputGroup className="h-11 bg-card">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && inputValue) {
                  event.preventDefault();
                  clearSearch();
                }
              }}
              placeholder="Найти по имени"
              aria-label="Поиск по имени"
              autoComplete="off"
              enterKeyHint="search"
              className="text-base"
            />
            {inputValue && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  onClick={clearSearch}
                  aria-label="Очистить поиск"
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </form>
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isSearching
              ? `Найдено: ${matchedCount} из ${totalCount}`
              : formatContactCount(totalCount)}
          </p>
          <PageSizePicker
            group={groupId}
            page={page}
            pageSize={pageSize}
            query={query}
            matchedCount={matchedCount}
            onNavigate={showPage}
          />
        </div>
      </div>

      <div
        aria-busy={isPending || undefined}
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        {matchedCount === 0 ? (
          <div className="flex flex-col items-center px-3 py-12 text-center">
            <CatConfused />
            <p className="mt-4 font-display text-xl">Никого не нашли</p>
            <p className="mt-1 text-sm text-muted-foreground">
              По запросу «{query}» контактов нет. Проверьте имя или добавьте
              нового человека.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {groups.map((group, index) => (
                <section key={`${group.letter}-${index}`}>
                  {group.letter && (
                    <h2 className="px-1 pb-2 font-display text-lg leading-none text-primary">
                      {group.letter}
                    </h2>
                  )}
                  <ul className="divide-y overflow-hidden rounded-card border bg-card">
                    {group.contacts.map((contact) => (
                      <ContactRow
                        key={contact.id}
                        contact={contact}
                        isNew={contact.id === highlightId}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <ContactPagination
              group={groupId}
              page={page}
              pageCount={pageCount}
              query={query}
              pageSize={pageSize}
              onNavigate={showPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

// A separate row under "Откуда знакомы", only for a person who has groups. A long name is cut
// with an ellipsis and shown in full on hover; the row never grows wider than the screen.
function GroupBadges({ groups }: { groups: ContactListItem["groups"] }) {
  const { visible, hiddenCount } = splitGroupBadges(groups, MAX_GROUP_BADGES);
  if (visible.length === 0) return null;

  return (
    <ul aria-label="Группы" className="mt-1 flex flex-nowrap items-center gap-1 overflow-hidden">
      {visible.map((group) => (
        <li key={group.id} className="flex min-w-0 shrink">
          {/* The badge does not shrink by default; here a long name has to give way. */}
          <Badge variant="outline" title={group.name} className="max-w-40 min-w-0 shrink! text-caption">
            <span className="truncate">{group.name}</span>
          </Badge>
        </li>
      ))}
      {hiddenCount > 0 && (
        <li className="shrink-0">
          <Badge
            variant="secondary"
            title={groups
              .slice(MAX_GROUP_BADGES)
              .map((group) => group.name)
              .join(", ")}
          >
            +{hiddenCount}
          </Badge>
        </li>
      )}
    </ul>
  );
}

function ContactRow({
  contact,
  isNew,
}: {
  contact: ContactListItem;
  isNew: boolean;
}) {
  return (
    <li id={`contact-${contact.id}`}>
      <Link
        href={`/contacts/${contact.id}`}
        className={cn(
          "flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
          isNew && "bg-muted",
        )}
      >
        <ContactAvatar name={contact.name} tone={isNew ? "accent" : "default"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{contact.name}</span>
            {isNew && (
              <Badge
                variant="outline"
                className="border-primary bg-transparent text-primary"
              >
                Новый
              </Badge>
            )}
          </div>
          {contact.howWeMet && (
            <p className="truncate text-sm text-muted-foreground">
              {contact.howWeMet}
            </p>
          )}
          <GroupBadges groups={contact.groups} />
        </div>
        <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
          {contact.phone && <p className="tabular-nums">{contact.phone}</p>}
          {contact.email && (
            <p className="max-w-60 truncate">{contact.email}</p>
          )}
        </div>
        <ChevronRightIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </Link>
    </li>
  );
}
