"use server";

import { revalidatePath } from "next/cache";

import { groupNameSchema } from "@/lib/group-schema";
import {
  createGroup as insertGroup,
  deleteGroup as removeGroup,
  listGroups,
  renameGroup as updateGroupName,
  type GroupItem,
} from "@/lib/groups";
import { parseId } from "@/lib/ids";

// The "Группы" window. Every answer except a rejected name brings the fresh list of
// groups, so the window shows the truth even after "not-found" (deleted in another tab).

export type GroupFieldErrors = { name: string };

// The groups of the main page and the labels in open cards change with any group edit.
function revalidateGroups() {
  revalidatePath("/");
  revalidatePath("/contacts/[id]", "page");
}

// The name's own message, or the one for a name another group already has.
function checkName(input: unknown): { name: string } | { error: string } {
  const parsed = groupNameSchema.safeParse(input);
  return parsed.success
    ? { name: parsed.data }
    : { error: parsed.error.issues[0]?.message ?? "Проверьте название группы" };
}

const DUPLICATE_NAME_MESSAGE = "Такая группа уже есть";

export type CreateGroupResult =
  { status: "saved"; groups: GroupItem[] } | { status: "invalid"; fieldErrors: GroupFieldErrors };

export async function createGroup(input: unknown): Promise<CreateGroupResult> {
  const checked = checkName(input);
  if ("error" in checked) {
    return { status: "invalid", fieldErrors: { name: checked.error } };
  }

  const result = await insertGroup(checked.name);
  if (result.status === "duplicate") {
    return { status: "invalid", fieldErrors: { name: DUPLICATE_NAME_MESSAGE } };
  }

  revalidateGroups();
  return { status: "saved", groups: await listGroups() };
}

export type RenameGroupResult =
  | { status: "saved"; groups: GroupItem[] }
  | { status: "invalid"; fieldErrors: GroupFieldErrors }
  | { status: "not-found"; groups: GroupItem[] };

export async function renameGroup(id: unknown, input: unknown): Promise<RenameGroupResult> {
  const checked = checkName(input);
  if ("error" in checked) {
    return { status: "invalid", fieldErrors: { name: checked.error } };
  }

  const groupId = parseId(id);
  const result =
    groupId === null
      ? { status: "not-found" as const }
      : await updateGroupName(groupId, checked.name);
  if (result.status === "duplicate") {
    return { status: "invalid", fieldErrors: { name: DUPLICATE_NAME_MESSAGE } };
  }

  revalidateGroups();
  return {
    status: result.status === "renamed" ? "saved" : "not-found",
    groups: await listGroups(),
  };
}

export type DeleteGroupResult =
  { status: "deleted"; groups: GroupItem[] } | { status: "not-found"; groups: GroupItem[] };

export async function deleteGroup(id: unknown): Promise<DeleteGroupResult> {
  const groupId = parseId(id);
  const result = groupId === null ? { status: "not-found" as const } : await removeGroup(groupId);

  revalidateGroups();
  return { status: result.status, groups: await listGroups() };
}
