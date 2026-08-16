"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Toasts.
 *
 * Used for outcomes that do not deserve a screen: a transaction confirmed, a value
 * copied. **Never** for anything a user must act on or read carefully — a failed
 * transaction gets an inline explanation with a remedy, not a message that disappears
 * after five seconds.
 *
 * `duration: null` keeps a toast until dismissed, which is the right default for
 * anything carrying a transaction hash.
 */
type ToastTone = "info" | "success" | "warning" | "error";

export type ToastInput = {
  title: string;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** Milliseconds, or null to persist until dismissed. */
  duration?: number | null;
  action?: { label: string; onClick: () => void };
};

type ToastRecord = ToastInput & { id: number };

const ToastContext = React.createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE: Record<ToastTone, { icon: React.ElementType; className: string }> = {
  info: { icon: Info, className: "text-accent" },
  success: { icon: CheckCircle2, className: "text-confirmed" },
  warning: { icon: AlertTriangle, className: "text-blocked" },
  error: { icon: XCircle, className: "text-adverse" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const next = React.useRef(0);

  const push = React.useCallback((t: ToastInput) => {
    setToasts((prev) => [...prev, { ...t, id: next.current++ }]);
  }, []);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        {toasts.map((t) => {
          const tone = TONE[t.tone ?? "info"];
          const Icon = tone.icon;
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration === null ? Infinity : (t.duration ?? 5000)}
              onOpenChange={(open) => !open && dismiss(t.id)}
              className={cn(
                "flex animate-slide-in items-start gap-2.5 rounded border border-rule bg-raised p-3 shadow-overlay",
                "data-[state=closed]:animate-fade-in",
              )}
            >
              <Icon className={cn("mt-px size-4 shrink-0", tone.className)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-medium text-ink">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 break-words text-xs text-ink-2">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
                {t.action && (
                  <ToastPrimitive.Action
                    altText={t.action.label}
                    onClick={t.action.onClick}
                    className="mt-1.5 text-xs font-medium text-accent underline underline-offset-2"
                  >
                    {t.action.label}
                  </ToastPrimitive.Action>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
              >
                <X className="size-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport
          className={cn(
            "fixed z-[60] flex w-full flex-col gap-2 p-4 outline-none",
            // Bottom on phones where the thumb is; top-right on larger screens where it
            // will not cover a primary action.
            "bottom-0 left-0 tablet:bottom-auto tablet:left-auto tablet:right-0 tablet:top-0 tablet:max-w-[380px]",
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
