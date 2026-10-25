"use client";

import {
  ArrowLeftIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type TransitionStartFunction,
} from "react";
import { toast } from "sonner";

import { deleteInteraction } from "@/app/contacts/interaction-actions";
import { InteractionForm } from "@/components/interaction-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatShortDate } from "@/lib/format";
import type { InteractionItem } from "@/lib/interactions";

// 44×44 for a finger on a phone, 36×36 on a computer, as the icons next to the name.
const ICON_BUTTON_CLASS = "sm:size-9 sm:rounded-lg";

type View =
  | { name: "list" }
  | { name: "add" }
  | { name: "edit"; interaction: InteractionItem }
  | { name: "confirm-delete"; interaction: InteractionItem };

type ViewProps = {
  isPending: boolean;
  startTransition: TransitionStartFunction;
};

// The "История мести" window. Adding, editing and the delete confirmation replace
// the list inside this one window instead of opening windows on top of it.
// A closed window unmounts its content, so every opening starts from the list.
export function InteractionHistoryDialog({
  contactId,
  interactions,
  open,
  onOpenChange,
  finalFocus,
}: {
  contactId: number;
  interactions: InteractionItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Where focus goes on close: the "Вся история" link is gone once the last record is deleted.
  finalFocus: () => HTMLElement | boolean;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Keep the window up until saving or deleting finishes.
        if (!isPending) onOpenChange(nextOpen);
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
        finalFocus={finalFocus}
        // The popup fits the screen, so a long list scrolls inside the window under its header.
        className="flex max-h-[calc(100dvh-(--spacing(12)))] max-w-145 flex-col gap-0 border-border-strong bg-muted px-4 py-5 sm:max-h-[calc(100dvh-(--spacing(32)))] sm:p-6"
      >
        <TooltipProvider>
          <HistoryViews
            contactId={contactId}
            interactions={interactions}
            isPending={isPending}
            startTransition={startTransition}
          />
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

function HistoryViews({
  contactId,
  interactions,
  ...viewProps
}: ViewProps & { contactId: number; interactions: InteractionItem[] }) {
  const [view, setView] = useState<View>({ name: "list" });
  const showList = () => setView({ name: "list" });

  switch (view.name) {
    case "list":
      return (
        <ListView
          interactions={interactions}
          onAdd={() => setView({ name: "add" })}
          onEdit={(interaction) => setView({ name: "edit", interaction })}
          onDelete={(interaction) => setView({ name: "confirm-delete", interaction })}
        />
      );
    case "add":
      return (
        <FormView title="Отомстил" onBack={showList} isPending={viewProps.isPending}>
          <InteractionForm
            mode="add"
            contactId={contactId}
            {...viewProps}
            onSaved={showList}
            onCancel={showList}
          />
        </FormView>
      );
    case "edit":
      return (
        <FormView title="Изменить запись" onBack={showList} isPending={viewProps.isPending}>
          <InteractionForm
            mode="edit"
            interactionId={view.interaction.id}
            initialValues={{
              occurredOn: view.interaction.occurredOn,
              summary: view.interaction.summary,
            }}
            {...viewProps}
            onSaved={showList}
            onCancel={showList}
          />
        </FormView>
      );
    case "confirm-delete":
      return (
        <ConfirmDeleteView
          interaction={view.interaction}
          {...viewProps}
          onDone={showList}
        />
      );
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
                aria-label="Назад к истории"
                disabled={isPending}
                onClick={onBack}
                className="text-muted-foreground sm:size-9"
              />
            }
          >
            <ArrowLeftIcon className="size-5 sm:size-4.5" />
          </TooltipTrigger>
          <TooltipContent>Назад к истории</TooltipContent>
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

function ListView({
  interactions,
  onAdd,
  onEdit,
  onDelete,
}: {
  interactions: InteractionItem[];
  onAdd: () => void;
  onEdit: (interaction: InteractionItem) => void;
  onDelete: (interaction: InteractionItem) => void;
}) {
  return (
    <>
      <ViewHeader title="История мести" />
      <Button
        variant="outline"
        size="lg"
        onClick={onAdd}
        className="mt-2 w-full shrink-0 sm:mt-3.5 sm:h-9 sm:w-auto sm:self-start sm:rounded-lg sm:px-3.5 sm:text-caption"
      >
        Отомстил
      </Button>
      {interactions.length === 0 ? (
        <p className="mt-4 text-ui text-muted-foreground italic">Пока не мстили</p>
      ) : (
        // Side padding keeps the focus outline of the icon buttons inside the scroll area.
        <ul className="-mx-1.5 mt-3.5 min-h-0 overflow-y-auto px-1.5 sm:mt-4.5">
          {interactions.map((interaction) => {
            const date = formatShortDate(interaction.occurredOn);
            return (
              <li
                key={interaction.id}
                className="border-t border-border-strong pt-3 pb-3.5 sm:flex sm:items-start sm:gap-3.5 sm:py-3.5"
              >
                {/* Phone: the date and the icons in one row, the text below. Computer: one row. */}
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <span className="font-semibold text-foreground tabular-nums sm:order-1 sm:py-1.5 sm:whitespace-nowrap">
                    {date}
                  </span>
                  <span className="flex gap-2 sm:order-3 sm:gap-1.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="outline"
                            size="icon-lg"
                            aria-label={`Изменить запись от ${date}`}
                            onClick={() => onEdit(interaction)}
                            className={ICON_BUTTON_CLASS}
                          />
                        }
                      >
                        <PencilIcon className="size-4.5 sm:size-4" />
                      </TooltipTrigger>
                      <TooltipContent>Изменить запись</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="destructive"
                            size="icon-lg"
                            aria-label={`Удалить запись от ${date}`}
                            onClick={() => onDelete(interaction)}
                            className={ICON_BUTTON_CLASS}
                          />
                        }
                      >
                        <Trash2Icon className="size-4.5 sm:size-4" />
                      </TooltipTrigger>
                      <TooltipContent>Удалить запись</TooltipContent>
                    </Tooltip>
                  </span>
                </div>
                <p className="mt-1 text-ui break-words whitespace-pre-wrap text-card-foreground sm:order-2 sm:mt-0 sm:min-w-0 sm:flex-1 sm:py-1.5">
                  {interaction.summary}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FormView({
  title,
  onBack,
  isPending,
  children,
}: {
  title: string;
  onBack: () => void;
  isPending: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <ViewHeader title={title} onBack={onBack} isPending={isPending} />
      <div className="-mx-1.5 mt-3 min-h-0 overflow-y-auto px-1.5 pb-1.5">{children}</div>
    </>
  );
}

function ConfirmDeleteView({
  interaction,
  isPending,
  startTransition,
  onDone,
}: ViewProps & { interaction: InteractionItem; onDone: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  // Focus starts on "Отмена", so a stray Enter deletes nothing.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusOnMount(cancelRef);

  const date = formatShortDate(interaction.occurredOn);

  function handleDelete() {
    if (isPending) return;

    startTransition(async () => {
      try {
        const result = await deleteInteraction(interaction.id);
        if (result.status === "not-found") {
          // The server cannot tell which card the record was on, so the page reloads its data.
          toast.error("Эта запись не найдена. Возможно, её удалили.");
          router.refresh();
        }
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
      <ViewHeader title="Удалить запись?" titleId={titleId} isPending={isPending} focusTitle={false} />
      <div className="-mx-1.5 min-h-0 overflow-y-auto px-1.5 pb-1.5">
        <div className="mt-3 rounded-xl border border-border-strong bg-card px-3.5 py-3 text-ui sm:mt-4">
          <span className="block font-semibold text-foreground tabular-nums sm:inline">
            {date}
          </span>{" "}
          <span className="mt-0.5 block break-words whitespace-pre-wrap text-card-foreground sm:mt-0 sm:inline">
            {interaction.summary}
          </span>
        </div>
        <p id={descriptionId} className="mt-3.5 text-base text-card-foreground sm:text-ui">
          Запись от {date} удалится насовсем.
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
