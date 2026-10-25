"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ContactFormDialog } from "@/components/contact-form-dialog";
import { Button } from "@/components/ui/button";

export function NewContactDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        Добавить черта
      </Button>
      <ContactFormDialog
        title="Новый чертила"
        mode="create"
        open={open}
        onOpenChange={setOpen}
        onSaved={(id) => {
          setOpen(false);
          // The list scrolls to the new contact and highlights it.
          // Replace, not push: we are already on the main page.
          router.replace(`/?added=${id}`);
        }}
      />
    </>
  );
}
