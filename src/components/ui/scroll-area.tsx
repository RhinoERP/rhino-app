import type * as React from "react";
import { cn } from "@/lib/utils";

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement>;

export function ScrollArea({ className, children, ...props }: ScrollAreaProps) {
  return (
    <div className={cn("overflow-y-auto", className)} {...props}>
      {children}
    </div>
  );
}
