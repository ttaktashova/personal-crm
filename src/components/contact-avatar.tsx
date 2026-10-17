import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

// As in the landing's phone mock: quiet circles, red for the one to look at.
export function ContactAvatar({
  name,
  tone = "default",
  className,
}: {
  name: string;
  tone?: "default" | "accent";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm select-none",
        tone === "accent"
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
