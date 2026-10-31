// Lowercase and treat "ё" as "е", so "Алёна" is found by "алена" and vice versa.
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е");
}

// Splits a query into words; a name matches when it contains every word,
// in any order: "петров ив" finds "Иван Петров". The match itself runs in SQL
// (listContactsPage), with the same lowercase and "ё" rules.
export function toSearchWords(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean);
}

// Escapes LIKE wildcards, so a search for "%" finds only names with "%" in them.
// Backslash is the default LIKE escape character in Postgres.
export function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, "\\$&");
}
