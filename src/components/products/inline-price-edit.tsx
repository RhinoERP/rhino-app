"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InlinePriceEditProps = {
  value: number | null;
  costPrice?: number | null;
  onSave: (newValue: number) => Promise<{ success: boolean; error?: string }>;
  onDelete?: () => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  disabledReason?: string;
};

export function InlinePriceEdit({
  value,
  onSave,
  onDelete,
  disabled = false,
  disabledReason,
}: InlinePriceEditProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formattedValue =
    value != null
      ? `$ ${value.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null;

  const handleStartEdit = () => {
    if (disabled || saving) {
      return;
    }
    setInputValue(value != null ? String(value) : "");
    setEditing(true);
  };

  const handleCancel = useCallback(() => {
    setEditing(false);
    setInputValue("");
  }, []);

  const handleSave = async () => {
    const normalized = inputValue.replace(",", ".");
    const parsed = Number.parseFloat(normalized);

    if (Number.isNaN(parsed) || parsed < 0) {
      handleCancel();
      return;
    }

    if (parsed === 0 && onDelete) {
      setSaving(true);
      try {
        const result = await onDelete();
        if (!result.success) {
          return;
        }
        setEditing(false);
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const result = await onSave(parsed);
      if (result.success) {
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <Input
        className="h-7 w-28 text-xs"
        disabled={saving}
        inputMode="decimal"
        onBlur={handleSave}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        value={inputValue}
      />
    );
  }

  return (
    <button
      className={cn(
        "h-7 rounded px-1 text-left font-medium text-xs tabular-nums transition-colors",
        disabled || saving
          ? "cursor-default text-muted-foreground"
          : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
        formattedValue && "text-foreground"
      )}
      disabled={disabled || saving}
      onClick={handleStartEdit}
      title={disabled ? disabledReason : undefined}
      type="button"
    >
      {formattedValue ?? "—"}
    </button>
  );
}
