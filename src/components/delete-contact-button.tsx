"use client";

import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteContact } from "@/app/contacts/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readListHref } from "@/lib/list-return";

export function DeleteContactButton({
  contactId,
  name,
  className,
}: {
  contactId: number;
  name: string;
  className?: string;
}) {
  const router = useRouter();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (isPending) return;

    startTransition(async () => {
      try {
        const result = await deleteContact(contactId);

        if (result.status === "not-found") {
          toast.error("Этот контакт не найден. Возможно, его удалили.");
        } else {
          toast.success(`Контакт «${name}» удалён`);
        }
        // Back to the page of the list the card was opened from. If it was the only
        // contact on the last page, the server opens the new last page.
        // Replace, not push: Back must not lead to the deleted contact.
        router.replace(readListHref());
      } catch {
        toast.error("Не удалось удалить. Проверьте, что приложение запущено, и попробуйте ещё раз.");
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Keep the dialog up until the deletion finishes.
        if (!isPending) setOpen(nextOpen);
      }}
    >
      {/* One button is both the tooltip trigger and the dialog trigger. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <AlertDialogTrigger
              render={
                <Button
                  variant="destructive"
                  size="icon-lg"
                  aria-label="Удалить"
                  className={className}
                />
              }
            />
          }
        >
          <Trash2Icon className="size-4.5 sm:size-4" />
        </TooltipTrigger>
        <TooltipContent>Удалить</TooltipContent>
      </Tooltip>
      {/* Focus starts on "Cancel", so a stray Enter deletes nothing. */}
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить контакт?</AlertDialogTitle>
          <AlertDialogDescription>
            Контакт «{name}», заметки и история мести удалятся насовсем.
            Вернуть их будет нельзя.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} size="lg" disabled={isPending}>
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction size="lg" onClick={handleDelete} disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
