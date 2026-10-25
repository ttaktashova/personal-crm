"use client";

import { ContactFormDialog } from "@/components/contact-form-dialog";
import type { ContactInput } from "@/lib/contact-schema";

// The card refreshes itself: the update action revalidates the contact page.
export function EditContactDialog({
  contactId,
  values,
  open,
  onOpenChange,
}: {
  contactId: number;
  values: ContactInput;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ContactFormDialog
      title="Редактировать контакт"
      mode="edit"
      contactId={contactId}
      initialValues={values}
      open={open}
      onOpenChange={onOpenChange}
      onSaved={() => onOpenChange(false)}
    />
  );
}
