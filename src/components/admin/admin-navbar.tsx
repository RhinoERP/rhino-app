"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { SignOutIcon } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

type AdminNavbarProps = {
  userEmail?: string;
};

export function AdminNavbar({ userEmail }: AdminNavbarProps) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5">
        {/* Logo on Left */}
        <div className="flex items-center">
          <Image
            alt="Rhino Logo"
            className="h-32 w-auto"
            height={32}
            src="/images/sidebar_logo.svg"
            width={32}
          />
        </div>

        {/* Logout Button on Right */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2" variant="ghost">
              <CaretDownIcon className="h-4 w-4" weight="duotone" />
              <span className="font-medium text-sm">{userEmail || "User"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex flex-col">
                <p className="font-medium text-sm">{userEmail || "User"}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <button
              className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={logout}
              type="button"
            >
              <SignOutIcon className="h-4 w-4" weight="duotone" />
              <span>Cerrar sesión</span>
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
