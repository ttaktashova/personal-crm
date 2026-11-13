import type { Metadata } from "next";
import Link from "next/link";

import { CatConfused } from "@/components/cat-confused";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ссылка устарела" };

// Where a link from an email leads when it does not let in: used already, older than
// 15 minutes, turned off by a newer one or broken. Better Auth gives all of them one code
// (?error=INVALID_TOKEN), so the page is the same for any.
export default function ExpiredLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 text-center">
      <CatConfused className="h-32 w-45" />
      <h1 className="mt-6 font-display text-3xl">Ссылка устарела, запросите новую</h1>
      <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-6" })}>
        Получить новую ссылку
      </Link>
    </main>
  );
}
