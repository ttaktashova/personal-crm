import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <div className="pt-6 sm:pt-10">
        <BackLink />
      </div>
      <h1 className="mt-4 mb-6 font-display text-3xl sm:text-4xl">
        Новый контакт
      </h1>
      <ContactForm mode="create" />
    </main>
  );
}
