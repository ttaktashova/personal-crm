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
        // Replace, not push: Back must not lead to the deleted contact.
        router.replace("/");
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
      <AlertDialogTrigger
        render={<Button variant="destructive" size="lg" className={className} />}
      >
        <Trash2Icon data-icon="inline-start" />
        Удалить
      </AlertDialogTrigger>
      {/* Focus starts on "Cancel", so a stray Enter deletes nothing. */}
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить контакт?</AlertDialogTitle>
          <AlertDialogDescription>
            Контакт «{name}» и заметки о нём удалятся насовсем. Вернуть их
            будет нельзя.
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
