"use client";

import { useTheme as useNextTheme } from "next-themes";
import { useEffect, useState } from "react";

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return {
    theme,
    setTheme,
    resolvedTheme,
    mounted,
    isDark: mounted ? resolvedTheme === "dark" : false,
    isLight: mounted ? resolvedTheme === "light" : true, // Default to light
    toggleTheme: () => {
      if (resolvedTheme === "light") {
        setTheme("dark");
      } else {
        setTheme("light");
      }
    },
  };
}
