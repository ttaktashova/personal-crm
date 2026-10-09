// Lowercase and treat "ё" as "е", so "Алёна" is found by "алена" and vice versa.
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е");
}

// Splits a query into words; a name matches when it contains every word,
// in any order: "петров ив" finds "Иван Петров".
export function toSearchWords(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean);
}

export function matchesAllWords(normalizedName: string, words: string[]): boolean {
  return words.every((word) => normalizedName.includes(word));
}
