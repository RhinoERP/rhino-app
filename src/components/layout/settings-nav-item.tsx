"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type SettingsNavItemProps = {
  orgSlug: string;
};

export function SettingsNavItem({ orgSlug }: SettingsNavItemProps) {
  const pathname = usePathname();
  const settingsUrl = `/org/${orgSlug}/settings`;
  const isActive =
    pathname === settingsUrl || pathname.startsWith(`${settingsUrl}/`);

  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip="Configuración"
            >
              <Link href={settingsUrl}>
                <Settings />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
