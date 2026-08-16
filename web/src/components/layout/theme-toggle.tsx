"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "light" | "dark" | "system";

/**
 * Theme control.
 *
 * Three states, not two: "system" is the default and must stay reachable, because a user
 * who set their OS to dark at sunset expects this to follow. `next-themes` would do this
 * in one import; it is about forty lines of state and one inline script, and this app has
 * a reason to keep its dependency list short.
 *
 * The flash-of-wrong-theme is prevented by `themeScript` in the document head, which runs
 * before first paint.
 */
export const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('aa-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("system");

  React.useEffect(() => {
    const stored = (localStorage.getItem("aa-theme") as Theme | null) ?? "system";
    setTheme(stored);
  }, []);

  // Only "system" should track the OS; an explicit choice must survive sunset.
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    localStorage.setItem("aa-theme", next);
    apply(next);
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => choose("light")}>
          <Sun className="size-3.5" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("dark")}>
          <Moon className="size-3.5" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("system")}>
          <Monitor className="size-3.5" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
