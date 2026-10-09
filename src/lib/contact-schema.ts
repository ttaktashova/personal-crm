import { z } from "zod";

// Shared by the form (instant feedback) and the server actions (source of truth).
// Messages are user-facing, hence in Russian.
const emailFormat = z.email();

export const contactInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(200, "Слишком длинное имя: не больше 200 символов"),
  howWeMet: z
    .string()
    .trim()
    .max(500, "Слишком длинно: не больше 500 символов"),
  phone: z
    .string()
    .trim()
    .max(50, "Слишком длинный номер: не больше 50 символов")
    .regex(
      /^[\d\s()+\-.]*$/,
      "В номере могут быть только цифры, пробелы и символы + ( ) - .",
    ),
  email: z
    .string()
    .trim()
    .max(254, "Слишком длинный адрес: не больше 254 символов")
    .refine(
      (value) => value === "" || emailFormat.safeParse(value).success,
      "Проверьте адрес почты: похоже, в нём ошибка",
    ),
  notes: z
    .string()
    .trim()
    .max(50_000, "Слишком длинные заметки: не больше 50 000 символов"),
});

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactField = keyof ContactInput;
export type ContactFieldErrors = Partial<Record<ContactField, string>>;

export function toFieldErrors(error: z.ZodError<ContactInput>): ContactFieldErrors {
  const { fieldErrors } = z.flattenError(error);
  const result: ContactFieldErrors = {};
  for (const field of Object.keys(fieldErrors) as ContactField[]) {
    const message = fieldErrors[field]?.[0];
    if (message) {
      result[field] = message;
    }
  }
  return result;
}
