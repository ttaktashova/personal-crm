import Link from "next/link";

import { CatConfused } from "@/components/cat-confused";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 text-center">
      <CatConfused className="h-32 w-45" />
      <h1 className="mt-6 font-display text-3xl">Такой страницы нет</h1>
      <p className="mt-2 text-muted-foreground">
        Проверьте адрес или вернитесь к списку контактов.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        К списку контактов
      </Link>
    </main>
  );
}
