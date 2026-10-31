"use client";

import { XIcon } from "lucide-react";
import { useRef, useTransition } from "react";

import { InteractionForm } from "@/components/interaction-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

// The "Отомстил" window from the card section. Looks and behaves like the contact
// windows. A closed window unmounts its form, so every opening starts from today's
// date and an empty text. The card refreshes itself: the action revalidates the page.
export function InteractionDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
        // The date is already today, so the text is what is left to fill in.
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>('[name="summary"]') ?? true
        }
        className="max-w-115 gap-3 border-border-strong bg-muted px-4 py-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-lg sm:text-xl">Отомстил</DialogTitle>
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
        <InteractionForm
          mode="add"
          contactId={contactId}
          isPending={isPending}
          startTransition={startTransition}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
