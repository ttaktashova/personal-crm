import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/sign-out-action";
import { Logo } from "@/components/logo";
import { SessionRefresh } from "@/components/session-refresh";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// Logo and product name on the left; the landing keeps its own copy. On the right, for a
// signed-in user, the address and «Выйти»; the sign-in page has the logo only.
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:h-20 sm:gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring sm:gap-3"
        >
          <Logo className="size-8 sm:size-9" />
          <span className="font-display text-ui whitespace-nowrap sm:text-lg">черный список</span>
        </Link>
        <Suspense fallback={null}>
          <AccountMenu />
        </Suspense>
      </div>
    </header>
  );
}

// A long address is cut with an ellipsis; «Выйти» always stays whole.
async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
      <span className="min-w-0 truncate text-sm text-muted-foreground sm:text-ui">
        {user.email}
      </span>
      <form action={signOut} className="shrink-0">
        {/* 44px tall on a phone, 36px on a computer, like the other controls. */}
        <Button type="submit" variant="outline" className="h-11 sm:h-9">
          Выйти
        </Button>
      </form>
      <SessionRefresh />
    </div>
  );
}
