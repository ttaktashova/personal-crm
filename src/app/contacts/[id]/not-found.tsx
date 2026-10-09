import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed px-6 py-16 text-center">
      <p className="font-medium">Контакт не найден</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Возможно, ссылка неверная или контакт удалили.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        К списку контактов
      </Link>
    </div>
  );
}
