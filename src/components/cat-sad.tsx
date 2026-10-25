import { cn } from "@/lib/utils";

// Sad cat for "Пока некому мстить": the head and ears of CatConfused, eyes looking down
// from under lowered lids, a tear and a sad mouth. Decorative: the text next to it says it all.
export function CatSad({ className }: { className?: string }) {
  return (
    <svg
      viewBox="40 8 220 196"
      aria-hidden
      className={cn("h-12.5 w-14 flex-none sm:h-14.25 sm:w-16", className)}
    >
      <path
        d="M58 100 L66 22 Q68 12 78 18 L120 56 Z"
        className="fill-cat stroke-border"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M242 100 L234 22 Q232 12 222 18 L180 56 Z"
        className="fill-cat stroke-border"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M50 120 C50 72 92 52 150 52 C208 52 250 72 250 120 C250 172 208 196 150 196 C92 196 50 172 50 120 Z"
        className="fill-cat stroke-border"
        strokeWidth="4"
      />
      <path d="M72 80 L76 38 L102 60 Z" className="fill-cat-pink" />
      <path d="M228 80 L224 38 L198 60 Z" className="fill-cat-pink" />
      <circle cx="112" cy="124" r="24" className="fill-cat-eye" />
      <circle cx="188" cy="124" r="24" className="fill-cat-eye" />
      <circle cx="114" cy="134" r="11" className="fill-cat" />
      <circle cx="186" cy="134" r="11" className="fill-cat" />
      <circle cx="117" cy="130" r="3.5" className="fill-cat-glint" />
      <circle cx="189" cy="130" r="3.5" className="fill-cat-glint" />
      {/* Lowered lids, sloping down to the sides. */}
      <path d="M84 120 L142 102 L142 92 L84 92 Z" className="fill-cat" />
      <path d="M216 120 L158 102 L158 92 L216 92 Z" className="fill-cat" />
      <path
        d="M96 148 C92 156 90 160 93 163 C96 166 100 163 99 159 C98 156 97 152 96 148 Z"
        className="fill-foreground opacity-85"
      />
      <path
        d="M143 152 L157 152 L150 159 Z"
        className="fill-cat-pink stroke-cat-pink"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M136 178 Q150 168 164 178"
        fill="none"
        className="stroke-cat-pink"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
