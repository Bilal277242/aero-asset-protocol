import { cn } from "@/lib/utils/cn";

/**
 * An indeterminate spinner.
 *
 * Deliberately a plain arc rather than anything aviation-themed. A spinning propeller
 * would be a joke the user reads a hundred times a day, and this product does not make
 * jokes about aircraft.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin text-current", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
