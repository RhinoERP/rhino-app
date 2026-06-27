"use client";

import { LockIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
};

type NavCategory = {
  title: string;
  items: NavItem[];
};

type NavMainProps = {
  categories: NavCategory[];
};

export function NavMain({ categories }: NavMainProps) {
  const pathname = usePathname();

  return (
    <>
      {categories.map((category) => (
        <SidebarGroup key={category.title}>
          <SidebarGroupLabel>{category.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {category.items.map((item) => {
                const isActive = pathname === item.url;

                if (item.comingSoon || item.disabled) {
                  const tooltip = item.comingSoon
                    ? `${item.title} - Próximamente`
                    : (item.disabledTooltip ?? `${item.title} - Inhabilitado`);
                  const badgeLabel = item.comingSoon
                    ? "Próximamente"
                    : "Inhabilitado";

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        className="cursor-not-allowed opacity-50"
                        disabled
                        tooltip={tooltip}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="opacity-60">{item.icon}</span>
                          <span className="flex-1 opacity-60">
                            {item.title}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className="h-4 bg-muted/50 px-1.5 py-0 text-[10px] text-muted-foreground/70"
                              variant="secondary"
                            >
                              {badgeLabel}
                            </Badge>
                            <LockIcon
                              className="h-3.5 w-3.5 text-muted-foreground/50"
                              weight="duotone"
                            />
                          </div>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        {item.icon}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
