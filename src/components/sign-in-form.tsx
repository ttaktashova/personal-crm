"use client";

import { Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { requestSignInLink, type RequestSignInLinkResult } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FailedStatus = Exclude<RequestSignInLinkResult["status"], "sent">;

const MESSAGES: Record<FailedStatus, string> = {
  invalid: "Проверьте адрес почты",
  "too-often": "Слишком часто, попробуйте через несколько минут",
  "send-failed": "Не удалось отправить письмо. Попробуйте ещё раз.",
};

// The form of /login. The browser's own check is off (noValidate): the server checks the
// address and every mistake gets one message under the field, with the typed text kept.
// After "sent" the message takes the place of the form.
export function SignInForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (sentTo !== null) {
    return (
      <p role="status" className="text-ui leading-relaxed break-words text-card-foreground">
        {`Ссылка для входа отправлена на ${sentTo}`}
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // Enter while the request is on its way does not send a second one.
        if (isPending) return;
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            const result = await requestSignInLink(data);
            if (result.status === "sent") setSentTo(result.email);
            else setError(MESSAGES[result.status]);
          } catch {
            setError(MESSAGES["send-failed"]);
          }
        });
      }}
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="email">Почта</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={!!error}
          aria-describedby={error ? "email-error" : undefined}
          onChange={() => setError(null)}
          className="h-11"
        />
        <FieldError id="email-error">{error}</FieldError>
      </Field>

      <Button type="submit" variant="cta" size="lg" disabled={isPending} className="mt-6 w-full">
        {isPending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
        Получить ссылку
      </Button>
    </form>
  );
}
