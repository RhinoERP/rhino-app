"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UsePrintTicketOptions = {
  defaultTitle?: string;
  printBodyClassName?: string;
};

type PrintTicketOptions = {
  title?: string;
};

const DEFAULT_PRINT_TITLE = "Resumen de Venta";
const DEFAULT_PRINT_CLASS_NAME = "rhino-print-ticket-mode";

export function usePrintTicket(options: UsePrintTicketOptions = {}) {
  const {
    defaultTitle = DEFAULT_PRINT_TITLE,
    printBodyClassName = DEFAULT_PRINT_CLASS_NAME,
  } = options;

  const cleanupRef = useRef<(() => void) | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const printTicket = useCallback(
    ({ title }: PrintTicketOptions = {}) => {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return;
      }

      cleanupRef.current?.();

      const previousTitle = document.title;
      const cleanTitle = (title ?? defaultTitle).trim() || defaultTitle;

      setIsPrinting(true);
      document.title = cleanTitle;
      document.body.classList.add(printBodyClassName);

      let restored = false;

      const restoreDocument = () => {
        if (restored) {
          return;
        }

        restored = true;
        document.title = previousTitle;
        document.body.classList.remove(printBodyClassName);
        window.removeEventListener("afterprint", restoreDocument);
        window.clearTimeout(fallbackTimerId);
        cleanupRef.current = null;
        setIsPrinting(false);
      };

      const fallbackTimerId = window.setTimeout(restoreDocument, 3000);

      cleanupRef.current = restoreDocument;
      window.addEventListener("afterprint", restoreDocument, { once: true });

      window.requestAnimationFrame(() => {
        window.print();
      });
    },
    [defaultTitle, printBodyClassName]
  );

  useEffect(
    () => () => {
      cleanupRef.current?.();
    },
    []
  );

  return {
    isPrinting,
    printTicket,
  };
}
