import Link from "next/link";

import { CatConfused } from "@/components/cat-confused";
import { buttonVariants } from "@/components/ui/button";

// Replaces the whole contact page, so it brings the page column itself.
export default function ContactNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <div className="mt-10 flex flex-col items-center rounded-card border bg-card px-6 py-12 text-center">
        <CatConfused />
        <p className="mt-4 font-display text-xl">Контакт не найден</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Возможно, ссылка неверная или контакт удалили.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          К списку контактов
        </Link>
      </div>
    </main>
  );
}
