"use client";

import { ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CatConfused } from "@/components/cat-confused";
import { ContactAvatar } from "@/components/contact-avatar";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { ContactListItem } from "@/lib/contacts";
import { pluralize } from "@/lib/format";
import { matchesAllWords, normalizeForSearch, toSearchWords } from "@/lib/search";
import { cn } from "@/lib/utils";

type LetterGroup = { letter: string; contacts: ContactListItem[] };

function getGroupLetter(name: string): string {
  const first = (Array.from(name.trim())[0] ?? "").toUpperCase();
  if (first === "Ё") return "Е";
  return /\p{L}/u.test(first) ? first : "#";
}

// Contacts arrive sorted by name, so each letter is one contiguous run.
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

// The whole list comes from the server; search filters it right on the page,
// so results appear as you type.
export function ContactDirectory({
  contacts,
  highlightId,
}: {
  contacts: ContactListItem[];
  highlightId: number | null;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  // A just-added contact must be visible, so drop any search left from before.
  const [shownHighlightId, setShownHighlightId] = useState(highlightId);
  if (highlightId !== shownHighlightId) {
    setShownHighlightId(highlightId);
    if (highlightId !== null) setQuery("");
  }

  useEffect(() => {
    if (highlightId !== null) {
      document
        .getElementById(`contact-${highlightId}`)
        ?.scrollIntoView({ block: "center" });
    }
  }, [highlightId]);

  const normalizedNames = useMemo(
    () => contacts.map((contact) => normalizeForSearch(contact.name)),
    [contacts],
  );

  const words = useMemo(() => toSearchWords(deferredQuery), [deferredQuery]);
  const isSearching = words.length > 0;

  const visibleContacts = useMemo(
    () =>
      isSearching
        ? contacts.filter((_, index) =>
            matchesAllWords(normalizedNames[index], words),
          )
        : contacts,
    [contacts, normalizedNames, words, isSearching],
  );

  const groups = useMemo(
    () =>
      isSearching
        ? [{ letter: "", contacts: visibleContacts }]
        : groupByLetter(visibleContacts),
    [isSearching, visibleContacts],
  );

  function clearSearch() {
    setQuery("");
    inputRef.current?.focus();
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-card border bg-card px-6 py-16 text-center">
        <p className="font-display text-xl">Здесь пока никого нет</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Нажмите «Добавить контакт», чтобы записать первого человека.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 pt-2 pb-3 backdrop-blur">
        <form role="search" onSubmit={(event) => event.preventDefault()}>
          <InputGroup className="h-11 bg-card">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
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
            {query && (
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
        <p className="mt-2 px-1 text-sm text-muted-foreground" aria-live="polite">
          {isSearching
            ? `Найдено: ${visibleContacts.length} из ${contacts.length}`
            : `${contacts.length} ${pluralize(contacts.length, ["контакт", "контакта", "контактов"])}`}
        </p>
      </div>

      {visibleContacts.length === 0 ? (
        <div className="flex flex-col items-center px-3 py-12 text-center">
          <CatConfused />
          <p className="mt-4 font-display text-xl">Никого не нашли</p>
          <p className="mt-1 text-sm text-muted-foreground">
            По запросу «{deferredQuery.trim()}» контактов нет. Проверьте имя
            или добавьте нового человека.
          </p>
        </div>
      ) : (
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
      )}
    </div>
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
