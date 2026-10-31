import { groupNameSchema } from "@/lib/group-schema";
import { normalizeForSearch } from "@/lib/search";

// The logic of the "Группы" field of the contact window, apart from the component:
// which groups the typed text leaves in the list, and whether the list offers
// "Создать группу «…»". Same rules as the search by name: no case, "ё" as "е".

// The groups that have the typed text in their name, in the order they came in.
// An empty field leaves all of them.
export function filterGroups<T extends { name: string }>(groups: T[], text: string): T[] {
  const needle = normalizeForSearch(text.trim());
  if (needle === "") return groups;
  return groups.filter((group) => normalizeForSearch(group.name).includes(needle));
}

export type CreateSuggestion =
  | { kind: "none" } // nothing to offer: an empty field, or the group already exists
  | { kind: "create"; name: string } // "Создать группу «name»"
  | { kind: "error"; message: string }; // the text cannot be a name: it is shown instead of the offer

// `groups` are everything the field can already choose: the groups of the database and the
// new ones picked in this window. A name that equals one of them, without case and with
// "ё" as "е", is not offered again: the list shows that group.
export function suggestCreation(groups: { name: string }[], text: string): CreateSuggestion {
  const typed = text.trim();
  if (typed === "") return { kind: "none" };

  const key = normalizeForSearch(typed);
  if (groups.some((group) => normalizeForSearch(group.name) === key)) return { kind: "none" };

  const checked = groupNameSchema.safeParse(typed);
  if (!checked.success) {
    return {
      kind: "error",
      message: checked.error.issues[0]?.message ?? "Проверьте название группы",
    };
  }
  return { kind: "create", name: checked.data };
}
