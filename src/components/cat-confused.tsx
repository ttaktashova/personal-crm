import { cn } from "@/lib/utils";

// Confused cat with two question marks, the same picture as in the landing's
// "Знакомо?" block. Decorative: the text next to it says what happened.
export function CatConfused({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 130 92" aria-hidden className={cn("h-23 w-32.5 flex-none", className)}>
      <g transform="translate(20 4) scale(0.42)">
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
        <circle cx="112" cy="122" r="25" className="fill-cat-eye" />
        <circle cx="188" cy="122" r="25" className="fill-cat-eye" />
        <circle cx="102" cy="112" r="12" className="fill-cat" />
        <circle cx="178" cy="112" r="12" className="fill-cat" />
        <circle cx="106" cy="107" r="4.5" className="fill-cat-glint" />
        <circle cx="182" cy="107" r="4.5" className="fill-cat-glint" />
        <path
          d="M143 150 L157 150 L150 157 Z"
          className="fill-cat-pink stroke-cat-pink"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M134 170 Q142 162 150 170 Q158 178 166 170"
          fill="none"
          className="stroke-cat-pink"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </g>
      <text
        x="4"
        y="40"
        fontSize="28"
        transform="rotate(-12 12 30)"
        className="fill-primary font-display"
      >
        ?
      </text>
      <text
        x="24"
        y="20"
        fontSize="18"
        transform="rotate(10 30 14)"
        className="fill-primary font-display"
      >
        ?
      </text>
    </svg>
  );
}
