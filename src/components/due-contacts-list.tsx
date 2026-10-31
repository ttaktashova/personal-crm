"use client";

import { BellOffIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { stopReminders, type StopRemindersResult } from "@/app/contacts/actions";
import { markContacted, type MarkContactedResult } from "@/app/contacts/interaction-actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { pluralize } from "@/lib/format";

// Texts are ready on the server, where "today" is known.
export type DueContactItem = {
  id: number;
  name: string;
  frequency: string; // "Раз в неделю"
  due: string; // "пора со вчера" or "ещё не мстили"
};

const COLLAPSED_COUNT = 5;

// Phone: a 44×44 icon. Computer: a 36px text button, like "Отомстил" in the card.
const QUICK_BUTTON_CLASS = "sm:h-9 sm:w-auto sm:rounded-lg sm:px-3.5 sm:text-caption";

// The whole list comes from the server. The actions revalidate the main page,
// so after "Отомстил" or "Простить" a list without that contact arrives.
export function DueContactsList({ contacts }: { contacts: DueContactItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = expanded ? contacts : contacts.slice(0, COLLAPSED_COUNT);
  const hiddenCount = contacts.length - visible.length;

  // "+ещё …" disappears on click, so focus moves to the first contact it revealed.
  useEffect(() => {
    if (expanded) {
      listRef.current?.querySelectorAll<HTMLElement>("li a")[COLLAPSED_COUNT]?.focus();
    }
  }, [expanded]);

  return (
    <section
      aria-labelledby="due-contacts-title"
      className="overflow-hidden rounded-card border bg-card"
    >
      <h2
        id="due-contacts-title"
        className="px-4 pt-4 pb-2.5 font-display text-title leading-tight text-foreground sm:px-5 sm:pt-4.5 sm:pb-3 sm:text-xl"
      >
        Пора мстить
      </h2>
      <TooltipProvider>
        <ul ref={listRef}>
          {visible.map((contact) => (
            <DueContactRow key={contact.id} contact={contact} />
          ))}
          {hiddenCount > 0 && (
            <li className="border-t">
              <button
                type="button"
                aria-expanded="false"
                onClick={() => setExpanded(true)}
                className="flex h-13 w-full items-center justify-center gap-2 px-4 text-ui font-semibold text-primary outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:justify-start sm:px-5"
              >
                +ещё {hiddenCount} {pluralize(hiddenCount, ["людишка", "людишки", "людишек"])}
                <ChevronDownIcon aria-hidden className="size-4" />
              </button>
            </li>
          )}
        </ul>
      </TooltipProvider>
    </section>
  );
}

function DueContactRow({ contact }: { contact: DueContactItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: (id: number) => Promise<MarkContactedResult | StopRemindersResult>) {
    if (isPending) return;

    startTransition(async () => {
      try {
        const result = await action(contact.id);
        if (result.status === "not-found") {
          toast.error("Этот контакт не найден. Возможно, его удалили.");
          // Nothing was revalidated, so ask for a fresh list without this contact.
          router.refresh();
        }
      } catch {
        toast.error(
          "Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.",
        );
      }
    });
  }

  return (
    <li className="flex items-center gap-2.5 border-t py-2.5 pr-3 pl-4 sm:gap-4 sm:px-5 sm:py-3.5">
      <div className="min-w-0 flex-1">
        <Link
          href={`/contacts/${contact.id}`}
          className="rounded-sm font-semibold break-words text-foreground underline decoration-border-strong underline-offset-3 hover:decoration-current focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
        >
          {contact.name}
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {contact.frequency} · <span className="font-medium text-primary">{contact.due}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2.5 sm:gap-2">
        <QuickButton
          label="Отомстил"
          contactName={contact.name}
          icon={<CheckIcon strokeWidth={2.5} className="size-5 sm:hidden" />}
          disabled={isPending}
          onClick={() => run(markContacted)}
        />
        <QuickButton
          label="Простить"
          contactName={contact.name}
          variant="outline"
          icon={<BellOffIcon className="size-5 sm:hidden" />}
          disabled={isPending}
          onClick={() => run(stopReminders)}
        />
      </div>
    </li>
  );
}

// One button for both widths: the icon shows on a phone, the text from 640px.
// The tooltip helps only the icon, so it is hidden where the text is shown.
function QuickButton({
  label,
  contactName,
  variant = "default",
  icon,
  disabled,
  onClick,
}: {
  label: string;
  contactName: string;
  variant?: "default" | "outline";
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size="icon-lg"
            aria-label={`${label}: ${contactName}`}
            disabled={disabled}
            onClick={onClick}
            className={QUICK_BUTTON_CLASS}
          />
        }
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="sm:hidden">{label}</TooltipContent>
    </Tooltip>
  );
}
