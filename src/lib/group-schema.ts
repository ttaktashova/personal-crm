import { z } from "zod";

// The name of a group: one rule for the contact form, the "Группы" window and the server
// actions. Messages are user-facing, hence in Russian.
export const MAX_GROUP_NAME_LENGTH = 50;

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите название группы")
  .max(
    MAX_GROUP_NAME_LENGTH,
    `Слишком длинное название: не больше ${MAX_GROUP_NAME_LENGTH} символов`,
  );
