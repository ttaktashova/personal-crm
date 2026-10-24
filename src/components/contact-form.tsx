"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createContact, updateContact } from "@/app/contacts/actions";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  contactInputSchema,
  toFieldErrors,
  type ContactFieldErrors,
  type ContactInput,
} from "@/lib/contact-schema";

const EMPTY_CONTACT: ContactInput = {
  name: "",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
};

function readForm(form: HTMLFormElement): ContactInput {
  const data = new FormData(form);
  const text = (field: keyof ContactInput) => String(data.get(field) ?? "");
  return {
    name: text("name"),
    howWeMet: text("howWeMet"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
  };
}

type ContactFormProps =
  | { mode: "create" }
  | { mode: "edit"; contactId: number; initialValues: ContactInput };

export function ContactForm(props: ContactFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialValues = props.mode === "edit" ? props.initialValues : EMPTY_CONTACT;

  function focusFirstInvalid(fieldErrors: ContactFieldErrors) {
    const firstField = Object.keys(fieldErrors)[0];
    if (firstField) {
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${firstField}"]`)
        ?.focus();
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const form = event.currentTarget;
    const values = readForm(form);

    const check = contactInputSchema.safeParse(values);
    if (!check.success) {
      const fieldErrors = toFieldErrors(check.error);
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }

    startTransition(async () => {
      try {
        const result =
          props.mode === "create"
            ? await createContact(values)
            : await updateContact(props.contactId, values);

        if (result.status === "invalid") {
          setErrors(result.fieldErrors);
          focusFirstInvalid(result.fieldErrors);
          return;
        }

        if (result.status === "not-found") {
          toast.error("Этот контакт не найден. Возможно, его удалили.");
          return;
        }

        setErrors({});
        setIsDirty(false);

        if (props.mode === "create") {
          form.reset();
          toast.success(`Контакт «${check.data.name}» добавлен`);
          router.push(`/?added=${result.id}`);
        } else {
          toast.success("Изменения сохранены");
        }
      } catch {
        toast.error("Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.");
      }
    });
  }

  function clearError(field: keyof ContactInput) {
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={() => setIsDirty(true)}
      onKeyDown={(event) => {
        // Ctrl+Enter (Cmd+Enter on Mac) saves from any field, including notes.
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
      noValidate
    >
      <FieldGroup className="rounded-card border bg-card p-5 sm:p-7">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Имя</FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={initialValues.name}
            placeholder="Например: Анна Смирнова"
            autoComplete="off"
            autoFocus={props.mode === "create"}
            aria-invalid={!!errors.name}
            aria-required
            onChange={() => clearError("name")}
            className="h-11"
          />
          <FieldError>{errors.name}</FieldError>
        </Field>

        <Field data-invalid={!!errors.howWeMet}>
          <FieldLabel htmlFor="howWeMet">Откуда знакомы</FieldLabel>
          <Input
            id="howWeMet"
            name="howWeMet"
            defaultValue={initialValues.howWeMet}
            placeholder="Например: учились вместе в университете"
            autoComplete="off"
            aria-invalid={!!errors.howWeMet}
            onChange={() => clearError("howWeMet")}
            className="h-11"
          />
          <FieldError>{errors.howWeMet}</FieldError>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="phone">Телефон</FieldLabel>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={initialValues.phone}
              placeholder="+7 900 123-45-67"
              autoComplete="off"
              aria-invalid={!!errors.phone}
              onChange={() => clearError("phone")}
              className="h-11"
            />
            <FieldError>{errors.phone}</FieldError>
          </Field>

          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Почта</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              defaultValue={initialValues.email}
              placeholder="name@example.com"
              autoComplete="off"
              aria-invalid={!!errors.email}
              onChange={() => clearError("email")}
              className="h-11"
            />
            <FieldError>{errors.email}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="notes">Заметки</FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={initialValues.notes}
            placeholder="О чём говорили, о чём договорились"
            aria-invalid={!!errors.notes}
            onChange={() => clearError("notes")}
            className="min-h-48 leading-relaxed"
          />
          <FieldError>{errors.notes}</FieldError>
        </Field>
      </FieldGroup>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="cta" size="lg" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
          {props.mode === "create" ? "Добавить черта" : "Сохранить"}
        </Button>
        {props.mode === "create" ? (
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Отмена
          </Link>
        ) : (
          <>
            {isDirty && !isPending && (
              <span className="text-sm text-muted-foreground">
                Есть несохранённые изменения
              </span>
            )}
            <DeleteContactButton
              contactId={props.contactId}
              name={props.initialValues.name}
              className="ml-auto"
            />
          </>
        )}
      </div>
    </form>
  );
}
