"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SalesQuoteRequestBackButton({
  href,
  iconOnly = false,
}: {
  href: string;
  iconOnly?: boolean;
}) {
  const [isNavigating, setIsNavigating] = useState(false);
  const label = "Volver a mis cotizaciones";

  return (
    <Button
      aria-label={label}
      asChild
      size={iconOnly ? "icon" : "default"}
      title={label}
      variant="outline"
    >
      <Link
        aria-busy={isNavigating}
        href={href}
        onClick={() => setIsNavigating(true)}
      >
        {isNavigating ? (
          <>
            <Spinner className={iconOnly ? "size-4" : "mr-2"} />
            {!iconOnly && "Volviendo..."}
          </>
        ) : (
          <>
            <ArrowLeftIcon className={iconOnly ? "size-4" : "mr-2 size-4"} />
            {!iconOnly && "Volver"}
          </>
        )}
      </Link>
    </Button>
  );
}
