"use client";

import { ContactFormDialog } from "@/components/contact-form-dialog";
import type { ContactFormInitialValues } from "@/lib/contact-schema";
import type { ContactGroup } from "@/lib/groups";

// The card refreshes itself: the update action revalidates the contact page.
export function EditContactDialog({
  contactId,
  values,
  groups,
  open,
  onOpenChange,
}: {
  contactId: number;
  values: ContactFormInitialValues;
  groups: ContactGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ContactFormDialog
      title="Редактировать контакт"
      groups={groups}
      mode="edit"
      contactId={contactId}
      initialValues={values}
      open={open}
      onOpenChange={onOpenChange}
      onSaved={() => onOpenChange(false)}
    />
  );
}
