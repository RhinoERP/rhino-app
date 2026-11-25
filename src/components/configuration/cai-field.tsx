"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CaiUiResult = { success: true } | { success: false; error: string };

export function CaiField({
  label,
  description,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...props}
        aria-describedby={description ? `${id}-help` : undefined}
        id={id}
      />
      {description && (
        <p className="text-muted-foreground text-xs" id={`${id}-help`}>
          {description}
        </p>
      )}
    </div>
  );
}
