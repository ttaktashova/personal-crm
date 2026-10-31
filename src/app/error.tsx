"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl">Не получилось загрузить данные</h1>
      <p className="mt-2 text-muted-foreground">
        Скорее всего, не запущена база данных. Запустите её командой{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">docker compose up -d</code> и
        попробуйте ещё раз.
      </p>
      <Button size="lg" className="mt-6" onClick={() => retry()}>
        Попробовать ещё раз
      </Button>
    </main>
  );
}
