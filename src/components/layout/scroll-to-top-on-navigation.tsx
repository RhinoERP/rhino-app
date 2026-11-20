"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function shouldResetScroll(
  previousPathname: string,
  pathname: string,
  hash: string
): boolean {
  return pathname !== previousPathname && !hash;
}

export function ScrollToTopOnNavigation() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const reset = shouldResetScroll(
      previousPathname.current,
      pathname,
      window.location.hash
    );
    previousPathname.current = pathname;

    // Leave deliberate section links alone; only reset when changing screens.
    if (!reset) {
      return;
    }
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
