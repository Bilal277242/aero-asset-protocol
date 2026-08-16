"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Wide modals are for tables and transaction summaries, not for prose. */
    size?: "sm" | "md" | "lg";
  }
>(({ className, children, size = "md", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40 backdrop-blur-[1px]" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2",
        "animate-scale-in rounded-lg border border-rule bg-raised shadow-modal",
        // A three-row grid — header, body, footer — so only the body scrolls. When the
        // whole dialog scrolled, a long transaction summary pushed the confirm button
        // off the bottom on a phone, which is precisely the control you must not lose
        // sight of mid-transaction.
        //
        // `dvh` rather than `vh`: mobile browsers count `vh` against the viewport with
        // the address bar hidden, so a `100vh`-tall modal is taller than what the user
        // can actually see until they scroll.
        "grid max-h-[calc(100dvh-32px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
        size === "sm" && "tablet:max-w-[380px]",
        size === "md" && "tablet:max-w-[520px]",
        size === "lg" && "tablet:max-w-[760px]",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-3 top-3 rounded p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
        aria-label="Close"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-rule-2 px-4 py-3 pr-10", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-mono text-sm font-semibold tracking-tight text-ink", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-1 text-xs leading-relaxed text-ink-2", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

/** The only scrolling region. `min-h-0` is what lets it actually shrink inside the grid. */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 overflow-y-auto px-4 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-rule-2 bg-sunken px-4 py-3",
        "tablet:flex-row tablet:justify-end",
        className,
      )}
      {...props}
    />
  );
}
