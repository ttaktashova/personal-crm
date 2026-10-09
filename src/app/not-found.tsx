import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Такой страницы нет
      </h1>
      <p className="mt-2 text-muted-foreground">
        Проверьте адрес или вернитесь к списку контактов.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        К списку контактов
      </Link>
    </main>
  );
}
