"use client";

import { Button } from "@/components/ui/button";
import { secureLogout } from "@/lib/auth/secure-logout";

type LogoutButtonProps = {
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg";
};

export function LogoutButton({
  className,
  variant = "default",
  size = "default",
}: LogoutButtonProps) {
  return (
    <Button
      className={className}
      onClick={secureLogout}
      size={size}
      variant={variant}
    >
      Cerrar sesión
    </Button>
  );
}
