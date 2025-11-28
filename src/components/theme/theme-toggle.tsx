"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./use-theme";

/**
 * A simple theme toggle button that switches between light and dark modes.
 * Shows a sun icon in light mode and a moon icon in dark mode with smooth transitions.
 */
export function ThemeToggle() {
  const { toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <Button disabled size="icon" variant="outline">
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button onClick={toggleTheme} size="icon" variant="outline">
      <Sun className="dark:-rotate-90 h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
