"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { filterGroups, suggestCreation } from "@/lib/group-match";
import type { ContactGroup } from "@/lib/groups";
import { normalizeForSearch } from "@/lib/search";

// The groups of the person in the window: chosen from the list by id, plus the names of
// the groups made here, which exist in the database only after the contact is saved.
export type GroupSelection = { groupIds: number[]; newGroupNames: string[] };

// What the list and the labels in the field are made of.
type Option =
  | { kind: "group"; key: string; name: string; id: number }
  | { kind: "new"; key: string; name: string } // made in this window, not saved yet
  | { kind: "create"; key: string; name: string; groupName: string }; // "Создать группу «…»"

// Russian alphabet with "ё" next to "е", as the server orders the groups.
const collator = new Intl.Collator("ru");
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);

const EMPTY_LIST_TEXT = "Групп пока нет. Впишите название, чтобы создать группу.";

// The "Группы" field of the contact windows: labels with crosses for the chosen groups,
// a list to choose from, narrowed by what is typed, and "Создать группу «…»" at its end
// when no group has that name. Nothing is written to the database here: the form
// sends the selection together with the contact.
export function GroupPicker({
  id,
  groups,
  selection,
  onChange,
  invalid,
}: {
  id: string;
  groups: ContactGroup[];
  selection: GroupSelection;
  onChange: (selection: GroupSelection) => void;
  invalid: boolean;
}) {
  const anchor = useComboboxAnchor();
  const [inputValue, setInputValue] = useState("");

  // Everything the field can already choose: the groups of the database and the new ones.
  const known: Option[] = [
    ...groups.map((group): Option => ({
      kind: "group",
      key: `group:${group.id}`,
      name: group.name,
      id: group.id,
    })),
    ...selection.newGroupNames.map((name): Option => ({
      kind: "new",
      key: `new:${normalizeForSearch(name)}`,
      name,
    })),
  ].sort(byName);

  // A group the person was in but that was deleted since is simply not shown, and not saved.
  const selected = known.filter((option) =>
    option.kind === "group" ? selection.groupIds.includes(option.id) : option.kind === "new",
  );

  const suggestion = suggestCreation(known, inputValue);
  const items: Option[] = [...filterGroups(known, inputValue)];
  if (suggestion.kind === "create") {
    items.push({
      kind: "create",
      key: `create:${suggestion.name}`,
      name: `Создать группу «${suggestion.name}»`,
      groupName: suggestion.name,
    });
  }

  function handleValueChange(next: Option[]) {
    const groupIds: number[] = [];
    const newGroupNames: string[] = [];
    for (const option of next) {
      if (option.kind === "group") groupIds.push(option.id);
      else if (option.kind === "new") newGroupNames.push(option.name);
      else newGroupNames.push(option.groupName);
    }
    onChange({ groupIds, newGroupNames });
    setInputValue("");
  }

  return (
    // Enter in the field picks the highlighted item and must not send the form. Only the text
    // field: Enter on a cross still presses it. Ctrl+Enter saves the contact as everywhere in
    // the form; a label in focus would swallow it, so it is caught on the way in.
    <div
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.closest("form")?.requestSubmit();
        }
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.target instanceof HTMLInputElement
        ) {
          event.preventDefault();
        }
      }}
    >
      <Combobox
        multiple
        items={items}
        // The list is narrowed here, by the same rules as the search by name.
        filter={null}
        value={selected}
        onValueChange={handleValueChange}
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        isItemEqualToValue={(a, b) => a.key === b.key}
        itemToStringLabel={(option) => option.name}
        // Typing "зна" and Enter picks "Знакомые"; typing a new name and Enter creates it.
        autoHighlight
      >
        <ComboboxChips
          ref={anchor}
          className="min-h-11 gap-1.5 rounded-xl border-input bg-background px-3 py-1.5 text-base has-data-[slot=combobox-chip]:px-1.5 md:text-sm"
        >
          <ComboboxValue>
            {(values: Option[]) => (
              <>
                {values.map((option) => (
                  <ComboboxChip
                    key={option.key}
                    removeLabel={`Убрать группу «${option.name}»`}
                    className="h-7 rounded-lg px-2 text-sm"
                  >
                    {option.name}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id={id}
                  name="groups"
                  placeholder={values.length === 0 ? "Выберите или впишите группу" : undefined}
                  autoComplete="off"
                  aria-invalid={invalid || undefined}
                  className="h-8 placeholder:text-muted-foreground"
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent
          anchor={anchor}
          className="rounded-xl border border-border-strong bg-popover"
        >
          <ComboboxEmpty className="px-3 py-2.5 text-base md:text-sm">
            {suggestion.kind === "error" ? suggestion.message : EMPTY_LIST_TEXT}
          </ComboboxEmpty>
          <ComboboxList>
            {(option: Option) => (
              <ComboboxItem
                key={option.key}
                value={option}
                className="py-2.5 pl-2.5 text-base md:py-2 md:text-sm"
              >
                {option.kind === "create" && <PlusIcon className="text-primary" />}
                <span className="min-w-0 break-words">{option.name}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
