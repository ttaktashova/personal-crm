import { cn } from "@/lib/utils";

// Brand mark from the landing: red tile with a cat head.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("flex-none", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M8 25 L8 9 L12.5 13 L19.5 13 L24 9 L24 25 Z"
        className="fill-primary-foreground stroke-primary-foreground"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="19" r="1.6" className="fill-primary" />
      <circle cx="19" cy="19" r="1.6" className="fill-primary" />
    </svg>
  );
}
