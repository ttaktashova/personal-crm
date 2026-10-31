"use client";

import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { DeleteContactButton } from "@/components/delete-contact-button";
import { EditContactDialog } from "@/components/edit-contact-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ContactFormInitialValues } from "@/lib/contact-schema";
import type { ContactGroup } from "@/lib/groups";
import { cn } from "@/lib/utils";

// 44×44 for a finger on a phone, 36×36 next to the name on a computer.
const ACTION_BUTTON_CLASS = "sm:size-9 sm:rounded-lg";

export function ContactCardActions({
  contactId,
  values,
  groups,
  className,
}: {
  contactId: number;
  values: ContactFormInitialValues;
  groups: ContactGroup[];
  className?: string;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className={cn("flex gap-2 sm:gap-1.5", className)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Редактировать"
                className={ACTION_BUTTON_CLASS}
                onClick={() => setIsEditOpen(true)}
              />
            }
          >
            <PencilIcon className="size-4.5 sm:size-4" />
          </TooltipTrigger>
          <TooltipContent>Редактировать</TooltipContent>
        </Tooltip>
        <DeleteContactButton
          contactId={contactId}
          name={values.name}
          className={ACTION_BUTTON_CLASS}
        />
      </div>
      <EditContactDialog
        contactId={contactId}
        values={values}
        groups={groups}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </TooltipProvider>
  );
}
