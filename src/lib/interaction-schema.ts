import { z } from "zod";

import { todayIsoDate } from "@/lib/dates";

// Shared by the form (instant feedback) and the server actions (source of truth).
// Messages are user-facing, hence in Russian.
export const DEFAULT_INTERACTION_SUMMARY = "Отомстил";

const MAX_SUMMARY_LENGTH = 2000;

// "YYYY-MM-DD" that exists in the calendar: 2026-02-31 does not.
function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const interactionInputSchema = z.object({
  // A browser date field gives "" for an incomplete or impossible date, so both read as missing.
  occurredOn: z
    .string()
    .trim()
    .refine(isRealIsoDate, { error: "Укажите дату", abort: true })
    // "Today" is computed on every check: the server runs for longer than a day.
    .refine((value) => value <= todayIsoDate(), {
      error: "Дата не может быть позже сегодняшней",
    }),
  summary: z
    .string()
    .trim()
    .max(MAX_SUMMARY_LENGTH, "Слишком длинно: не больше 2000 символов")
    .transform((value) => value || DEFAULT_INTERACTION_SUMMARY),
});

export type InteractionInput = z.input<typeof interactionInputSchema>;
export type InteractionField = keyof InteractionInput;
export type InteractionFieldErrors = Partial<Record<InteractionField, string>>;

export function toFieldErrors(
  error: z.ZodError<z.output<typeof interactionInputSchema>>,
): InteractionFieldErrors {
  const { fieldErrors } = z.flattenError(error);
  const result: InteractionFieldErrors = {};
  for (const field of Object.keys(fieldErrors) as InteractionField[]) {
    const message = fieldErrors[field]?.[0];
    if (message) {
      result[field] = message;
    }
  }
  return result;
}
