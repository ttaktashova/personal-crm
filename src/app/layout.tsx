import type { Metadata } from "next";
import { Dela_Gothic_One, Golos_Text } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const golosText = Golos_Text({
  variable: "--font-golos-text",
  subsets: ["latin", "cyrillic"],
});

const delaGothicOne = Dela_Gothic_One({
  variable: "--font-dela-gothic-one",
  weight: "400",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Черный список",
    template: "%s · Черный список",
  },
  description: "Черный список: личная CRM для мести",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${golosText.variable} ${delaGothicOne.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
