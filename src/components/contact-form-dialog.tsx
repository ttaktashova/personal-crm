"use client";

import { XIcon } from "lucide-react";
import { useRef, useTransition } from "react";

import { ContactForm, type ContactFormTarget } from "@/components/contact-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContactGroup } from "@/lib/groups";

// One shell for "Новый чертила" and "Редактировать контакт", so both windows
// look and behave alike. A closed window unmounts its form, so every opening
// starts from the props: saved values or empty fields.
export function ContactFormDialog({
  title,
  groups,
  open,
  onOpenChange,
  onSaved,
  ...target
}: ContactFormTarget & {
  title: string;
  groups: ContactGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: number) => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Keep the window up until saving finishes.
        if (!isPending) onOpenChange(nextOpen);
      }}
      // A stray click outside must not throw away what was typed.
      disablePointerDismissal
    >
      <DialogContent
        ref={popupRef}
        showCloseButton={false}
        // Base UI would focus the first tabbable element, which is the close button.
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>('[name="name"]') ?? true
        }
        className="max-w-135 gap-3 border-border-strong bg-muted px-4 py-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-lg sm:text-xl">{title}</DialogTitle>
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
        <ContactForm
          {...target}
          groups={groups}
          isPending={isPending}
          startTransition={startTransition}
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
