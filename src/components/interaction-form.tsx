"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type TransitionStartFunction } from "react";
import { toast } from "sonner";

import { addInteraction, updateInteraction } from "@/app/contacts/interaction-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayIsoDate } from "@/lib/dates";
import {
  DEFAULT_INTERACTION_SUMMARY,
  interactionInputSchema,
  toFieldErrors,
  type InteractionField,
  type InteractionFieldErrors,
  type InteractionInput,
} from "@/lib/interaction-schema";

function readForm(form: HTMLFormElement): InteractionInput {
  const data = new FormData(form);
  const text = (field: InteractionField) => String(data.get(field) ?? "");
  return {
    occurredOn: text("occurredOn"),
    summary: text("summary"),
  };
}

export type InteractionFormTarget =
  | { mode: "add"; contactId: number }
  | { mode: "edit"; interactionId: number; initialValues: InteractionInput };

type InteractionFormProps = InteractionFormTarget & {
  // The window around the form owns the transition, so it can stay open while saving.
  isPending: boolean;
  startTransition: TransitionStartFunction;
  onSaved: () => void;
  // Also called when the edited record turns out to be deleted: the form has nothing left to save.
  onCancel: () => void;
};

export function InteractionForm(props: InteractionFormProps) {
  const { isPending, startTransition } = props;
  const router = useRouter();
  const idPrefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<InteractionFieldErrors>({});
  // Moscow "today", fixed when the form opens: the default date and the latest date allowed.
  const [today] = useState(todayIsoDate);

  const initialValues: InteractionInput =
    props.mode === "edit" ? props.initialValues : { occurredOn: today, summary: "" };
  const fieldId = (field: InteractionField) => `${idPrefix}-${field}`;

  function focusFirstInvalid(fieldErrors: InteractionFieldErrors) {
    const firstField = Object.keys(fieldErrors)[0];
    if (firstField) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const values = readForm(event.currentTarget);

    const check = interactionInputSchema.safeParse(values);
    if (!check.success) {
      const fieldErrors = toFieldErrors(check.error);
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }

    startTransition(async () => {
      try {
        const result =
          props.mode === "add"
            ? await addInteraction(props.contactId, values)
            : await updateInteraction(props.interactionId, values);

        if (result.status === "invalid") {
          setErrors(result.fieldErrors);
          focusFirstInvalid(result.fieldErrors);
          return;
        }

        if (result.status === "not-found") {
          if (props.mode === "add") {
            toast.error("Этот контакт не найден. Возможно, его удалили.");
          } else {
            // The server cannot tell which card the record was on, so the page reloads its data.
            toast.error("Эта запись не найдена. Возможно, её удалили.");
            router.refresh();
            props.onCancel();
          }
          return;
        }

        setErrors({});
        props.onSaved();
      } catch {
        toast.error(
          "Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.",
        );
      }
    });
  }

  function clearError(field: InteractionField) {
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
        // Ctrl+Enter (Cmd+Enter on Mac) saves from any field, including the text.
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
      noValidate
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.occurredOn}>
          <FieldLabel htmlFor={fieldId("occurredOn")}>Дата</FieldLabel>
          <Input
            id={fieldId("occurredOn")}
            name="occurredOn"
            type="date"
            defaultValue={initialValues.occurredOn}
            // Keeps future days out of the browser calendar; the schema has the final say.
            max={today}
            aria-invalid={!!errors.occurredOn}
            aria-required
            onChange={() => clearError("occurredOn")}
            className="h-11 tabular-nums"
          />
          <FieldError>{errors.occurredOn}</FieldError>
        </Field>

        <Field data-invalid={!!errors.summary}>
          <FieldLabel htmlFor={fieldId("summary")}>Как отомстил</FieldLabel>
          <Textarea
            id={fieldId("summary")}
            name="summary"
            defaultValue={initialValues.summary}
            placeholder={DEFAULT_INTERACTION_SUMMARY}
            aria-invalid={!!errors.summary}
            onChange={() => clearError("summary")}
            className="min-h-30 leading-relaxed sm:min-h-27.5"
          />
          <FieldError>{errors.summary}</FieldError>
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
          Сохранить
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
