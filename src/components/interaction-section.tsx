"use client";

import { useRef, useState } from "react";

import { InteractionDialog } from "@/components/interaction-dialog";
import { InteractionHistoryDialog } from "@/components/interaction-history-dialog";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import type { InteractionItem } from "@/lib/interactions";

// "Последняя месть" in the card: the last record, "Вся история" and "Отомстил".
// Records come newest first; the actions revalidate the page, so new props arrive after each change.
export function InteractionSection({
  contactId,
  interactions,
}: {
  contactId: number;
  interactions: InteractionItem[];
}) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const historyLinkRef = useRef<HTMLButtonElement>(null);

  const last = interactions.at(0);

  return (
    <div className="flex flex-col gap-3">
      {last ? (
        // Records copied from notes may span several lines.
        <p className="break-words whitespace-pre-wrap text-foreground">
          <span className="font-semibold tabular-nums">{formatShortDate(last.occurredOn)}</span>{" "}
          {last.summary}
        </p>
      ) : (
        <p className="text-muted-foreground italic">Пока не мстили</p>
      )}
      {/* Phone: "Отомстил" first. Computer: "Вся история" first. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-5">
        <Button
          ref={addButtonRef}
          variant="outline"
          size="lg"
          onClick={() => setIsAddOpen(true)}
          className="px-4.5 sm:order-last sm:h-9 sm:rounded-lg sm:px-3.5 sm:text-caption"
        >
          Отомстил
        </Button>
        {last && (
          <button
            ref={historyLinkRef}
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-3 hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring sm:min-h-0"
          >
            Вся история
          </button>
        )}
      </div>

      <InteractionDialog
        contactId={contactId}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
      />
      <InteractionHistoryDialog
        contactId={contactId}
        interactions={interactions}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        finalFocus={() => historyLinkRef.current ?? addButtonRef.current ?? true}
      />
    </div>
  );
}
