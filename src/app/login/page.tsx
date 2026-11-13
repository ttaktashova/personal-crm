import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

// The sign-in page: every page of the app leads here without a sign-in (src/proxy.ts and
// requireUser). After the link from the email the main page opens, whatever was asked before.
export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-10 pb-16 sm:pt-16">
      <Suspense fallback={null}>
        <LeaveIfSignedIn />
      </Suspense>
      <h1 className="font-display text-3xl sm:text-4xl">Вход</h1>
      <div className="mt-6 rounded-card border bg-card px-5 py-6 sm:px-7">
        <SignInForm />
      </div>
    </main>
  );
}

// Already signed in on this device: the main page instead.
async function LeaveIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}
