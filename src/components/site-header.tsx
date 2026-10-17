import Link from "next/link";

import { Logo } from "@/components/logo";

// Same header as on the landing: logo, product name and the "личная CRM" pill.
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4 sm:h-20">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring sm:gap-3"
        >
          <Logo className="size-8 sm:size-9" />
          <span className="font-display text-ui whitespace-nowrap sm:text-lg">
            черный список
          </span>
        </Link>
        <span className="ml-auto rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground sm:ml-4 sm:text-caption">
          личная CRM
        </span>
      </div>
    </header>
  );
}
