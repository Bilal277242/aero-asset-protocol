"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils/cn";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // A rule the active tab sits on, not a pill container. Closer to a tabbed
      // technical index than to app chrome.
      "flex gap-0 overflow-x-auto border-b border-rule",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { count?: number }
>(({ className, children, count, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-ink-2",
      "transition-colors hover:text-ink",
      "data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-ink",
      className,
    )}
    {...props}
  >
    {children}
    {count !== undefined && (
      <span className="ml-1.5 font-mono text-2xs text-ink-3">{count}</span>
    )}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("pt-4", className)} {...props} />
));
TabsContent.displayName = "TabsContent";
