"use client";

import { Loader2Icon } from "lucide-react";
import { useRef, useState, type TransitionStartFunction } from "react";
import { toast } from "sonner";

import { createContact, updateContact } from "@/app/contacts/actions";
import { GroupPicker, type GroupSelection } from "@/components/group-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_FREQUENCIES,
  CONTACT_FREQUENCY_LABELS,
  NO_FREQUENCY_LABEL,
} from "@/lib/contact-frequency";
import {
  contactInputSchema,
  toFieldErrors,
  type ContactField,
  type ContactFieldErrors,
  type ContactFormInitialValues,
  type ContactFormValues,
} from "@/lib/contact-schema";
import type { ContactGroup } from "@/lib/groups";

const EMPTY_CONTACT: ContactFormInitialValues = {
  name: "",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
  contactFrequency: null,
  groupIds: [],
};

function readForm(form: HTMLFormElement, groups: GroupSelection): ContactFormValues {
  const data = new FormData(form);
  const text = (field: keyof ContactFormValues) => String(data.get(field) ?? "");
  return {
    name: text("name"),
    howWeMet: text("howWeMet"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    // Checked by the schema: anything but a listed value is rejected.
    contactFrequency: text("contactFrequency") as ContactFormValues["contactFrequency"],
    ...groups,
  };
}

// The null item is "Не задано": the select shows its label and submits "".
const FREQUENCY_ITEMS = [
  { label: NO_FREQUENCY_LABEL, value: null },
  ...CONTACT_FREQUENCIES.map((value) => ({
    label: CONTACT_FREQUENCY_LABELS[value],
    value,
  })),
];

export type ContactFormTarget =
  { mode: "create" } | { mode: "edit"; contactId: number; initialValues: ContactFormInitialValues };

type ContactFormProps = ContactFormTarget & {
  // All the groups there are: the field "Группы" chooses from them.
  groups: ContactGroup[];
  // The dialog around the form owns the transition, so it can stay open while saving.
  isPending: boolean;
  startTransition: TransitionStartFunction;
  onSaved: (id: number) => void;
  onCancel: () => void;
};

export function ContactForm(props: ContactFormProps) {
  const { isPending, startTransition } = props;
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<ContactFieldErrors>({});

  const initialValues = props.mode === "edit" ? props.initialValues : EMPTY_CONTACT;
  const [groupSelection, setGroupSelection] = useState<GroupSelection>({
    groupIds: initialValues.groupIds,
    newGroupNames: [],
  });

  function focusFirstInvalid(fieldErrors: ContactFieldErrors) {
    const firstField = Object.keys(fieldErrors)[0];
    if (firstField) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const form = event.currentTarget;
    const values = readForm(form, groupSelection);

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
        toast.success(
          props.mode === "create" ? `Контакт «${check.data.name}» добавлен` : "Изменения сохранены",
        );
        props.onSaved(result.id);
      } catch {
        toast.error(
          "Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.",
        );
      }
    });
  }

  function clearError(field: ContactField) {
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
      onKeyDown={(event) => {
        // Ctrl+Enter (Cmd+Enter on Mac) saves from any field, including notes.
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
      noValidate
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Имя</FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={initialValues.name}
            placeholder="Например: Анна Смирнова"
            autoComplete="off"
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

        <Field data-invalid={!!errors.groups}>
          <FieldLabel htmlFor="groups">Группы</FieldLabel>
          <GroupPicker
            id="groups"
            groups={props.groups}
            selection={groupSelection}
            onChange={(selection) => {
              setGroupSelection(selection);
              clearError("groups");
            }}
            invalid={!!errors.groups}
          />
          <FieldError>{errors.groups}</FieldError>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
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

        <Field data-invalid={!!errors.contactFrequency}>
          <FieldLabel htmlFor="contactFrequency">Как часто припоминать</FieldLabel>
          <Select
            name="contactFrequency"
            items={FREQUENCY_ITEMS}
            defaultValue={initialValues.contactFrequency}
            onValueChange={() => clearError("contactFrequency")}
          >
            {/* Looks like the text fields around it. Base UI marks the null item as
                a placeholder, but "Не задано" is a value, so it keeps the text color. */}
            <SelectTrigger
              id="contactFrequency"
              aria-invalid={!!errors.contactFrequency}
              className="w-full rounded-xl bg-background px-3 text-base data-placeholder:text-foreground data-[size=default]:h-11 md:text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_ITEMS.map((item) => (
                <SelectItem
                  key={item.label}
                  value={item.value}
                  className="py-2.5 pl-2.5 text-base md:py-2 md:text-sm"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errors.contactFrequency}</FieldError>
        </Field>

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="notes">Заметки</FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={initialValues.notes}
            placeholder="Что натворил, что обещал, что припомнить"
            aria-invalid={!!errors.notes}
            onChange={() => clearError("notes")}
            className="min-h-36 leading-relaxed"
          />
          <FieldError>{errors.notes}</FieldError>
        </Field>
      </FieldGroup>

      <div className="mt-6 flex items-center gap-3">
        <Button
          type="submit"
          variant="cta"
          size="lg"
          disabled={isPending}
          className="flex-1 sm:flex-none"
        >
          {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
          {props.mode === "create" ? "Добавить черта" : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={isPending}
          onClick={props.onCancel}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
