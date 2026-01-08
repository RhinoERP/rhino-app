"use client";

import Image from "next/image";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function AppLogo() {
  return (
    <div className="group/logo flex items-center gap-2">
      <div className="relative flex-1 group-data-[collapsible=icon]:flex-none">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-20 p-0 hover:bg-sidebar group-data-[collapsible=icon]:justify-center"
              size="lg"
            >
              <div className="flex h-20 w-full shrink-0 items-center justify-start px-3">
                <Image
                  alt="Rhino"
                  className="h-40 w-80 object-contain object-left transition-opacity"
                  height={160}
                  src="/images/sidebar_logo.svg"
                  width={320}
                />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 opacity-0 transition-opacity group-data-[collapsible=icon]:group-hover/logo:pointer-events-auto group-data-[collapsible=icon]:group-hover/logo:opacity-100">
          <SidebarTrigger className="size-8" />
        </div>
      </div>
      <div className="group-data-[collapsible=icon]:hidden">
        <SidebarTrigger className="-ml-1" />
      </div>
    </div>
  );
}
