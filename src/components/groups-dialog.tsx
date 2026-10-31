"use client";

import {
  ArrowLeftIcon,
  Loader2Icon,
  PencilIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type TransitionStartFunction,
} from "react";
import { toast } from "sonner";

import { createGroup, deleteGroup, renameGroup } from "@/app/contacts/group-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatContactCount } from "@/lib/format";
import { groupNameSchema } from "@/lib/group-schema";
import type { GroupItem } from "@/lib/groups";

// 44×44 for a finger on a phone, 36×36 on a computer, as the icons next to the name of a contact.
const ICON_BUTTON_CLASS = "sm:size-9 sm:rounded-lg";

const NOT_FOUND_MESSAGE = "Эта группа не найдена. Возможно, её удалили.";
const SERVER_DOWN_MESSAGE =
  "Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.";

type View =
  | { name: "list" }
  | { name: "rename"; group: GroupItem }
  | { name: "confirm-delete"; group: GroupItem };

type ViewProps = {
  groups: GroupItem[];
  onGroupsChange: (groups: GroupItem[]) => void;
  isPending: boolean;
  startTransition: TransitionStartFunction;
};

// The "Группы" button and its window. Renaming and the delete confirmation replace the
// list inside this one window instead of opening windows on top of it. A closed window
// unmounts its content, so every opening starts from the list.
export function GroupsDialog({ groups: groupsFromPage }: { groups: GroupItem[] }) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // The page sends the groups; every answer of an action brings fresher ones, which show at once.
  // A new list from the page replaces what the window showed.
  const [groups, setGroups] = useState(groupsFromPage);
  const [seenFromPage, setSeenFromPage] = useState(groupsFromPage);
  if (groupsFromPage !== seenFromPage) {
    setSeenFromPage(groupsFromPage);
    setGroups(groupsFromPage);
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
        className="shrink-0 sm:h-9 sm:px-3.5"
      >
        <TagsIcon data-icon="inline-start" />
        Группы
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          // Keep the window up until saving or deleting finishes.
          if (!isPending) setOpen(nextOpen);
        }}
        // A stray click outside must not throw away what was typed.
        disablePointerDismissal
      >
        <DialogContent
          ref={popupRef}
          showCloseButton={false}
          initialFocus={() =>
            popupRef.current?.querySelector<HTMLElement>("[data-view-heading]") ?? true
          }
          // The popup fits the screen, so a long list scrolls inside the window under its header.
          className="flex max-h-[calc(100dvh-(--spacing(12)))] max-w-135 flex-col gap-0 border-border-strong bg-muted px-4 py-5 sm:max-h-[calc(100dvh-(--spacing(32)))] sm:p-6"
        >
          <TooltipProvider>
            <GroupViews
              groups={groups}
              onGroupsChange={setGroups}
              isPending={isPending}
              startTransition={startTransition}
            />
          </TooltipProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GroupViews(props: ViewProps) {
  const [view, setView] = useState<View>({ name: "list" });
  const showList = () => setView({ name: "list" });

  switch (view.name) {
    case "list":
      return (
        <ListView
          {...props}
          onRename={(group) => setView({ name: "rename", group })}
          onDelete={(group) => setView({ name: "confirm-delete", group })}
        />
      );
    case "rename":
      return <RenameView {...props} group={view.group} onDone={showList} />;
    case "confirm-delete":
      return <ConfirmDeleteView {...props} group={view.group} onDone={showList} />;
  }
}

// Each view takes focus when it replaces the previous one, so a screen reader announces it.
function useFocusOnMount(ref: React.RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [ref, enabled]);
}

function ViewHeader({
  title,
  titleId,
  onBack,
  isPending = false,
  focusTitle = true,
}: {
  title: string;
  titleId?: string;
  onBack?: () => void;
  isPending?: boolean;
  focusTitle?: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(titleRef, focusTitle);

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      {onBack && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Назад к группам"
                disabled={isPending}
                onClick={onBack}
                className="text-muted-foreground sm:size-9"
              />
            }
          >
            <ArrowLeftIcon className="size-5 sm:size-4.5" />
          </TooltipTrigger>
          <TooltipContent>Назад к группам</TooltipContent>
        </Tooltip>
      )}
      <DialogTitle
        ref={titleRef}
        id={titleId}
        tabIndex={-1}
        data-view-heading
        className="min-w-0 flex-1 text-lg outline-none sm:text-xl"
      >
        {title}
      </DialogTitle>
      <DialogClose
        disabled={isPending}
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Закрыть"
            className="text-muted-foreground sm:size-9"
          />
        }
      >
        <XIcon className="size-5 sm:size-4.5" />
      </DialogClose>
    </div>
  );
}

// The first message of the name check, or null when the name is fine.
function nameError(value: string): string | null {
  const result = groupNameSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

function ListView({
  groups,
  onGroupsChange,
  isPending,
  startTransition,
  onRename,
  onDelete,
}: ViewProps & {
  onRename: (group: GroupItem) => void;
  onDelete: (group: GroupItem) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const problem = nameError(name);
    if (problem) {
      setError(problem);
      return;
    }

    startTransition(async () => {
      try {
        const result = await createGroup(name);
        if (result.status === "invalid") {
          setError(result.fieldErrors.name);
          return;
        }
        onGroupsChange(result.groups);
        setName("");
        setError(null);
      } catch {
        toast.error(SERVER_DOWN_MESSAGE);
      }
    });
  }

  return (
    <>
      <ViewHeader title="Группы" />
      <form onSubmit={handleAdd} noValidate className="mt-3 shrink-0 sm:mt-4">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={inputId}>Новая группа</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="Например: Сквош"
              autoComplete="off"
              aria-invalid={!!error}
              className="h-11"
            />
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
              Добавить
            </Button>
          </div>
          <FieldError>{error}</FieldError>
        </Field>
      </form>
      {groups.length === 0 ? (
        <p className="mt-4 text-ui text-muted-foreground italic">Групп пока нет</p>
      ) : (
        // Side padding keeps the focus outline of the icon buttons inside the scroll area.
        <ul
          aria-label="Список групп"
          className="-mx-1.5 mt-3.5 min-h-0 overflow-y-auto px-1.5 sm:mt-4.5"
        >
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center gap-3 border-t border-border-strong py-2.5 sm:py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold break-words text-foreground">{group.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatContactCount(group.contactCount)}
                </p>
              </div>
              <span className="flex shrink-0 gap-2 sm:gap-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon-lg"
                        aria-label={`Переименовать группу «${group.name}»`}
                        onClick={() => onRename(group)}
                        className={ICON_BUTTON_CLASS}
                      />
                    }
                  >
                    <PencilIcon className="size-4.5 sm:size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Переименовать</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="destructive"
                        size="icon-lg"
                        aria-label={`Удалить группу «${group.name}»`}
                        onClick={() => onDelete(group)}
                        className={ICON_BUTTON_CLASS}
                      />
                    }
                  >
                    <Trash2Icon className="size-4.5 sm:size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Удалить группу</TooltipContent>
                </Tooltip>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RenameView({
  group,
  onGroupsChange,
  isPending,
  startTransition,
  onDone,
}: ViewProps & { group: GroupItem; onDone: () => void }) {
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const problem = nameError(name);
    if (problem) {
      setError(problem);
      return;
    }

    startTransition(async () => {
      try {
        const result = await renameGroup(group.id, name);
        if (result.status === "invalid") {
          setError(result.fieldErrors.name);
          return;
        }
        if (result.status === "not-found") toast.error(NOT_FOUND_MESSAGE);
        onGroupsChange(result.groups);
        onDone();
      } catch {
        toast.error(SERVER_DOWN_MESSAGE);
      }
    });
  }

  return (
    <>
      <ViewHeader title="Переименовать группу" onBack={onDone} isPending={isPending} />
      <form
        onSubmit={handleSave}
        noValidate
        className="-mx-1.5 mt-3 min-h-0 overflow-y-auto px-1.5 pb-1.5"
      >
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={inputId}>Название</FieldLabel>
          <Input
            id={inputId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            autoComplete="off"
            aria-invalid={!!error}
            className="h-11"
          />
          <FieldError>{error}</FieldError>
        </Field>
        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" variant="cta" size="lg" disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
            Сохранить
          </Button>
          <Button type="button" variant="ghost" size="lg" disabled={isPending} onClick={onDone}>
            Отмена
          </Button>
        </div>
      </form>
    </>
  );
}

function ConfirmDeleteView({
  group,
  onGroupsChange,
  isPending,
  startTransition,
  onDone,
}: ViewProps & { group: GroupItem; onDone: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  // Focus starts on "Отмена", so a stray Enter deletes nothing.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusOnMount(cancelRef);

  function handleDelete() {
    if (isPending) return;

    startTransition(async () => {
      try {
        const result = await deleteGroup(group.id);
        if (result.status === "not-found") toast.error(NOT_FOUND_MESSAGE);
        onGroupsChange(result.groups);
        onDone();
      } catch {
        toast.error("Не удалось удалить. Проверьте, что приложение запущено, и попробуйте ещё раз.");
      }
    });
  }

  return (
    // Focus lands on a button, so the group gives a screen reader the question and the explanation.
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex min-h-0 flex-col"
    >
      <ViewHeader title="Удалить группу?" titleId={titleId} isPending={isPending} focusTitle={false} />
      <div className="-mx-1.5 min-h-0 overflow-y-auto px-1.5 pb-1.5">
        <p
          id={descriptionId}
          className="mt-3.5 text-base break-words text-card-foreground sm:text-ui"
        >
          Группа «{group.name}» удалится. Люди из неё останутся, у них пропадёт только эта группа.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            ref={cancelRef}
            variant="outline"
            size="lg"
            disabled={isPending}
            onClick={onDone}
          >
            Отмена
          </Button>
          <Button variant="destructive" size="lg" disabled={isPending} onClick={handleDelete}>
            {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
            Удалить
          </Button>
        </div>
      </div>
    </div>
  );
}
