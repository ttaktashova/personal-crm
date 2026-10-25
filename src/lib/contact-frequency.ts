// How often the owner wants to be reminded of a contact. Shared by the database schema,
// the form, the card and the main page. Labels are user-facing, hence in Russian.
export const CONTACT_FREQUENCIES = ["week", "month", "quarter", "year"] as const;

export type ContactFrequency = (typeof CONTACT_FREQUENCIES)[number];

export const CONTACT_FREQUENCY_LABELS: Record<ContactFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};

// No frequency (NULL in the database, "" in the form): the contact is never due.
export const NO_FREQUENCY_LABEL = "Не задано";

export function formatContactFrequency(frequency: ContactFrequency | null): string {
  return frequency === null ? NO_FREQUENCY_LABEL : CONTACT_FREQUENCY_LABELS[frequency];
}
